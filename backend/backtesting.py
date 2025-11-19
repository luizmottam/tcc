"""
Cálculo de performance real (backtesting) para comparação pós-otimização.
Calcula o que teria acontecido se a otimização tivesse sido aplicada em um período específico.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple
from datetime import datetime, timedelta
from price_fetch import get_price_history, normalize_ticker


def calculate_backtest_performance(
    tickers: List[str],
    original_weights: np.ndarray,
    optimized_weights: np.ndarray,
    test_period_months: int = 4
) -> Dict[str, Dict[str, float]]:
    """
    Calcula performance real (backtesting) comparando portfólio original vs otimizado.
    
    Args:
        tickers: Lista de tickers
        original_weights: Pesos originais (decimal 0-1)
        optimized_weights: Pesos otimizados (decimal 0-1)
        test_period_months: Período de teste em meses (default: 6 meses)
    
    Returns:
        Dict com:
        {
            "original": {
                "return_pct": float,  # Retorno acumulado em %
                "cvar_pct": float,    # CVaR em %
                "sharpe": float,      # Sharpe Ratio
                "volatility_pct": float  # Volatilidade em %
            },
            "optimized": {
                "return_pct": float,
                "cvar_pct": float,
                "sharpe": float,
                "volatility_pct": float
            },
            "improvement": {
                "return_delta": float,  # Diferença de retorno
                "risk_delta": float,    # Diferença de risco
                "sharpe_delta": float   # Diferença de Sharpe
            }
        }
    """
    try:
        # Calcular data inicial (test_period_months meses atrás)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=test_period_months * 30)
        
        # Buscar dados históricos do período de teste
        period_days = test_period_months * 30
        period_str = f"{period_days}d"
        
        # Buscar preços históricos
        price_df = get_price_history(tickers, period=period_str)
        
        if price_df.empty:
            raise ValueError("Sem dados históricos para o período de teste")
        
        # Retorno logarítmico: log(P_t / P_{t-1})
        log_returns = np.log(price_df / price_df.shift(1)).dropna()
        
        if log_returns.empty:
            raise ValueError("Sem retornos válidos para cálculo")
        
        # Normalizar pesos
        original_weights_norm = original_weights / original_weights.sum() if original_weights.sum() > 0 else original_weights
        optimized_weights_norm = optimized_weights / optimized_weights.sum() if optimized_weights.sum() > 0 else optimized_weights
        
        # Calcular retornos do portfólio
        original_portfolio_log_returns = (log_returns * original_weights_norm).sum(axis=1)
        optimized_portfolio_log_returns = (log_returns * optimized_weights_norm).sum(axis=1)
        
        # Converter para retornos simples para cálculos de CVaR
        original_portfolio_returns = np.exp(original_portfolio_log_returns) - 1
        optimized_portfolio_returns = np.exp(optimized_portfolio_log_returns) - 1
        
        # Calcular retorno acumulado no período
        original_cumulative_return = (1 + original_portfolio_returns).prod() - 1
        optimized_cumulative_return = (1 + optimized_portfolio_returns).prod() - 1
        
        # Anualizar retorno (assumindo período em dias úteis)
        n_days = len(original_portfolio_returns)
        days_per_year = 252
        original_annualized_return = (1 + original_cumulative_return) ** (days_per_year / n_days) - 1
        optimized_annualized_return = (1 + optimized_cumulative_return) ** (days_per_year / n_days) - 1
        
        # Calcular CVaR (95%)
        from ga import compute_cvar_daily
        
        original_cvar_daily = compute_cvar_daily(original_portfolio_returns.values, alpha=0.95)
        optimized_cvar_daily = compute_cvar_daily(optimized_portfolio_returns.values, alpha=0.95)
        
        # Anualizar CVaR
        original_cvar_annual = original_cvar_daily * np.sqrt(days_per_year)
        optimized_cvar_annual = optimized_cvar_daily * np.sqrt(days_per_year)
        
        # Calcular volatilidade (desvio padrão anualizado)
        original_volatility = original_portfolio_returns.std() * np.sqrt(days_per_year)
        optimized_volatility = optimized_portfolio_returns.std() * np.sqrt(days_per_year)
        
        # Calcular Sharpe Ratio (assumindo taxa livre de risco = 0)
        original_sharpe = (original_annualized_return / original_volatility) if original_volatility > 0 else 0
        optimized_sharpe = (optimized_annualized_return / optimized_volatility) if optimized_volatility > 0 else 0
        
        return {
            "original": {
                "return_pct": float(original_annualized_return * 100),
                "cvar_pct": float(original_cvar_annual * 100),
                "sharpe": float(original_sharpe),
                "volatility_pct": float(original_volatility * 100),
                "cumulative_return_pct": float(original_cumulative_return * 100)
            },
            "optimized": {
                "return_pct": float(optimized_annualized_return * 100),
                "cvar_pct": float(optimized_cvar_annual * 100),
                "sharpe": float(optimized_sharpe),
                "volatility_pct": float(optimized_volatility * 100),
                "cumulative_return_pct": float(optimized_cumulative_return * 100)
            },
            "improvement": {
                "return_delta": float((optimized_annualized_return - original_annualized_return) * 100),
                "risk_delta": float((optimized_cvar_annual - original_cvar_annual) * 100),
                "sharpe_delta": float(optimized_sharpe - original_sharpe),
                "volatility_delta": float((optimized_volatility - original_volatility) * 100)
            },
            "period_days": n_days,
            "test_period_months": test_period_months
        }
        
    except Exception as e:
        print(f"[ERRO] Falha ao calcular backtesting: {e}")
        import traceback
        traceback.print_exc()
        # Retornar valores padrão em caso de erro
        return {
            "original": {
                "return_pct": 0.0,
                "cvar_pct": 0.0,
                "sharpe": 0.0,
                "volatility_pct": 0.0,
                "cumulative_return_pct": 0.0
            },
            "optimized": {
                "return_pct": 0.0,
                "cvar_pct": 0.0,
                "sharpe": 0.0,
                "volatility_pct": 0.0,
                "cumulative_return_pct": 0.0
            },
            "improvement": {
                "return_delta": 0.0,
                "risk_delta": 0.0,
                "sharpe_delta": 0.0,
                "volatility_delta": 0.0
            },
            "period_days": 0,
            "test_period_months": test_period_months
        }


def get_backtest_series(
    tickers: List[str],
    original_weights: np.ndarray,
    optimized_weights: np.ndarray,
    test_period_months: int = 4
) -> Dict[str, List[Dict[str, any]]]:
    """
    Retorna série temporal de performance para backtesting.
    
    Returns:
        {
            "dates": List[str],
            "original": List[Dict[{"date": str, "cumulative_return": float}]],
            "optimized": List[Dict[{"date": str, "cumulative_return": float}]]
        }
    """
    try:
        # Calcular período
        end_date = datetime.now()
        start_date = end_date - timedelta(days=test_period_months * 30)
        period_days = test_period_months * 30
        period_str = f"{period_days}d"
        
        # Buscar preços
        price_df = get_price_history(tickers, period=period_str)
        
        if price_df.empty:
            return {
                "dates": [],
                "original": [],
                "optimized": []
            }
        
        # Retorno logarítmico
        log_returns = np.log(price_df / price_df.shift(1)).dropna()
        
        # Normalizar pesos
        original_weights_norm = original_weights / original_weights.sum() if original_weights.sum() > 0 else original_weights
        optimized_weights_norm = optimized_weights / optimized_weights.sum() if optimized_weights.sum() > 0 else optimized_weights
        
        # Retornos do portfólio
        original_portfolio_log_returns = (log_returns * original_weights_norm).sum(axis=1)
        optimized_portfolio_log_returns = (log_returns * optimized_weights_norm).sum(axis=1)
        
        # Retorno acumulado (começando em 0)
        original_cumulative = np.exp(original_portfolio_log_returns.cumsum()) - 1
        optimized_cumulative = np.exp(optimized_portfolio_log_returns.cumsum()) - 1
        
        # Normalizar para começar em 0
        original_cumulative = original_cumulative - original_cumulative.iloc[0]
        optimized_cumulative = optimized_cumulative - optimized_cumulative.iloc[0]
        
        # Formatar datas
        dates = original_cumulative.index.strftime("%Y-%m-%d").tolist()
        
        return {
            "dates": dates,
            "original": [
                {"date": date, "cumulative_return": float(val * 100)}
                for date, val in zip(dates, original_cumulative.values)
            ],
            "optimized": [
                {"date": date, "cumulative_return": float(val * 100)}
                for date, val in zip(dates, optimized_cumulative.values)
            ]
        }
        
    except Exception as e:
        print(f"[ERRO] Falha ao calcular série de backtesting: {e}")
        import traceback
        traceback.print_exc()
        return {
            "dates": [],
            "original": [],
            "optimized": []
        }

