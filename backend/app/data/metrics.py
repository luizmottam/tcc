import numpy as np
import pandas as pd
from typing import Tuple

ANNUAL_TRADING_DAYS = 252

# ----------------------------------------
# Retorno log diário
# ----------------------------------------
def log_returns(price_df: pd.DataFrame) -> pd.DataFrame:
    """
    Calcula retornos logarítmicos: log(prices / prices.shift(1))
    prices: DataFrame de preços (index=dates, cols=tickers)
    retorna: DataFrame de retornos logarítmicos
    """
    return np.log(price_df / price_df.shift(1)).dropna()

# ----------------------------------------
# Retorno log anualizado
# ----------------------------------------
def annualized_return(log_ret: pd.DataFrame) -> pd.Series:
    mean_daily = log_ret.mean()
    return mean_daily * ANNUAL_TRADING_DAYS

# ----------------------------------------
# Volatilidade anualizada
# ----------------------------------------
def annualized_volatility(log_ret: pd.DataFrame) -> pd.Series:
    std_daily = log_ret.std()
    return std_daily * np.sqrt(ANNUAL_TRADING_DAYS)

# ----------------------------------------
# Variância anualizada (NOVO)
# ----------------------------------------
def annualized_variance(log_ret: pd.DataFrame) -> pd.Series:
    """
    Annualized variance = daily variance × 252
    """
    var_daily = log_ret.var()
    return var_daily * ANNUAL_TRADING_DAYS

# ----------------------------------------
# Retorno do portfólio
# ----------------------------------------
def portfolio_return(weights: np.ndarray, mean_returns: pd.Series) -> float:
    return float(np.dot(weights, mean_returns))

# ----------------------------------------
# Retorno acumulado do portfólio
# ----------------------------------------
def portfolio_accumulated_return(weights: np.ndarray, log_ret: pd.DataFrame) -> float:
    """
    Calcula o retorno acumulado do portfólio usando retornos logarítmicos.
    Usa: exp(sum(log_returns)) - 1
    
    Args:
        weights: Array de pesos dos ativos (deve somar 1.0)
        log_ret: DataFrame com retornos logarítmicos diários (colunas = ativos)
    
    Returns:
        Retorno acumulado total (em decimal, ex: 0.15 = 15%)
    """
    try:
        if log_ret.empty or len(weights) == 0:
            return 0.0
        
        # Retorno diário do portfólio (em log) usando dot product
        port_log_ret = log_ret.dot(weights)
        
        # Verificar se há valores válidos
        if port_log_ret.isna().all() or len(port_log_ret) == 0:
            return 0.0
        
        # Remover NaN
        port_log_ret = port_log_ret.dropna()
        
        if len(port_log_ret) == 0:
            return 0.0
        
        # Calcular retorno acumulado: exp(sum(log_returns)) - 1
        accumulated = np.exp(port_log_ret.sum()) - 1
        
        # Validar e limitar valores extremos
        if not np.isfinite(accumulated) or accumulated > 5.0:  # Máximo 500%
            # Fallback: usar média anualizada
            mean_daily = port_log_ret.mean()
            if np.isfinite(mean_daily):
                accumulated = mean_daily * ANNUAL_TRADING_DAYS
            else:
                accumulated = 0.0
        
        # Garantir que está entre -1 e 5 (de -100% a 500%)
        accumulated = max(-1.0, min(5.0, accumulated))
        
        return float(accumulated)
    except Exception as e:
        print(f"[WARN] Erro ao calcular retorno acumulado: {e}")
        return 0.0

# ----------------------------------------
# Volatilidade do portfólio
# ----------------------------------------
def portfolio_volatility(weights: np.ndarray, cov_matrix: pd.DataFrame) -> float:
    return float(np.sqrt(weights.T @ cov_matrix.values @ weights))

