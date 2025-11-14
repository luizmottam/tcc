"""
- Retorno anualizado via média geométrica (log-returns).
- CVaR anual opcional via bootstrap (recomendado) — mais coerente que *sqrt(252).
- Inclusão da variância de carteira (Markowitz) via matriz de covariância.
- Função objetivo explícita: retorno - risco_peso * CVaR - var_peso * variância
- Validações básicas de input.
"""

import numpy as np
from typing import Tuple, Dict, List, Optional


# -------------------------
# Métricas
# -------------------------

def compute_annual_return_geo(returns: np.ndarray) -> float:
    """
    Retorno anualizado baseado em média geométrica (log-returns).
    returns: vetor de retornos periódicos (ex.: diários).
    Retorna decimal (ex: 0.15 = 15%).
    """
    # evita problemas com -1
    if np.any(returns <= -1.0):
        # se ocorrer, usa média aritmética como fallback (evita crash)
        mean_daily = np.mean(returns)
        return float((1 + mean_daily) ** 252 - 1)

    log_r = np.log1p(returns)
    mean_log = np.mean(log_r)
    annual = float(np.expm1(mean_log * 252))  # exp(mean_log*252)-1
    return annual


def compute_portfolio_variance(weights: np.ndarray, cov_matrix: np.ndarray) -> float:
    """
    Variância anualizada da carteira usando matriz de covariância diária.
    Assume cov_matrix é cov diária; para anualizar: cov_annual = cov_daily * 252
    Retorna var anual (decimal).
    """
    cov_annual = cov_matrix * 252.0
    var = float(weights.T @ cov_annual @ weights)
    return var


def compute_cvar_daily(returns: np.ndarray, alpha: float = 0.95) -> float:
    """
    CVaR (daily) — Expected Shortfall sobre retornos periódicos (diários).
    Retorna valor diário (positivo representando perda média, ex: 0.02 = 2% de perda).
    """
    var_limit = np.percentile(returns, (1 - alpha) * 100)
    tail = returns[returns <= var_limit]
    if len(tail) == 0:
        tail = returns
    cvar_daily = -np.mean(tail)
    return float(cvar_daily)


def compute_annual_cvar_bootstrap(returns: np.ndarray, alpha: float = 0.95, n_sim: int = 2000, block: int = 252, seed: Optional[int] = None) -> float:
    """
    Estima CVaR anual através de bootstrap Monte Carlo:
    - Monta n_sim cenários de 1 ano (amostrando com reposição blocos de 'block' dias)
    - Para cada cenário calcula o retorno anual composto
    - Calcula CVaR da distribuição anual de perdas
    Vantagem: transforma a estatística para escala anual coerente.
    Retorna CVaR anual (decimal, ex: 0.15 = 15%).
    """
    rng = np.random.default_rng(seed)
    n = len(returns)
    if n == 0:
        return 0.0

    annual_returns = np.empty(n_sim, dtype=float)
    # criação de cenários por bootstrap de dias (assume IID — simples, porém melhor que sqrt)
    for i in range(n_sim):
        idx = rng.integers(0, n, size=block)
        sample = returns[idx]
        # compor retorno anual via produto dos (1+ri) ao longo do block
        # evitar -1s: se houver, cai no produto (resultado pode ser -1)
        annual_returns[i] = np.prod(1 + sample) - 1

    # agora calculamos perdas e CVaR
    # queremos os piores x% (cauda inferior): ordenar por valor
    var_thresh = np.percentile(annual_returns, (1 - alpha) * 100)
    tail = annual_returns[annual_returns <= var_thresh]
    if tail.size == 0:
        tail = annual_returns
    # CVaR anual: média das perdas (negativa) transformada em positivo de perda
    cvar_annual = -np.mean(tail)
    return float(cvar_annual)


# -------------------------
# GA principal (corrigido)
# -------------------------

