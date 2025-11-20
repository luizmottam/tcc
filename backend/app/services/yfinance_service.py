import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from ..config import settings
from ..crud import upsert_historico
from ..db import engine
from sqlmodel import Session

def fetch_price_series(ticker: str, start: datetime=None, end: datetime=None) -> pd.DataFrame:
    """
    Baixa preços ajustados do Yahoo Finance de forma robusta.
    Funciona para um ou mais tickers.
    Baseado no padrão: download_prices do código de referência.
    """
    if end is None:
        end = datetime.utcnow()
    if start is None:
        start = end - timedelta(days=settings.YFINANCE_DAYS_FALLBACK)
    
    # Download com auto_adjust=True (preços ajustados)
    df = yf.download(
        ticker, 
        start=start.strftime('%Y-%m-%d'), 
        end=end.strftime('%Y-%m-%d'), 
        progress=False, 
        auto_adjust=True
    )
    
    if df.empty:
        return pd.DataFrame()
    
    # Se vier uma Series (um ticker), transforma em DataFrame
    if isinstance(df, pd.Series):
        df = df.to_frame(name=ticker)
    
    # yfinance retorna DataFrame com índice DatetimeIndex e colunas como 'Open', 'High', 'Low', 'Close', 'Volume'
    # Quando há múltiplos tickers, pode retornar MultiIndex nas colunas
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)
    
    # Resetar o índice para ter a data como coluna
    df = df.reset_index()
    # O nome da coluna do índice pode ser 'Date' ou o nome do índice
    date_col = df.columns[0]  # Primeira coluna após reset_index é a data
    df = df.rename(columns={date_col: 'Date', 'Close': 'close'})
    df['Date'] = pd.to_datetime(df['Date'])
    
    # Retornar apenas Date e close
    return df[['Date', 'close']].copy()

def ensure_historico_in_db(ticker: str):
    # baixa e insere apenas novos registros (na prática: fetch full and upsert)
    df = fetch_price_series(ticker)
    if df.empty:
        return False
    rows = []
    for _, row in df.iterrows():
        # O volume não está no DataFrame retornado por fetch_price_series, então usamos 0
        rows.append({
            'date': row['Date'].to_pydatetime(), 
            'close': float(row['close']), 
            'volume': 0.0  # Volume não está disponível no fetch simplificado
        })
    # Usar sessão isolada para evitar conflitos
    with Session(engine, expire_on_commit=False) as session:
        upsert_historico(session, ticker, rows)
    # calcular retornos diários em batch (pode ser otimizado)
    # Usar sessão isolada para evitar conflitos com outras sessões
    compute_and_store_returns(ticker)
    return True

def compute_and_store_returns(ticker: str):
    # recompute ret_daily for this ticker
    from sqlmodel import select
    from ..models import Historico
    import pandas as pd
    with Session(engine) as session:
        # Usar expire_on_commit=False para evitar problemas com objetos expirados
        rows = session.exec(select(Historico).where(Historico.ticker==ticker).order_by(Historico.date)).all()
        if not rows:
            return
        df = pd.DataFrame([{'date': r.date, 'close': r.close} for r in rows]).sort_values('date')
        df['ret_daily'] = df['close'].pct_change().fillna(0)
        # write back - precisa buscar o objeto, atualizar e fazer commit
        # Usar merge para evitar problemas com objetos detached
        for _, r in df.iterrows():
            hist = session.exec(
                select(Historico).where(
                    Historico.ticker==ticker, 
                    Historico.date==r['date']
                )
            ).first()
            if hist:
                hist.ret_daily = float(r['ret_daily'])
                # Não adicionar novamente se já está na sessão
                if hist not in session:
                    session.add(hist)
        session.commit()

def get_current_price(ticker: str) -> float:
    """Busca o preço atual de um ticker via yfinance"""
    try:
        # Ticker já deve vir normalizado (com .SA) do banco, mas garantir
        ticker_adj = ticker
        if not ticker.endswith('.SA') and len(ticker) <= 6:
            ticker_adj = f"{ticker}.SA"
        
        stock = yf.Ticker(ticker_adj)
        info = stock.info
        # Tentar pegar o preço atual de diferentes campos
        current_price = info.get('currentPrice') or info.get('regularMarketPrice') or info.get('previousClose')
        
        if current_price:
            return float(current_price)
        
        # Fallback: buscar último preço de fechamento
        hist = stock.history(period="1d")
        if not hist.empty:
            return float(hist['Close'].iloc[-1])
        
        return 0.0
    except Exception as e:
        print(f"Erro ao buscar preço atual de {ticker}: {e}")
        return 0.0
