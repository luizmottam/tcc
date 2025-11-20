"""
Serviço de backtesting para comparar portfólio original vs otimizado
"""
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Any
from sqlmodel import Session, select
from ..models import Historico, Ticket
from ..data.metrics import log_returns, portfolio_log_return, var_cvar, compute_cvar
from ..db import engine


def calculate_backtest(
    portfolio_id: int,
    original_weights: Dict[str, float],
    optimized_weights: Dict[str, float],
    months: int = 6
) -> Dict[str, Any]:
    """
    Calcula backtest comparando portfólio original vs otimizado nos últimos N meses.
    
    Args:
        portfolio_id: ID do portfólio
        original_weights: Dict {ticker: weight} com pesos originais (0-100)
        optimized_weights: Dict {ticker: weight} com pesos otimizados (0-100)
        months: Número de meses para o backtest (padrão: 6)
    
    Returns:
        Dict com resultados do backtest formatados para o frontend
    """
    # Calcular data de início (N meses atrás)
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=months * 30)  # Aproximação: 30 dias por mês
    
    # Buscar todos os tickers envolvidos
    all_tickers = set(original_weights.keys()) | set(optimized_weights.keys())
    
    # Buscar dados históricos
    with Session(engine) as session:
        # Buscar histórico para todos os tickers
        price_data = {}
        dates_set = set()
        
        for ticker in all_tickers:
            rows = session.exec(
                select(Historico)
                .where(Historico.ticker == ticker)
                .where(Historico.date >= start_date)
                .where(Historico.date <= end_date)
                .order_by(Historico.date)
            ).all()
            
            if rows:
                df = pd.DataFrame([{
                    'date': r.date,
                    'close': r.close
                } for r in rows])
                df = df.set_index('date')
                price_data[ticker] = df['close']
                dates_set.update(df.index)
        
        if not price_data or not dates_set:
            return _empty_backtest_result(months)
        
        # Alinhar todas as séries por data
        all_dates = sorted(dates_set)
        price_df = pd.DataFrame(index=all_dates)
        
        for ticker in all_tickers:
            if ticker in price_data:
                price_df[ticker] = price_data[ticker]
            else:
                price_df[ticker] = np.nan
        
        # Remover linhas com muitos NaN
        price_df = price_df.dropna(thresh=len(all_tickers) * 0.5)  # Pelo menos 50% dos ativos
        
        if price_df.empty:
            return _empty_backtest_result(months)
        
        # Preencher NaN com forward fill e backward fill
        price_df = price_df.ffill().bfill()
        
        # Normalizar pesos para somar 1.0
        original_weights_norm = _normalize_weights(original_weights, all_tickers)
        optimized_weights_norm = _normalize_weights(optimized_weights, all_tickers)
        
        # Converter para arrays numpy na ordem dos tickers do DataFrame
        tickers_list = list(price_df.columns)
        original_weights_array = np.array([original_weights_norm.get(t, 0.0) for t in tickers_list])
        optimized_weights_array = np.array([optimized_weights_norm.get(t, 0.0) for t in tickers_list])
        
        # Calcular retornos logarítmicos diários
        log_ret = log_returns(price_df)
        
        # Calcular retornos diários dos portfólios
        original_portfolio_ret = portfolio_log_return(price_df, original_weights_array)
        optimized_portfolio_ret = portfolio_log_return(price_df, optimized_weights_array)
        
        # Remover NaN
        original_portfolio_ret = original_portfolio_ret.dropna()
        optimized_portfolio_ret = optimized_portfolio_ret.dropna()
        
        if len(original_portfolio_ret) == 0 or len(optimized_portfolio_ret) == 0:
            return _empty_backtest_result(months)
        
        # Calcular retorno acumulado (em %)
        original_cumulative = (np.exp(original_portfolio_ret.sum()) - 1) * 100
        optimized_cumulative = (np.exp(optimized_portfolio_ret.sum()) - 1) * 100
        
        # Calcular retorno anualizado (em %)
        original_annualized = original_portfolio_ret.mean() * 252 * 100
        optimized_annualized = optimized_portfolio_ret.mean() * 252 * 100
        
        # Calcular CVaR (já em decimal)
        original_cvar = compute_cvar(original_portfolio_ret.values)
        optimized_cvar = compute_cvar(optimized_portfolio_ret.values)
        
        # Calcular Sharpe Ratio
        original_sharpe = _calculate_sharpe(original_portfolio_ret)
        optimized_sharpe = _calculate_sharpe(optimized_portfolio_ret)
        
        # Calcular séries acumuladas para o gráfico
        original_cumulative_series = _calculate_cumulative_series(original_portfolio_ret)
        optimized_cumulative_series = _calculate_cumulative_series(optimized_portfolio_ret)
        
        # Alinhar séries por data
        dates_aligned = sorted(set(original_portfolio_ret.index) & set(optimized_portfolio_ret.index))
        
        # Formatar resultado
        return {
            "test_period_months": months,
            "period_days": len(dates_aligned),
            "start_date": dates_aligned[0].isoformat() if dates_aligned else start_date.isoformat(),
            "end_date": dates_aligned[-1].isoformat() if dates_aligned else end_date.isoformat(),
            "original": {
                "return_pct": float(original_annualized),
                "cumulative_return_pct": float(original_cumulative),
                "cvar_pct": float(original_cvar),  # CVaR em decimal (não multiplicar por 100)
                "sharpe": float(original_sharpe),
            },
            "optimized": {
                "return_pct": float(optimized_annualized),
                "cumulative_return_pct": float(optimized_cumulative),
                "cvar_pct": float(optimized_cvar),  # CVaR em decimal (não multiplicar por 100)
                "sharpe": float(optimized_sharpe),
            },
            "improvement": {
                "return_delta": float(optimized_annualized - original_annualized),
                "cumulative_return_delta": float(optimized_cumulative - original_cumulative),
                "risk_delta": float(optimized_cvar - original_cvar),  # CVaR em decimal
                "sharpe_delta": float(optimized_sharpe - original_sharpe),
            },
            "backtestSeries": {
                "dates": [d.isoformat() for d in dates_aligned],
                "original": [float(v) for v in original_cumulative_series],
                "optimized": [float(v) for v in optimized_cumulative_series],
            }
        }


