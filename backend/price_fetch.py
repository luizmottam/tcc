"""
Utilities para busca de preços, retornos e métricas de ativos via Yahoo Finance.
Versão otimizada com requests direto e paralelização para melhor performance.
"""

import requests
import datetime
import pandas as pd
import numpy as np
from typing import List, Dict, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading


# ============================================================
# Normalização de tickers
# ============================================================

def normalize_ticker(ticker: str) -> str:
    """
    Padroniza ticker para formato Yahoo (.SA para Brasil).
    """
    if not ticker or not isinstance(ticker, str):
        raise ValueError("Ticker inválido")
    ticker = ticker.upper().strip()
    if not ticker.endswith(".SA"):
        ticker += ".SA"
    return ticker


# ============================================================
# Histórico de Preços - Versão Otimizada com Requests
# ============================================================

def get_adjclose(symbol: str, start_date: str, end_date: str) -> Optional[pd.DataFrame]:
    """
    Busca preços ajustados de 1 ativo via Yahoo Finance API (requests direto).
    Retorna DataFrame index=data, colunas=[symbol].
    """
    try:
        period1 = int(datetime.datetime.strptime(start_date, "%Y-%m-%d").timestamp())
        period2 = int(datetime.datetime.strptime(end_date, "%Y-%m-%d").timestamp())
        url = (
            f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
            f"?period1={period1}&period2={period2}&interval=1d&includeAdjustedClose=true"
        )
        headers = {"User-Agent": "Mozilla/5.0"}
        r = requests.get(url, headers=headers, timeout=15)
        
        if r.status_code != 200:
            print(f"[ERRO] {symbol} → {r.status_code}")
            return None

        data = r.json()
        if "chart" not in data or not data["chart"].get("result"):
            return None

        result = data['chart']['result'][0]
        timestamps = result.get('timestamp', [])
        adjclose = result['indicators']['adjclose'][0]['adjclose']
        
        if not timestamps or not adjclose:
            return None
            
        dates = [datetime.datetime.fromtimestamp(ts).date() for ts in timestamps]
        df = pd.DataFrame({symbol: adjclose}, index=pd.to_datetime(dates))
        df.index.name = 'data'
        return df
    except Exception as e:
        print(f"[EXCEÇÃO] {symbol} → {e}")
        return None


def get_price_history(tickers: List[str], period: str = "5y") -> pd.DataFrame:
    """
    Busca histórico de preços ajustados do Yahoo Finance usando requests paralelos.
    Retorna DataFrame (dias × tickers) com preços de fechamento.
    Muito mais rápido que yfinance!
    """
    if not tickers:
        raise ValueError("Nenhum ticker informado")
    
    normalized = [normalize_ticker(t) for t in tickers]
    
    # Calcular datas baseado no período
    end_date = datetime.datetime.now()
    period_days = {
        "1y": 365,
        "2y": 730,
        "5y": 1825,
        "10y": 3650
    }.get(period, 730)
    start_date = end_date - datetime.timedelta(days=period_days)
    
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")
    
    # Buscar preços em paralelo
    print(f"[PRICE_FETCH] Iniciando busca de preços para {len(normalized)} tickers: {normalized}")
    print(f"[PRICE_FETCH] Período: {start_str} até {end_str}")
    dfs = []
    with ThreadPoolExecutor(max_workers=min(len(normalized), 10)) as executor:
        future_to_ticker = {
            executor.submit(get_adjclose, ticker, start_str, end_str): ticker 
            for ticker in normalized
        }
        
        completed = 0
        for future in as_completed(future_to_ticker):
            ticker = future_to_ticker[future]
            try:
                df = future.result()
                if df is not None and not df.empty:
                    dfs.append(df)
                    completed += 1
                    print(f"[PRICE_FETCH] ✓ {ticker}: {len(df)} dias de dados")
                else:
                    print(f"[PRICE_FETCH] ✗ {ticker}: Sem dados")
            except Exception as e:
                print(f"[PRICE_FETCH] ✗ Erro ao buscar {ticker}: {e}")
    
    print(f"[PRICE_FETCH] Busca concluída: {completed}/{len(normalized)} tickers com sucesso")
    
    if not dfs:
        raise Exception(f"Nenhum histórico encontrado para {normalized}")
    
    # Combinar todos os DataFrames
    df_final = pd.concat(dfs, axis=1).sort_index()
    df_final = df_final.dropna(how='all')
    
    if df_final.empty:
        raise Exception(f"Nenhum histórico válido encontrado para {normalized}")

    return df_final


