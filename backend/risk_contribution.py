"""
Cálculo de Contribuição de Risco por CVaR usando Riskfolio.
Mostra quanto cada ativo contribui para o risco total do portfólio.
"""

import pandas as pd
import numpy as np
from typing import List, Dict
import riskfolio as rp


def calculate_cvar_risk_contribution(
    tickers: List[str],
    weights: np.ndarray,
    returns_df: pd.DataFrame,
    alpha: float = 0.95
) -> Dict[str, float]:
    """
    Calcula a contribuição de risco por CVaR para cada ativo do portfólio.
    
    Args:
        tickers: Lista de tickers dos ativos
        weights: Array de pesos (deve somar 1.0)
        returns_df: DataFrame com retornos (linhas = datas, colunas = tickers)
        alpha: Nível de confiança para CVaR (default: 0.95)
    
    Returns:
        Dict com ticker como chave e contribuição de risco em % como valor
    """
    try:
        # Normalizar pesos para garantir que somam 1
        weights_normalized = weights / weights.sum() if weights.sum() > 0 else weights
        
        # Criar Series de pesos indexada pelos tickers
        weights_series = pd.Series(weights_normalized, index=tickers)
        
        # Garantir que returns_df tem as mesmas colunas que tickers
        # Filtar apenas colunas que existem no DataFrame
        available_tickers = [t for t in tickers if t in returns_df.columns]
        if len(available_tickers) != len(tickers):
            print(f"[AVISO] Alguns tickers não encontrados no DataFrame: {set(tickers) - set(available_tickers)}")
        
        # Filtrar returns e weights para apenas os tickers disponíveis
        returns_filtered = returns_df[available_tickers].copy()
        weights_filtered = weights_series[available_tickers].copy()
        
        if len(weights_filtered) == 0:
            return {ticker: 0.0 for ticker in tickers}
        
        # Normalizar novamente após filtrar
        weights_filtered = weights_filtered / weights_filtered.sum()
        
        # Riskfolio espera retornos simples, não logarítmicos
        # Converter log returns para simple returns se necessário
        # Verificar se já são simple returns (valores podem ser > 0.5 ou < -0.5)
        if returns_filtered.abs().max().max() > 0.5:
            # Parece que já são simple returns, usar direto
            returns_for_riskfolio = returns_filtered
        else:
            # São log returns, converter para simple returns
            returns_for_riskfolio = np.exp(returns_filtered) - 1
        
        # Calcular contribuição de risco por CVaR usando Riskfolio
        risk_contribution = rp.RiskFunctions.Risk_Contribution(
            w=weights_filtered,
            returns=returns_for_riskfolio,
            cov=None,  # Deixa Riskfolio calcular a covariância
            rm="CVaR",  # Conditional Value at Risk
            alpha=alpha
        )
        
        # Converter para dicionário com valores em %
        result = {}
        for ticker in tickers:
            if ticker in risk_contribution.index:
                # Contribuição de risco já está em formato relativo, multiplicar por 100 para %
                result[ticker] = float(risk_contribution[ticker] * 100)
            else:
                result[ticker] = 0.0
        
        return result
        
    except Exception as e:
        print(f"[ERRO] Falha ao calcular contribuição de risco por CVaR: {e}")
        import traceback
        traceback.print_exc()
        # Retornar contribuição igual (distribuição uniforme) em caso de erro
        contribution_per_asset = 100.0 / len(tickers) if len(tickers) > 0 else 0.0
        return {ticker: contribution_per_asset for ticker in tickers}


def calculate_cvar_contribution_detailed(
    tickers: List[str],
    weights: np.ndarray,
    returns_df: pd.DataFrame,
    alpha: float = 0.95
) -> Dict[str, Dict[str, float]]:
    """
    Calcula contribuição de risco detalhada por CVaR, incluindo métricas adicionais.
    
    Returns:
        Dict com ticker como chave e métricas como valor:
        {
            ticker: {
                "contribution_pct": float,  # Contribuição em %
                "marginal_contribution": float,  # Contribuição marginal
                "component_cvar": float  # CVaR do componente
            }
        }
    """
    try:
        weights_normalized = weights / weights.sum() if weights.sum() > 0 else weights
        weights_series = pd.Series(weights_normalized, index=tickers)
        
        available_tickers = [t for t in tickers if t in returns_df.columns]
        returns_filtered = returns_df[available_tickers].copy()
        weights_filtered = weights_series[available_tickers].copy()
        
        if len(weights_filtered) == 0:
            return {ticker: {
                "contribution_pct": 0.0,
                "marginal_contribution": 0.0,
                "component_cvar": 0.0
            } for ticker in tickers}
        
        weights_filtered = weights_filtered / weights_filtered.sum()
        
        # Riskfolio espera retornos simples, não logarítmicos
        # Converter log returns para simple returns se necessário
        if returns_filtered.abs().max().max() > 0.5:
            returns_for_riskfolio = returns_filtered
        else:
            returns_for_riskfolio = np.exp(returns_filtered) - 1
        
        # Calcular contribuição de risco
        risk_contribution = rp.RiskFunctions.Risk_Contribution(
            w=weights_filtered,
            returns=returns_for_riskfolio,
            cov=None,
            rm="CVaR",
            alpha=alpha
        )
        
        # Calcular CVaR do portfólio para contexto
        portfolio_returns = (returns_for_riskfolio * weights_filtered).sum(axis=1)
        portfolio_cvar = rp.RiskFunctions.CVaR_Hist(
            returns=portfolio_returns,
            alpha=alpha
        )
        
        result = {}
        for ticker in tickers:
            if ticker in risk_contribution.index:
                contribution_pct = float(risk_contribution[ticker] * 100)
                # CVaR do componente individual (aproximação)
                if ticker in returns_for_riskfolio.columns:
                    asset_returns = returns_for_riskfolio[ticker]
                    asset_cvar = float(rp.RiskFunctions.CVaR_Hist(returns=asset_returns, alpha=alpha))
                else:
                    asset_cvar = 0.0
                
                # Contribuição marginal (aproximação)
                marginal = contribution_pct * portfolio_cvar / 100 if portfolio_cvar != 0 else 0.0
                
                result[ticker] = {
                    "contribution_pct": contribution_pct,
                    "marginal_contribution": float(marginal),
                    "component_cvar": asset_cvar
                }
            else:
                result[ticker] = {
                    "contribution_pct": 0.0,
                    "marginal_contribution": 0.0,
                    "component_cvar": 0.0
                }
        
        return result
        
    except Exception as e:
        print(f"[ERRO] Falha ao calcular contribuição detalhada: {e}")
        import traceback
        traceback.print_exc()
        return {ticker: {
            "contribution_pct": 100.0 / len(tickers) if len(tickers) > 0 else 0.0,
            "marginal_contribution": 0.0,
            "component_cvar": 0.0
        } for ticker in tickers}

