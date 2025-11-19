"""
Utilities para busca de preços, retornos e métricas de ativos via Yahoo Finance.
Versão revisada e robusta para integração com GA e TCC.
"""

import requests
import datetime
import pandas as pd
import numpy as np
from typing import List, Dict, Optional

# ============================================================
# Preço Ajustado (AdjClose) de 1 ativo
# ============================================================
def get_adjclose(symbol: str, start_date: str, end_date: str) -> Optional[pd.DataFrame]:
    """
    Busca preços ajustados de 1 ativo via Yahoo Finance API.
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
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code != 200:
            return None

        data = r.json()
        if "chart" not in data or data["chart"]["result"] is None:
            return None

        result = data['chart']['result'][0]
        timestamps = result['timestamp']
        adjclose = result['indicators']['adjclose'][0]['adjclose']
        dates = [datetime.datetime.fromtimestamp(ts).date() for ts in timestamps]

        df = pd.DataFrame({symbol: adjclose}, index=pd.to_datetime(dates))
        df.index.name = 'data'
        return df
    except Exception as e:
        print(f"[get_adjclose] Erro {symbol}: {e}")
        return None

# ============================================================
# Preços de múltiplos ativos
# ============================================================
def get_multiple_assets(symbols: List[str], start_date: str, end_date: str) -> pd.DataFrame:
    """
    Junta os preços ajustados de múltiplos ativos.
    Retorna DataFrame com colunas = tickers.
    """
    dfs = []
    for symbol in symbols:
        df = get_adjclose(symbol, start_date, end_date)
        if df is not None:
            dfs.append(df)
    if not dfs:
        return pd.DataFrame()
    df_final = pd.concat(dfs, axis=1).sort_index()
    df_final.index.name = 'data'
    return df_final

# ============================================================
# Preço atual para validação
# ============================================================
def get_current_price(symbol: str) -> Optional[float]:
    """
    Retorna preço atual de um ativo.
    """
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?"
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

# ============================================================
# Métricas de retorno e CVaR
# ============================================================
def compute_metrics(df_prices: pd.DataFrame, alpha: float = 0.95, trading_days: int = 252) -> Dict[str, Dict[str, Optional[float]]]:
    """
    Calcula retorno anualizado composto e CVaR anual (%).
    """
    results = {}
    if df_prices is None or df_prices.empty:
        return results

    # Retorno logarítmico: log(P_t / P_{t-1})
    import numpy as np
    log_returns = np.log(df_prices / df_prices.shift(1)).dropna()
    if log_returns.empty:
        return results

    for col in log_returns.columns:
        r_log = log_returns[col].dropna()
        if r_log.empty:
            results[col] = {"expectedReturn": None, "cvar": None}
            continue

        # Retorno anualizado a partir de retornos logarítmicos
        mean_log_daily = r_log.mean()
        ann_return = np.exp(mean_log_daily * trading_days) - 1.0
        expected_return_pct = float(ann_return * 100)
        
        # Converter para retorno simples para cálculo de CVaR
        r = np.exp(r_log) - 1

        # CVaR diário → anualizado
        try:
            var_daily = np.quantile(r, 1.0 - alpha)
            tail_losses = r[r <= var_daily]
            cvar_daily = tail_losses.mean() if len(tail_losses) > 0 else var_daily
            cvar_annual = abs(cvar_daily * np.sqrt(trading_days))
            cvar_pct = float(cvar_annual * 100)
        except Exception:
            cvar_pct = None

        results[col] = {"expectedReturn": expected_return_pct, "cvar": cvar_pct}

    return results

# ============================================================
# Valida ticker existente no Yahoo
# ============================================================
def validar_ticker_yahoo(ticker: str) -> bool:
    """
    Retorna True se o ticker é válido e possui preço atual.
    """
    ticker_yahoo = ticker if '.' in ticker else f"{ticker}.SA"
    preco = get_current_price(ticker_yahoo)
    return preco is not None
