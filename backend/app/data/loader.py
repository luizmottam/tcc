import yfinance as yf
import pandas as pd
from datetime import datetime

def fetch_price_series(tickers, start: datetime, end: datetime):
    """Retorna DataFrame com preços de fechamento ajustados (columns = tickers)."""
    if isinstance(tickers, str):
        tickers = [tickers]
    data = yf.download(tickers, start=start.strftime('%Y-%m-%d'), end=end.strftime('%Y-%m-%d'), progress=False, auto_adjust=True)
    if 'Close' in data:
        df = data['Close']
    else:
        df = data
    # Normalizar colnames
    df.columns = [c.replace('.SA','').upper() for c in df.columns]
    return df.dropna(how='all')