def run_ga(
    return_matrix: np.ndarray,
    tickers: List[str],
    populacao: int = 100,
    geracoes: int = 50,
    risco_peso: float = 1.0,
    var_peso: float = 0.0,
    cvar_alpha: float = 0.95,
    use_annual_cvar_bootstrap: bool = True,
    bootstrap_sims: int = 2000,
    seed: Optional[int] = None,
) -> Dict:
    """
    GA otimizado com correções:
    - Validação de entradas
    - Uso de covariância para variância de carteira (Markowitz)
    - CVaR anual por bootstrap opcional (recomendado)
    - Saídas coerentes (todas métricas em decimal internamente)

    Parâmetros principais:
    - risco_peso: peso do CVaR na função objetivo
    - var_peso: peso da variância (Markowitz) na função objetivo
    - use_annual_cvar_bootstrap: se True, calcula CVaR anual via bootstrap (recomendado)
    """

    rng = np.random.default_rng(seed)

    # Validações básicas
    if return_matrix.ndim != 2:
        raise ValueError("return_matrix deve ser 2D (dias x ativos).")
    n_days, n_assets = return_matrix.shape
    if n_assets != len(tickers):
        raise ValueError("Número de tickers deve igualar número de colunas em return_matrix.")
    if n_days < 30:
        # alerta, mas não erro
        print("Aviso: poucas observações (menos que 30 dias). Resultados podem ser instáveis.")

    # Precompute cov matrix diária
    cov_daily = np.cov(return_matrix, rowvar=False)  # cov entre colunas (ativos)
    # protege contra singularidade mínima
    if np.isnan(cov_daily).any():
        raise ValueError("Covariância contém NaNs — verifique os retornos de entrada.")

    # Geradores
    def random_weights() -> np.ndarray:
        w = rng.random(n_assets)
        w = np.clip(w, 0, None)
        s = w.sum()
        return (w / s) if s > 0 else np.ones(n_assets) / n_assets

    def evaluate(weights: np.ndarray) -> Tuple[float, float, float, float]:
        """
        Avalia: (fitness, annual_return, annual_cvar, annual_variance)
        """
        # returns do portfólio diário
        port_daily = (return_matrix * weights).sum(axis=1)

        # retorno anual (geom)
        annual_ret = compute_annual_return_geo(port_daily)

        # variância anual (Markowitz)
        annual_var = compute_portfolio_variance(weights, cov_daily)

        # CVaR anual (opção de bootstrap)
        if use_annual_cvar_bootstrap:
            annual_cvar = compute_annual_cvar_bootstrap(port_daily, alpha=cvar_alpha, n_sim=bootstrap_sims, block=252, seed=seed)
        else:
            # fallback: calcula CVaR diário e anualiza via sqrt(252) — menos recomendado
            daily_cvar = compute_cvar_daily(port_daily, alpha=cvar_alpha)
            annual_cvar = daily_cvar * np.sqrt(252)

        # função objetivo: retorno - risco_peso*CVaR - var_peso*variância
        fitness = annual_ret - risco_peso * annual_cvar - var_peso * annual_var

        return fitness, annual_ret, annual_cvar, annual_var

    # Inicializa população
    population = [random_weights() for _ in range(populacao)]
    evaluated = [(w, *evaluate(w)) for w in population]
    history = []

    # GA loop
    for gen in range(geracoes):
        evaluated.sort(key=lambda x: x[1], reverse=True)  # sort por fitness
        best_w, best_fit, best_ret, best_cvar, best_var = evaluated[0]

        history.append({
            "generation": int(gen),
            "fitness": float(best_fit),
            "annual_return": float(best_ret),
            "annual_cvar": float(best_cvar),
            "annual_variance": float(best_var),
        })

        # elitismo
        elite_size = max(2, int(populacao * 0.1))
        new_pop = [evaluated[i][0].copy() for i in range(elite_size)]

        # reprodução (mantive torneio simples + aritmético)
        while len(new_pop) < populacao:
            pa = evaluated[rng.integers(0, len(evaluated))][0]
            pb = evaluated[rng.integers(0, len(evaluated))][0]

            alpha = rng.random()
            child = alpha * pa + (1 - alpha) * pb

            # mutação adaptativa simples: prob ~ 0.2
            if rng.random() < 0.2:
                child += rng.normal(0, 0.05, size=n_assets)

            child = np.clip(child, 0, None)
            s = child.sum()
            child = (np.ones(n_assets) / n_assets) if s == 0 else child / s

            new_pop.append(child)

        evaluated = [(w, *evaluate(w)) for w in new_pop]

    # resultado final (top 10)
    evaluated.sort(key=lambda x: x[1], reverse=True)
    final = []
    for w, _, ret, cvar, var in evaluated[:10]:
        final.append({
            "retorno_esperado_pct": float(ret * 100),
            "risco_cvar_pct": float(cvar * 100),
            "variancia_anual": float(var),
            "pesos_pct": [float(x * 100) for x in w],
            "tickers": tickers,
        })

    return {"results": final, "history": history}

from db import get_connection

def salvar_melhor_por_geracao(portfolio_id: int, history: list):
    """
    Salva apenas o melhor indivíduo de cada geração na tabela resultados_otimizacao.
    """
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                for record in history:
                    cursor.execute("""
                        INSERT INTO resultados_otimizacao
                        (portfolio_id, retorno_esperado, risco_cvar, geracao)
                        VALUES (%s, %s, %s, %s)
                    """, (
                        portfolio_id,
                        record["annual_return"],
                        record["annual_cvar"],
                        record["generation"] + 1
                    ))
    except Exception as e:
        print(f"Erro ao salvar resultados no banco: {e}")
