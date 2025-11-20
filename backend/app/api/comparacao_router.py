from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, List
from app.services.comparison_service import compare_weights

router = APIRouter()

class CompareIn(BaseModel):
    prices: List[List[float]]
    weights_opt: List[float]
    weights_base: List[float]

@router.post('/get-comparacao-performace')
def compare_api(body: CompareIn):
    # body.prices esperado como matriz (datas x ativos) -> converter para numpy
    import numpy as np
    price_arr = np.array(body.prices)
    # construir DataFrame temporário não necessário para função compare_weights
    # adaptar: compare_weights espera price_df, usa log_returns; so for MVP pass minimal
    return {"detail":"Esta rota deve receber preços e pesos. Em protótipo use /get-otimizacao-de-portfolio"}
