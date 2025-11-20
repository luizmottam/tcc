"""
Utilitários para normalização de tickers
"""
# Tickers internacionais conhecidos que não devem receber .SA
INTERNATIONAL_TICKERS = {
    'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'TSLA', 'META', 'NVDA', 
    'JPM', 'V', 'JNJ', 'WMT', 'PG', 'MA', 'UNH', 'HD', 'DIS', 'BAC',
    'ADBE', 'PYPL', 'NFLX', 'CMCSA', 'PFE', 'KO', 'NKE', 'T', 'PEP'
}

def normalize_ticker(ticker: str) -> str:
    """
    Normaliza um ticker: maiúsculas, remove espaços e adiciona .SA se necessário.
    
    Adiciona .SA automaticamente para tickers brasileiros (padrão: 4-6 caracteres,
    geralmente terminam com número). Tickers internacionais conhecidos não recebem .SA.
    
    Args:
        ticker: Ticker a ser normalizado (ex: "PETR4", "petr4", "VALE3.SA", "AAPL")
    
    Returns:
        Ticker normalizado (ex: "PETR4.SA", "VALE3.SA", "AAPL")
    """
    if not ticker:
        return ""
    
    # Remover espaços e converter para maiúsculas
    ticker = ticker.strip().upper()
    
    # Se já tem .SA, retornar como está
    if ticker.endswith('.SA'):
        return ticker
    
    # Se é um ticker internacional conhecido, não adicionar .SA
    if ticker in INTERNATIONAL_TICKERS:
        return ticker
    
    # Se o ticker tem 6 caracteres ou menos (típico de tickers brasileiros), adicionar .SA
    # Exemplos: PETR4, VALE3, ITUB4, BBDC4, MGLU3
    # Tickers brasileiros geralmente têm 4-6 caracteres e terminam com número
    if len(ticker) <= 6:
        return f"{ticker}.SA"
    
    # Para tickers maiores (ex: internacionais longos), retornar sem .SA
    return ticker

def remove_sa_suffix(ticker: str) -> str:
    """
    Remove o sufixo .SA de um ticker para exibição.
    
    Args:
        ticker: Ticker com ou sem .SA (ex: "PETR4.SA", "VALE3")
    
    Returns:
        Ticker sem .SA (ex: "PETR4", "VALE3")
    """
    if not ticker:
        return ""
    
    if ticker.endswith('.SA'):
        return ticker[:-3]
    
    return ticker

