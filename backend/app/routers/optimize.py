from fastapi import APIRouter, HTTPException, Depends
from ..services.optimizer_service import optimize
from ..db import get_session
from sqlmodel import Session
from pydantic import BaseModel
from typing import List, Optional

class OptimizeIn(BaseModel):
    tickers: List[str]
    persist_portfolio_id: Optional[int] = None

router = APIRouter(prefix="/optimize")

@router.post("/")
async def run_optimize(body: OptimizeIn):
    try:
        res = optimize(body.tickers, persist=bool(body.persist_portfolio_id), persist_portfolio_id=body.persist_portfolio_id)
        return {"ok": True, "data": res}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