# ----------------------------------------
# VaR e CVaR para um ativo ou série de retornos
# ----------------------------------------
def var_cvar(returns: pd.Series, alpha: float = 0.95) -> Tuple[float, float]:
    """
    Calcula VaR e CVaR (Expected Shortfall) para uma série de retornos.
    
    Args:
        returns: Series de retornos (logarítmicos ou simples)
        alpha: nível de confiança (ex: 0.95 ⟹ 5% de cauda)
    
    Returns:
        Tuple (VaR, CVaR) - ambos em decimal
    """
    if len(returns) == 0 or returns.isna().all():
        return 0.0, 0.0
    
    # Converter para Series se for array
    if isinstance(returns, np.ndarray):
        returns = pd.Series(returns)
    
    # Remover NaN
    returns = returns.dropna()
    
    if len(returns) == 0:
        return 0.0, 0.0
    
    var_level = 1 - alpha
    var = float(returns.quantile(var_level))
    cvar = float(returns[returns <= var].mean())
    
    return var, cvar


# ----------------------------------------
# CVaR (Expected Shortfall) - compatibilidade
# ----------------------------------------
def compute_cvar(portfolio_returns: np.ndarray, alpha: float = 0.95) -> float:
    """
    Calcula CVaR anualizado para retornos do portfólio.
    Compatível com código existente.
    
    Args:
        portfolio_returns: Array de retornos diários do portfólio
        alpha: nível de confiança (ex: 0.95 ⟹ 5% de cauda)
    
    Returns:
        CVaR anualizado (em decimal)
    """
    if len(portfolio_returns) == 0:
        return 0.0
    
    # Converter para Series
    returns_series = pd.Series(portfolio_returns)
    returns_series = returns_series.dropna()
    
    if len(returns_series) == 0:
        return 0.0
    
    # Calcular VaR e CVaR
    var_level = 1 - alpha
    var = float(returns_series.quantile(var_level))
    cvar = float(returns_series[returns_series <= var].mean())
    
    # Anualizar (multiplicar por sqrt(252))
    cvar_annualized = cvar * np.sqrt(ANNUAL_TRADING_DAYS)
    
    return float(cvar_annualized)


# ----------------------------------------
# VaR e CVaR da carteira
# ----------------------------------------
def portfolio_var_cvar(price_df: pd.DataFrame, weights: np.ndarray, alpha: float = 0.95) -> Tuple[float, float]:
    """
    Calcula VaR e CVaR da carteira usando retornos logarítmicos.
    
    Args:
        price_df: DataFrame de preços (index=dates, cols=tickers)
        weights: array de pesos da carteira (soma = 1)
        alpha: nível de confiança
    
    Returns:
        Tuple (VaR, CVaR) - ambos em decimal
    """
    # Calcular retornos logarítmicos da carteira
    portfolio_ret = portfolio_log_return(price_df, weights)
    
    # Calcular VaR e CVaR
    var, cvar = var_cvar(portfolio_ret, alpha)
    
    return var, cvar


# ----------------------------------------
# Retorno logarítmico da carteira
# ----------------------------------------
def portfolio_log_return(price_df: pd.DataFrame, weights: np.ndarray) -> pd.Series:
    """
    Calcula retorno logarítmico diário da carteira.
    
    Args:
        price_df: DataFrame de preços (index=dates, cols=tickers)
        weights: array de pesos (soma = 1)
    
    Returns:
        Series de retornos logarítmicos diários da carteira
    """
    log_ret = log_returns(price_df)
    # Retorno ponderado: log_ret @ weights (dot product)
    return log_ret.dot(weights)

# ----------------------------------------
# Métricas completas para um conjunto de ativos
# ----------------------------------------
def asset_level_metrics(price_df: pd.DataFrame):
    lr = log_returns(price_df)
    mean_ann = annualized_return(lr)
    vol_ann = annualized_volatility(lr)
    var_ann = annualized_variance(lr)
    return mean_ann, vol_ann, var_ann, lr