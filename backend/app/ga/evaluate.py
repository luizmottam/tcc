import numpy as np
from typing import Tuple
from app.data.metrics import log_returns, annualized_return, portfolio_volatility, compute_cvar

CVaR_ALPHA = 0.95

def evaluate_candidate(weights: np.ndarray, price_df):
    """Retorna tuple de objetivos: (-retorno, risco, cvar) — negativos quando precisamos maximizar retorno.
    price_df: DataFrame com preços (index=dates, cols=tickers)
    weights numpy array com soma 1
    """
    lr = log_returns(price_df)
    # construir série de retornos diários do portfólio
    daily_port_ret = lr.values @ weights
    mean_ann = np.mean(daily_port_ret) * 252
    # volatilidade anual
    cov = np.cov(lr.T)
    vol_ann = np.sqrt(weights.T @ cov @ weights) * np.sqrt(252)
    cvar_ann = compute_cvar(daily_port_ret, alpha=CVaR_ALPHA)
    # Objetivos: queremos maximizar retorno, minimizar vol e CVaR
    return -float(mean_ann), float(vol_ann), float(cvar_ann)