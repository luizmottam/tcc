from pydantic import BaseModel
from typing import List, Dict, Any

class AssetOut(BaseModel):
    ticker: str
    peso: float
    retorno_ativo: float
    retorno_ponderado: float
    risco_ativo: float
    risco_ponderado: float

class PortfolioOut(BaseModel):
    name: str
    weights: Dict[str, float]
    retorno_log: float
    retorno_acumulado: float
    risco: float
    cvar: float
    series: List[float]
    assets: List[AssetOut]
