import numpy as np
from datetime import datetime
from sqlmodel import Session, select
from typing import List, Dict, Any
import math
import pandas as pd

from ..db import engine
from ..models import Historico, Portfolio
from ..services.yfinance_service import ensure_historico_in_db
from ..crud import update_portfolio_metadata

ANNUALIZED_DAYS = 252


# -------------------------
#  CARREGA PREÇOS DO BANCO
# -------------------------
def load_price_df_from_db(tickers: List[str]):
    frames = {}
    with Session(engine) as session:
        for t in tickers:
            rows = (
                session.exec(
                    select(Historico)
                    .where(Historico.ticker == t)
                    .order_by(Historico.date)
                ).all()
            )
            if not rows:
                continue
            frames[t] = pd.Series({r.date: r.close for r in rows})

    if not frames:
        return pd.DataFrame()

    return pd.DataFrame(frames).sort_index()


# -------------------------
#   LOG-RETURNS
# -------------------------
def log_returns(price_df):
    return np.log(price_df / price_df.shift(1)).dropna()


# -------------------------
#   MÉTRICAS DO PORTFÓLIO
# -------------------------
def portfolio_metrics(weights, price_df):
    lr = log_returns(price_df)
    returns = lr.values @ weights

    mean_ann = float(np.nanmean(returns) * ANNUALIZED_DAYS)

    cov = np.cov(lr.T) if lr.shape[0] > 1 else np.zeros((len(weights), len(weights)))
    vol_ann = float(np.sqrt(weights.T @ cov @ weights) * np.sqrt(ANNUALIZED_DAYS))

    # CVaR (Expected Shortfall)
    losses = -returns
    alpha = 0.95
    var = np.quantile(losses, alpha)
    tail = losses[losses >= var]
    es = float(tail.mean()) if len(tail) > 0 else float(var)
    cvar_ann = es * math.sqrt(ANNUALIZED_DAYS)

    return {
        "ret": mean_ann,
        "vol": vol_ann,
        "cvar": cvar_ann,
        "series": returns,
    }


# -------------------------
#     GA SIMPLES
# -------------------------
def run_ga(price_df, pop_size=80, generations=80):
    n = price_df.shape[1]
    pop = [np.random.dirichlet(np.ones(n)) for _ in range(pop_size)]
    archive = []

    for _ in range(generations):
        scores = [
            tuple(
                map(
                    float,
                    list(portfolio_metrics(ind, price_df).values())[:3]
                )
            )
            for ind in pop
        ]

        for ind, sc in zip(pop, scores):
            archive.append({"weights": ind.copy(), "objectives": sc})

        # torneio + crossover
        new_pop = []
        for _ in range(pop_size // 2):
            p1, p2 = pop[np.random.randint(pop_size)], pop[np.random.randint(pop_size)]
            beta = np.random.rand()

            c1 = beta * p1 + (1 - beta) * p2
            c2 = beta * p2 + (1 - beta) * p1

            # mutação
            if np.random.rand() < 0.2:
                c1 = np.clip(c1 + np.random.normal(0, 0.05, size=n), 0, None)
            if np.random.rand() < 0.2:
                c2 = np.clip(c2 + np.random.normal(0, 0.05, size=n), 0, None)

            c1 /= c1.sum()
            c2 /= c2.sum()

            new_pop.extend([c1, c2])

        pop = new_pop[:pop_size]

    # filtra não-dominados (Pareto simples)
    objs = np.array([a["objectives"] for a in archive])
    nondom = []
    for i, o in enumerate(objs):
        dominated = False
        for j, oj in enumerate(objs):
            if i == j:
                continue
            if all(oj <= o) and any(oj < o):
                dominated = True
                break
        if not dominated:
            nondom.append(archive[i])

    if not nondom:
        nondom = archive[:10]

    # escolhe melhor pela soma normalizada
    arr = np.array([x["objectives"] for x in nondom])
    mn, mx = arr.min(axis=0), arr.max(axis=0)
    denom = (mx - mn)
    denom[denom == 0] = 1

    norm = (arr - mn) / denom
    idx = int(np.argmin(norm.sum(axis=1)))

    best = nondom[idx]

    return {"fronteira": nondom, "best": best}


# -------------------------
#     FUNÇÃO PRINCIPAL
# -------------------------
def optimize(tickers: List[str], persist=False, persist_portfolio_id: int = None):
    # Garante histórico no banco
    for t in tickers:
        ensure_historico_in_db(t)

    # Carrega preços do banco
    price_df = load_price_df_from_db(tickers)
    if price_df.empty:
        raise Exception("Nenhum dado encontrado para os tickers informados.")

    # Treino: últimos 4 anos exceto último ano
    now = pd.Timestamp.now()
    end_train = pd.Timestamp(year=now.year - 1, month=now.month, day=now.day)
    start_train = end_train - pd.DateOffset(years=4)

    proj_end = now
    proj_start = now - pd.DateOffset(months=4)

    train_df = price_df.loc[(price_df.index >= start_train) & (price_df.index <= end_train)].dropna(axis=1)
    proj_df = price_df.loc[(price_df.index >= proj_start) & (price_df.index <= proj_end)].dropna(axis=1)

    if train_df.shape[1] == 0:
        raise Exception("Dados insuficientes para treinamento do GA.")

    result = run_ga(train_df)

    weights = result["best"]["weights"]

    # projeta retorno futuro
    proj_lr = log_returns(proj_df) if not proj_df.empty else None
    series_proj = (
        (proj_lr.values @ weights).tolist()
        if proj_lr is not None and proj_lr.shape[0] > 1
        else []
    )

    response = {
        "tickers": tickers,
        "best_weights": {tickers[i]: float(weights[i]) for i in range(len(tickers))},
        "fronteira": [{"objectives": f["objectives"]} for f in result["fronteira"]],
        "series_proj": series_proj,
    }

    # Persiste resultado no portfólio
    if persist and persist_portfolio_id:
        with Session(engine) as session:
            cur = session.get(Portfolio, persist_portfolio_id)
            if cur:
                meta = cur.meta or {}
                meta["last_optimization"] = response
                update_portfolio_metadata(session, persist_portfolio_id, meta)

    return response
