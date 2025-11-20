from datetime import datetime, timedelta

# Regras fixas do MVP (mas configuráveis aqui)
DEFAULT_TRAIN_YEARS = 4
DEFAULT_PROJECTION_MONTHS = 4

def get_train_period(reference_date: datetime = None):
    """Retorna (start, end) do período de treino: últimos DEFAULT_TRAIN_YEARS anos ignorando ano mais recente."""
    if reference_date is None:
        reference_date = datetime.utcnow()
    # Ignorar ano mais recente: considerar o ano anterior completo
    end = datetime(reference_date.year - 1, reference_date.month, reference_date.day)
    start = datetime(end.year - DEFAULT_TRAIN_YEARS, end.month, end.day)
    return start, end

def get_projection_period(reference_date: datetime = None):
    """Retorna (start, end) dos últimos DEFAULT_PROJECTION_MONTHS meses até reference_date."""
    if reference_date is None:
        reference_date = datetime.utcnow()
    end = reference_date
    start = end - timedelta(days=30 * DEFAULT_PROJECTION_MONTHS)
    return start, end