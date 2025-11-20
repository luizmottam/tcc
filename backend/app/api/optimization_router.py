from fastapi import APIRouter
from typing import List
from pydantic import BaseModel
from app.services.optimizer_service import optimize_portfolio

router = APIRouter()

class OptimizeIn(BaseModel):
    tickers: List[str]

@router.post('/get-otimizacao-de-portfolio')
def optimize_api(body: OptimizeIn):
    res = optimize_portfolio([t.upper() for t in body.tickers])
    return res