# ============================================================
# Matriz de Retornos
# ============================================================

def get_returns_matrix(tickers: List[str], period: str = "5y") -> np.ndarray:
    """
    Retorna matriz (dias × ativos) de retornos diários em float64.
    """
    price_df = get_price_history(tickers, period)
    returns = price_df.pct_change().dropna().astype(np.float64)
    return returns.values


# ============================================================
# Série de Performance de Portfólio
# ============================================================

def get_performance_series(
    tickers: List[str],
    weights: np.ndarray | List[float],
    period: str = "5y"
) -> pd.DataFrame:
    """
    Calcula série temporal de retorno cumulativo da carteira (%).
    """
    weights = np.array(weights, dtype=float)
    if weights.sum() <= 0:
        raise ValueError("Soma dos pesos deve ser maior que zero")
    weights = weights / weights.sum()

    price_df = get_price_history(tickers, period)
    daily_returns = price_df.pct_change().dropna()

    portfolio_daily_returns = (daily_returns * weights).sum(axis=1)
    cumulative_return = (1 + portfolio_daily_returns).cumprod() - 1

    df = pd.DataFrame({
        "date": cumulative_return.index.strftime("%Y-%m-%d"),
        "cumulative_return": cumulative_return.values * 100,  # %
    })

    return df


# ============================================================
# Métricas por Ativo (Expected Return + CVaR)
# ============================================================

def compute_asset_metrics(
    tickers: List[str],
    period: str = "5y",
    alpha: float = 0.95,
    use_bootstrap: bool = False,
    n_sim: int = 2000,
    block: int = 252,
    seed: Optional[int] = None
) -> Dict[str, Dict[str, float]]:
    """
    Calcula retorno esperado anualizado e CVaR anualizado (%).
    - use_bootstrap: se True, calcula CVaR anual via bootstrap Monte Carlo
    - alpha: nível de confiança para CVaR
    """
    result = {}
    rng = np.random.default_rng(seed)

    try:
        price_df = get_price_history(tickers, period)
        daily_returns = price_df.pct_change().dropna()

        for ticker in daily_returns.columns:
            r = daily_returns[ticker].values

            # Retorno anualizado (geométrico)
            mean_daily = r.mean()
            annual_return = ((1 + mean_daily) ** 252 - 1) * 100

            # CVaR
            if use_bootstrap:
                n_days = len(r)
                annual_returns_sim = np.empty(n_sim)
                for i in range(n_sim):
                    idx = rng.integers(0, n_days, size=block)
                    sample = r[idx]
                    annual_returns_sim[i] = np.prod(1 + sample) - 1
                var_thresh = np.percentile(annual_returns_sim, (1 - alpha) * 100)
                tail = annual_returns_sim[annual_returns_sim <= var_thresh]
                cvar_annual = -np.mean(tail) * 100
            else:
                var_thresh = np.percentile(r, (1 - alpha) * 100)
                tail = r[r <= var_thresh]
                cvar_daily = tail.mean() if len(tail) > 0 else var_thresh
                cvar_annual = abs(cvar_daily * np.sqrt(252)) * 100

            result[ticker] = {
                "expectedReturn": round(float(annual_return), 2),
                "cvar": round(float(cvar_annual), 2)
            }

        return result

    except Exception as e:
        print(f"[compute_asset_metrics] Erro: {e}")
        return result


# ============================================================
# Preço Atual para Validação de Ticker
# ============================================================

def get_current_price(ticker: str) -> Optional[float]:
    """
    Retorna o preço atual do ativo via Yahoo Finance API (requests direto).
    Retorna None se ticker inválido ou sem dados.
    """
    try:
        ticker = normalize_ticker(ticker)
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?"
        headers = {"User-Agent": "Mozilla/5.0"}
        r = requests.get(url, headers=headers, timeout=10)
        
        if r.status_code != 200:
            return None
            
        data = r.json()
        result = data.get('chart', {}).get('result')
        if not result:
            return None
        return float(result[0]['meta']['regularMarketPrice'])
    except Exception:
        return None