def _normalize_weights(weights: Dict[str, float], all_tickers: set) -> Dict[str, float]:
    """Normaliza pesos para somar 1.0"""
    total = sum(weights.get(t, 0.0) for t in all_tickers)
    if total == 0:
        # Distribuir igualmente
        return {t: 1.0 / len(all_tickers) for t in all_tickers}
    return {t: weights.get(t, 0.0) / total for t in all_tickers}


def _calculate_sharpe(returns: pd.Series, risk_free_rate: float = 0.0) -> float:
    """Calcula Sharpe Ratio"""
    if len(returns) == 0 or returns.std() == 0:
        return 0.0
    excess_return = returns.mean() * 252 - risk_free_rate
    volatility = returns.std() * np.sqrt(252)
    if volatility == 0:
        return 0.0
    return excess_return / volatility


def _calculate_cumulative_series(returns: pd.Series) -> pd.Series:
    """Calcula série de retorno acumulado em %"""
    cumulative = (np.exp(returns.cumsum()) - 1) * 100
    return cumulative


def _empty_backtest_result(months: int) -> Dict[str, Any]:
    """Retorna resultado vazio quando não há dados"""
    return {
        "test_period_months": months,
        "period_days": 0,
        "start_date": None,
        "end_date": None,
        "original": {
            "return_pct": 0.0,
            "cumulative_return_pct": 0.0,
            "cvar_pct": 0.0,
            "sharpe": 0.0,
        },
        "optimized": {
            "return_pct": 0.0,
            "cumulative_return_pct": 0.0,
            "cvar_pct": 0.0,
            "sharpe": 0.0,
        },
        "improvement": {
            "return_delta": 0.0,
            "cumulative_return_delta": 0.0,
            "risk_delta": 0.0,
            "sharpe_delta": 0.0,
        },
        "backtestSeries": {
            "dates": [],
            "original": [],
            "optimized": [],
        }
    }

