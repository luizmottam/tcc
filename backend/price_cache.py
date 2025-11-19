"""
Módulo para cache de dados históricos de preços no banco de dados.
Busca do banco primeiro, só vai para web se necessário.
"""

import pandas as pd
import datetime
from typing import List, Optional
import db
from procidure import get_multiple_assets, insert_historical


def get_price_history_from_db(tickers: List[str], start_date: str, end_date: str) -> Optional[pd.DataFrame]:
    """
    Busca histórico de preços do banco de dados.
    Retorna DataFrame com colunas = tickers, index = datas, ou None se não encontrar.
    """
    try:
        conn = db.get_connection(db.DB_NAME)
        cursor = conn.cursor(dictionary=True)
        
        # Converter strings de data para date objects
        start_dt = datetime.datetime.strptime(start_date, "%Y-%m-%d").date()
        end_dt = datetime.datetime.strptime(end_date, "%Y-%m-%d").date()
        
        # Buscar dados de todos os tickers
        placeholders = ','.join(['%s'] * len(tickers))
        query = f"""
            SELECT data, ticker, adjclose
            FROM historico
            WHERE ticker IN ({placeholders})
            AND data >= %s AND data <= %s
            ORDER BY data, ticker
        """
        params = list(tickers) + [start_dt, end_dt]
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        if not rows:
            return None
        
        # Converter para DataFrame
        df_dict = {}
        dates_set = set()
        
        for row in rows:
            date = row['data']
            ticker = row['ticker']
            price = row['adjclose']
            
            if pd.notna(price) and price is not None:
                if ticker not in df_dict:
                    df_dict[ticker] = {}
                df_dict[ticker][date] = float(price)
                dates_set.add(date)
        
        if not df_dict:
            return None
        
        # Criar DataFrame com todas as datas
        all_dates = sorted(list(dates_set))
        df = pd.DataFrame(index=pd.to_datetime(all_dates))
        
        for ticker in tickers:
            if ticker in df_dict:
                ticker_data = {pd.to_datetime(date): price for date, price in df_dict[ticker].items()}
                df[ticker] = pd.Series(ticker_data, index=df.index)
        
        df = df.sort_index()
        
        # Verificar se tem dados suficientes (pelo menos 10 dias e todos os tickers)
        if df.empty or len(df) < 10:
            return None
        
        # Verificar se tem todos os tickers
        missing_tickers = set(tickers) - set(df.columns)
        if missing_tickers:
            print(f"[CACHE] Alguns tickers não encontrados no banco: {missing_tickers}")
        
        return df
        
    except Exception as e:
        print(f"[CACHE] Erro ao buscar do banco: {e}")
        import traceback
        traceback.print_exc()
        return None


def save_price_history_to_db(tickers: List[str], df: pd.DataFrame):
    """
    Salva DataFrame de preços históricos no banco de dados.
    """
    try:
        # Reformatar DataFrame para inserção
        df_to_save = df.copy()
        df_to_save.index.name = 'data'
        df_to_save = df_to_save.reset_index()
        df_to_save['data'] = pd.to_datetime(df_to_save['data']).dt.date
        
        # Usar função do procidure para salvar
        insert_historical(df_to_save.set_index('data'))
        print(f"[CACHE] Dados salvos no banco para {len(tickers)} tickers")
    except Exception as e:
        print(f"[CACHE] Erro ao salvar no banco: {e}")


def get_or_fetch_price_history(tickers: List[str], period: str = "5y") -> pd.DataFrame:
    """
    Busca histórico de preços: primeiro do banco, se não encontrar, busca da web e salva.
    """
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
    
    # Tentar buscar do banco primeiro
    print(f"[CACHE] Tentando buscar {len(tickers)} tickers do banco...")
    df_from_db = get_price_history_from_db(tickers, start_str, end_str)
    
    if df_from_db is not None and len(df_from_db.columns) == len(tickers):
        # Verificar se tem todos os tickers
        missing_tickers = set(tickers) - set(df_from_db.columns)
        if not missing_tickers:
            print(f"[CACHE] ✓ Todos os dados encontrados no banco ({len(df_from_db)} dias)")
            return df_from_db
        else:
            print(f"[CACHE] ⚠ Alguns tickers não encontrados no banco: {missing_tickers}")
    
    # Se não encontrou no banco, buscar da web
    print(f"[CACHE] Buscando da web para {len(tickers)} tickers...")
    from price_fetch import get_adjclose
    
    df_final = pd.DataFrame()
    for ticker in tickers:
        df = get_adjclose(ticker, start_str, end_str)
        if df is not None and not df.empty:
            df_final = df_final.join(df, how='outer') if not df_final.empty else df
    
    if df_final.empty:
        raise Exception(f"Nenhum histórico encontrado para {tickers}")
    
    df_final.index.name = 'data'
    df_final = df_final.sort_index()
    
    # Salvar no banco para próximas vezes
    print(f"[CACHE] Salvando dados no banco...")
    try:
        save_price_history_to_db(tickers, df_final)
    except Exception as e:
        print(f"[CACHE] ⚠ Erro ao salvar no banco: {e}")
    
    return df_final


def sync_tickers_to_db(tickers: List[str], period: str = "5y"):
    """
    Sincroniza tickers específicos: busca da web e salva no banco.
    Útil para atualização inicial ou quando adicionar novo ativo.
    """
    print(f"[SYNC] Sincronizando {len(tickers)} tickers no banco...")
    
    # Calcular datas
    end_date = datetime.datetime.now()
    period_days = {
        "1y": 365,
        "2y": 730,
        "5y": 1825,
        "10y": 3650
    }.get(period, 1825)
    start_date = end_date - datetime.timedelta(days=period_days)
    
    try:
        # Buscar e salvar
        df = get_multiple_assets(tickers, start_date, end_date)
        if df is not None and not df.empty:
            # Garantir que o index é data
            if not isinstance(df.index, pd.DatetimeIndex):
                df.index = pd.to_datetime(df.index)
            df.index.name = 'data'
            insert_historical(df)
            print(f"[SYNC] ✓ Sincronização concluída para {len(tickers)} tickers ({len(df)} dias)")
            return True
        else:
            print(f"[SYNC] ✗ Nenhum dado retornado da web")
            return False
    except Exception as e:
        print(f"[SYNC] ✗ Erro ao sincronizar: {e}")
        import traceback
        traceback.print_exc()
        return False