def get_ibovespa_series(period: str = "2y") -> pd.DataFrame:
    """
    Busca série histórica do Ibovespa (^BVSP).
    Retorna DataFrame com coluna 'IBOV' em percentual acumulado.
    """
    try:
        end_date = datetime.datetime.now()
        period_days = {
            "1y": 365,
            "2y": 730,
            "5y": 1825,
            "10y": 3650
        }.get(period, 730)
        start_date = end_date - datetime.timedelta(days=period_days)
        
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")
        
        df = get_adjclose("^BVSP", start_str, end_str)
        if df is not None and not df.empty:
            # Calcular retorno cumulativo
            daily_returns = df.iloc[:, 0].pct_change().dropna()
            cumulative = (1 + daily_returns).cumprod() - 1
            
            result_df = pd.DataFrame({
                'date': cumulative.index.strftime("%Y-%m-%d"),
                'ibovespa': cumulative.values * 100
            })
            return result_df
        return pd.DataFrame()
    except Exception as e:
        print(f"[ERRO] Falha ao buscar Ibovespa: {e}")
        return pd.DataFrame()


def get_sector_from_ticker(ticker: str) -> str:
    """
    Retorna o setor de um ticker (simplificado - pode ser melhorado com API).
    Por enquanto retorna baseado em mapeamento conhecido.
    """
    ticker_upper = ticker.upper().replace(".SA", "")
    
    # Mapeamento básico de setores (pode ser expandido)
    sector_map = {
        "PETR": "Petróleo e Gás",
        "VALE": "Mineração",
        "ITUB": "Bancos",
        "BBDC": "Bancos",
        "BBAS": "Bancos",
        "ABEV": "Bebidas",
        "WEGE": "Equipamentos",
        "RENT": "Aluguel de Carros",
        "RAIL": "Logística",
    }
    
    for key, sector in sector_map.items():
        if ticker_upper.startswith(key):
            return sector
    
    return "Outros"


def calculate_portfolio_metrics(
    tickers: List[str],
    weights: np.ndarray,
    period: str = "2y"
) -> Dict[str, float]:
    """
    Calcula métricas quantitativas do portfólio.
    Retorna: retorno médio, CVaR, volatilidade, Sharpe, desvio padrão
    """
    try:
        price_df = get_price_history(tickers, period)
        daily_returns = price_df.pct_change().dropna()
        
        # Retorno do portfólio diário
        portfolio_returns = (daily_returns * weights).sum(axis=1)
        
        # Retorno médio anualizado
        mean_daily = portfolio_returns.mean()
        annual_return = ((1 + mean_daily) ** 252 - 1) * 100
        
        # Desvio padrão anualizado (volatilidade)
        std_daily = portfolio_returns.std()
        volatility = std_daily * np.sqrt(252) * 100
        
        # CVaR
        from ga import compute_cvar_daily
        cvar_daily = compute_cvar_daily(portfolio_returns.values, alpha=0.95)
        cvar_annual = cvar_daily * np.sqrt(252) * 100
        
        # Sharpe Ratio (assumindo taxa livre de risco = 0 por simplicidade)
        sharpe = (annual_return / volatility) if volatility > 0 else 0
        
        return {
            "retorno_medio": float(annual_return),
            "cvar": float(cvar_annual),
            "volatilidade": float(volatility),
            "sharpe": float(sharpe),
            "desvio_padrao": float(volatility),  # mesmo que volatilidade
        }
    except Exception as e:
        print(f"[ERRO] Falha ao calcular métricas: {e}")
        return {
            "retorno_medio": 0.0,
            "cvar": 0.0,
            "volatilidade": 0.0,
            "sharpe": 0.0,
            "desvio_padrao": 0.0,
        }


