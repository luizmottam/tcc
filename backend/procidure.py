import requests
import datetime
import pandas as pd
import os
from dotenv import load_dotenv
import db
import numpy as np
from pypfopt import expected_returns, risk_models
from pypfopt.efficient_frontier import EfficientCVaR

# Importar função de normalização de ticker
try:
    from price_fetch import normalize_ticker
except ImportError:
    # Fallback se não conseguir importar
    def normalize_ticker(ticker: str) -> str:
        if not ticker or not isinstance(ticker, str):
            raise ValueError("Ticker inválido")
        ticker = ticker.upper().strip()
        if not ticker.endswith(".SA") and not ticker.endswith(".US"):
            ticker += ".SA"
        return ticker

# Carrega variáveis do .env
load_dotenv()

# Usar configurações do db.py
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "Jogadorn1")
DB_NAME = os.getenv("DB_NAME", "db")
DB_PORT = int(os.getenv("DB_PORT", "3306"))


def get_conn():
    """Usa as mesmas configurações do db.py"""
    return db.get_connection(DB_NAME)


# ============================================================
#  CRIAÇÃO DAS TABELAS
# ============================================================

def create_tables():
    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS historico (
            id INT AUTO_INCREMENT PRIMARY KEY,
            data DATE NOT NULL,
            ticker VARCHAR(20) NOT NULL,
            adjclose DOUBLE,
            UNIQUE KEY uniq_data_ticker (data, ticker)
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS preco_atual (
            ticker VARCHAR(20) PRIMARY KEY,
            timestamp DATETIME,
            price DOUBLE
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS retornos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            data DATE NOT NULL,
            ticker VARCHAR(20) NOT NULL,
            retorno DOUBLE,
            retorno_acumulado DOUBLE,
            UNIQUE KEY uniq_data_ticker (data, ticker)
        );
    """)

    conn.commit()
    cursor.close()
    conn.close()


def insert_returns(df_retornos, df_acumulados):
    conn = get_conn()
    cursor = conn.cursor()

    sql = """
        INSERT INTO retornos (data, ticker, retorno, retorno_acumulado)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            retorno = VALUES(retorno),
            retorno_acumulado = VALUES(retorno_acumulado);
    """

    tickers = df_retornos.columns

    for date in df_retornos.index:
        for ticker in tickers:
            retorno = df_retornos.loc[date, ticker]
            acumulado = df_acumulados.loc[date, ticker]

            cursor.execute(sql, (
                date,
                ticker,
                float(retorno) if pd.notna(retorno) else None,
                float(acumulado) if pd.notna(acumulado) else None
            ))

    conn.commit()
    cursor.close()
    conn.close()


# ============================================================
#  INSERÇÃO DE DADOS
# ============================================================

def insert_historical(df):
    conn = get_conn()
    cursor = conn.cursor()

    sql = """
        INSERT IGNORE INTO historico (data, ticker, adjclose)
        VALUES (%s, %s, %s)
    """

    count = 0
    for date, row in df.iterrows():
        # Converter data para date object se necessário
        if isinstance(date, pd.Timestamp):
            date_obj = date.date()
        elif isinstance(date, datetime.datetime):
            date_obj = date.date()
        elif isinstance(date, datetime.date):
            date_obj = date
        else:
            # Tentar converter string
            date_obj = pd.to_datetime(date).date()
        
        for ticker, price in row.items():
            if pd.notna(price) and price is not None:
                try:
                    cursor.execute(sql, (date_obj, ticker, float(price)))
                    count += 1
                except Exception as e:
                    print(f"[INSERT] Erro ao inserir {ticker} em {date_obj}: {e}")

    conn.commit()
    cursor.close()
    conn.close()
    
    print(f"[INSERT] {count} registros inseridos/atualizados no histórico")


# UPSERT (INSERT + UPDATE) para preço atual
def upsert_current_price(ticker, price):
    conn = get_conn()
    cursor = conn.cursor()

    sql = """
        INSERT INTO preco_atual (ticker, timestamp, price)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE
            timestamp = VALUES(timestamp),
            price = VALUES(price);
    """

    cursor.execute(sql, (ticker, datetime.datetime.now(), price))

    conn.commit()
    conn.close()


def get_current_price_from_db(ticker):
    """
    Busca o preço atual de um ticker do banco de dados.
    Primeiro tenta buscar do dia atual. Se não encontrar, retorna o último disponível.
    
    Args:
        ticker: Ticker normalizado (ex: "PETR4.SA")
    
    Returns:
        float: Preço atual ou None se não encontrar
    """
    conn = get_conn()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Primeiro tenta buscar do dia atual
        sql_today = """
            SELECT price, timestamp 
            FROM preco_atual 
            WHERE ticker = %s 
            AND DATE(timestamp) = CURDATE()
            LIMIT 1
        """
        cursor.execute(sql_today, (ticker,))
        price_row = cursor.fetchone()
        
        if price_row and price_row.get("price") is not None:
            return float(price_row["price"])
        
        # Se não encontrou do dia atual, busca o último disponível
        sql_last = """
            SELECT price, timestamp 
            FROM preco_atual 
            WHERE ticker = %s 
            ORDER BY timestamp DESC 
            LIMIT 1
        """
        cursor.execute(sql_last, (ticker,))
        price_row = cursor.fetchone()
        
        if price_row and price_row.get("price") is not None:
            return float(price_row["price"])
        
        return None
    except Exception as e:
        print(f"[ERRO] Falha ao buscar preço atual de {ticker}: {e}")
        return None
    finally:
        cursor.close()
        conn.close()


# ============================================================
#  COLETA DE DADOS DO YAHOO FINANCE
# ============================================================

def get_adjclose(symbol, start_date, end_date):
    start_date = str(start_date).split()[0]
    end_date = str(end_date).split()[0]

    period1 = int(datetime.datetime.strptime(start_date, "%Y-%m-%d").timestamp())
    period2 = int(datetime.datetime.strptime(end_date, "%Y-%m-%d").timestamp())

    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
           f"?period1={period1}&period2={period2}&interval=1d&includeAdjustedClose=true")

    r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})

    if r.status_code != 200:
        print(f"[ERRO] {symbol} → {r.status_code}")
        return None

    try:
        data = r.json()
        timestamps = data['chart']['result'][0]['timestamp']
        adjclose = data['chart']['result'][0]['indicators']['adjclose'][0]['adjclose']
        datas = [datetime.datetime.fromtimestamp(ts).date() for ts in timestamps]

        return pd.DataFrame({symbol: adjclose}, index=datas)

    except Exception as e:
        print(f"[EXCEÇÃO] {symbol} → {e}")
        return None


def get_multiple_assets(symbols, start_date, end_date):
    df_final = pd.DataFrame()

    for symbol in symbols:
        df = get_adjclose(symbol, start_date, end_date)
        if df is not None:
            df_final = df_final.join(df, how='outer') if not df_final.empty else df

    df_final.index.name = "data"
    return df_final


def get_current_price(symbol):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?"
    r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})

    if r.status_code != 200:
        print(f"[ERRO] {symbol} → {r.status_code}")
        return None

    try:
        data = r.json()
        return data['chart']['result'][0]['meta']['regularMarketPrice']

    except Exception as e:
        print(f"[EXCEÇÃO] {symbol} → {e}")
        return None

def rentabilidade_carteira(tickers, periodo1, periodo2):

    hoje = datetime.datetime.today()
    um_ano = hoje - datetime.timedelta(days=365)

    # ================================
    # 1) Baixar preços
    # ================================
    print("Baixando preços dos ativos...")
    df_prices = get_multiple_assets(tickers, um_ano, hoje)

    df_prices = df_prices.dropna()

    # ================================
    # 2) Cálculo dos retornos logarítmicos
    # ================================
    import numpy as np
    # Retorno logarítmico: log(P_t / P_{t-1})
    retornos_log = np.log(df_prices / df_prices.shift(1))
    retornos_log = retornos_log.dropna()
    
    # Retorno acumulado: exp(soma dos retornos logarítmicos) - 1
    retornos_acumulados = np.exp(retornos_log.cumsum()) - 1
    
    # Para salvar no banco, converter log returns para simple returns
    retornos = np.exp(retornos_log) - 1

    # 🔥 Salva os retornos no banco MySQL
    print("Salvando retornos no MySQL...")
    insert_returns(retornos, retornos_acumulados)

def otimiza_cvar(df_prices, alpha=0.95, retorno_desejado=None):
    """
    df_prices: DataFrame de preços ajustados com colunas para cada ativo.
    alpha: nível de confiança para CVaR (ex: 0.95)
    retorno_desejado: se quiser otimizar para um retorno mínimo esperado (None → minimiza CVaR puro)
    """
    # 1) calcula retornos simples (você pode usar retornos log também)
    returns = df_prices.pct_change().dropna()

    # 2) calcula retornos esperados e matriz de covariância
    mu = expected_returns.mean_historical_return(df_prices)
    S = risk_models.sample_cov(df_prices)

    # 3) instancia o modelo EfficientCVaR
    ef_cvar = EfficientCVaR(mu, S, weight_bounds=(0, 1), alpha=alpha)

    if retorno_desejado is None:
        # Minimizar CVaR sem restrição de retorno
        weights = ef_cvar.min_cvar()
    else:
        # Minimizar CVaR dado um retorno mínimo
        weights = ef_cvar.efficient_return(return_target=retorno_desejado)
    
    # 4) obter CVaR estimado da carteira
    cvar_val = ef_cvar.portfolio_performance(risk_free_rate=0)[1]  # o segundo valor é risco (CVaR)
    
    return weights, cvar_val

    #weights, cvar_est = otimiza_cvar(df_prices, alpha=0.95)

# ============================================================
#  UTILITÁRIOS
# ============================================================

def get_all_portfolio_tickers():
    """
    Busca todos os tickers únicos que estão nos portfólios.
    Retorna lista de tickers normalizados (com .SA se necessário).
    """
    conn = get_conn()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Buscar todos os tickers únicos dos portfólios
        cursor.execute("""
            SELECT DISTINCT a.ticker
            FROM ativos a
            JOIN portfolio_ativos pa ON pa.ativo_id = a.id
        """)
        
        tickers = []
        for row in cursor.fetchall():
            ticker = row.get('ticker', '').strip()
            if ticker:
                try:
                    # Normalizar ticker usando a função do price_fetch
                    normalized_ticker = normalize_ticker(ticker)
                    tickers.append(normalized_ticker)
                except Exception as e:
                    print(f"[AVISO] Erro ao normalizar ticker {ticker}: {e}")
                    # Tentar normalizar manualmente como fallback
                    if not ticker.endswith('.SA') and not ticker.endswith('.US'):
                        ticker = f"{ticker}.SA"
                    tickers.append(ticker.upper())
        
        return tickers
    except Exception as e:
        print(f"[ERRO] Falha ao buscar tickers dos portfólios: {e}")
        import traceback
        traceback.print_exc()
        # Fallback para lista vazia
        return []
    finally:
        cursor.close()
        conn.close()


# ============================================================
#  JOBS AUTOMÁTICOS
# ============================================================

def job_diario():
    print("\n[JOB DIÁRIO] Atualizando histórico...")

    # Buscar ativos dinamicamente dos portfólios
    ativos = get_all_portfolio_tickers()
    
    if not ativos:
        print("[AVISO] Nenhum ativo encontrado nos portfólios. Pulando atualização.")
        return

    print(f"[JOB DIÁRIO] Encontrados {len(ativos)} ativos únicos nos portfólios: {ativos}")

    hoje = datetime.date.today()
    inicio = hoje - datetime.timedelta(days=3650)  # 10 anos

    df = get_multiple_assets(ativos, inicio, hoje)

    if df is not None:
        insert_historical(df)
        print(f"[OK] Histórico atualizado para {len(ativos)} ativos.")
    else:
        print("[AVISO] Não foi possível obter dados históricos.")


def job_10_minutos():
    print("\n[JOB 10 MIN] Atualizando preços atuais...")

    # Buscar ativos dinamicamente dos portfólios
    ativos = get_all_portfolio_tickers()
    
    if not ativos:
        print("[AVISO] Nenhum ativo encontrado nos portfólios. Pulando atualização.")
        return

    print(f"[JOB 10 MIN] Atualizando preços de {len(ativos)} ativos...")

    for ticker in ativos:
        try:
            price = get_current_price(ticker)
            if price is not None:
                upsert_current_price(ticker, price)
                print(f"[OK] {ticker} → R$ {price:.2f}")
            else:
                print(f"[AVISO] {ticker} → Preço não disponível")
        except Exception as e:
            print(f"[ERRO] Falha ao atualizar {ticker}: {e}")


# ============================================================
#  MAIN
# ============================================================

def main():
    create_tables()
    job_diario()
    job_10_minutos()


if __name__ == "__main__":
    main()