def get_performance_series(
    tickers: List[str],
    weights: np.ndarray,
    period: str = "2y"
) -> pd.DataFrame:
    """
    Calcula série temporal de retorno acumulado do portfólio.
    Retorna DataFrame com colunas: date, portfolio, ibovespa, selic
    """
    try:
        # Preços do portfólio
        price_df = get_price_history(tickers, period)
        daily_returns = price_df.pct_change().dropna()
        portfolio_daily_returns = (daily_returns * weights).sum(axis=1)
        portfolio_cumulative = (1 + portfolio_daily_returns).cumprod() - 1
        
        # Preços do Ibovespa
        ibov_df = get_ibovespa_series(period)
        dates = portfolio_daily_returns.index
        
        # Taxa Selic (aproximação - pode ser melhorada com API do BCB)
        # Assumindo Selic constante de 11.75% ao ano
        selic_daily = 11.75 / 252 / 100  # taxa diária
        selic_cumulative = pd.Series(
            [(1 + selic_daily) ** (i + 1) - 1 for i in range(len(dates))],
            index=dates
        ) * 100
        
        # Preparar DataFrame de saída
        result_data = {
            "date": dates.strftime("%Y-%m-%d").tolist(),
            "portfolio": (portfolio_cumulative * 100).tolist(),
            "selic": selic_cumulative.tolist(),
        }
        
        # Alinhar Ibovespa se disponível
        if not ibov_df.empty and 'ibovespa' in ibov_df.columns:
            # Converter datas do Ibovespa para datetime
            ibov_df['date_dt'] = pd.to_datetime(ibov_df['date'])
            dates_dt = pd.to_datetime(dates)
            
            # Criar série alinhada
            ibov_series = pd.Series(ibov_df['ibovespa'].values, index=ibov_df['date_dt'])
            ibov_aligned = ibov_series.reindex(dates_dt, method='ffill').fillna(0)
            result_data["ibovespa"] = ibov_aligned.tolist()
        else:
            result_data["ibovespa"] = [0] * len(dates)
        
        return pd.DataFrame(result_data)
    except Exception as e:
        print(f"[ERRO] Falha ao calcular série de performance: {e}")
        return pd.DataFrame()


def get_sector_from_ticker(ticker: str) -> str:
    """
    Retorna setor aproximado baseado no ticker (heurística).
    """
    ticker = ticker.upper().replace('.SA', '')
    
    # Mapeamento simplificado de tickers para setores
    sector_map = {
        'PETR': 'Energia',
        'VALE': 'Mineração',
        'BBDC': 'Financeiro',
        'ITUB': 'Financeiro',
        'ITSA': 'Financeiro',
        'BRFS': 'Consumo',
        'ABEV': 'Consumo',
        'WEGE': 'Industrial',
        'RAIL': 'Infraestrutura',
        'CCRO': 'Infraestrutura',
        'GGBR': 'Siderurgia',
        'USIM': 'Siderurgia',
        'RENT': 'Imobiliário',
        'SHUL': 'Imobiliário',
    }
    
    for key, sector in sector_map.items():
        if ticker.startswith(key):
            return sector
    
    return 'Outros'


def calculate_sharpe_ratio(returns: np.ndarray, risk_free_rate: float = 0.0) -> float:
    """
    Calcula razão de Sharpe anualizada.
    returns: vetor de retornos diários
    risk_free_rate: taxa livre de risco (anual em decimal)
    """
    if len(returns) < 2:
        return 0.0
    
    daily_rf = risk_free_rate / 252.0
    excess_returns = returns - daily_rf
    
    mean_excess = np.mean(excess_returns)
    std_excess = np.std(excess_returns)
    
    if std_excess == 0:
        return 0.0
    
    sharpe_daily = mean_excess / std_excess
    sharpe_annual = sharpe_daily * np.sqrt(252)
    
    return float(sharpe_annual)


def calculate_portfolio_metrics(returns: np.ndarray, weights: np.ndarray, 
                                risk_free_rate: float = 0.04) -> Dict[str, float]:
    """
    Calcula métricas de portfólio.
    
    Returns:
        {
            'retorno_anual': float,
            'volatilidade': float,
            'cvar': float,
            'sharpe': float,
            'desvio_padrao': float
        }
    """
    # Retorno anual
    mean_daily = np.mean(returns)
    annual_return = ((1 + mean_daily) ** 252 - 1) * 100
    
    # Volatilidade anual (std dev)
    daily_std = np.std(returns)
    annual_volatility = daily_std * np.sqrt(252) * 100
    
    # CVaR (95%)
    var_95 = np.percentile(returns, 5)
    cvar = np.mean(returns[returns <= var_95]) * np.sqrt(252) * 100
    cvar = abs(cvar)
    
    # Sharpe ajustado
    sharpe = calculate_sharpe_ratio(returns, risk_free_rate)
    
    return {
        'retorno_anual': float(annual_return),
        'volatilidade': float(annual_volatility),
        'cvar': float(cvar),
        'sharpe': float(sharpe),
        'desvio_padrao': float(annual_volatility)
    }

