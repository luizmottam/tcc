from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session
from typing import List
from datetime import datetime

from ..db import get_session
from ..crud import get_historico, upsert_historico
from ..services.yfinance_service import ensure_historico_in_db
from ..core.ticker_utils import normalize_ticker

router = APIRouter(prefix="/historico")

@router.get("/{ticker}", response_model=List[dict])
def get_historico_route(ticker: str, limit: int = Query(1000, ge=1, le=10000), session: Session = Depends(get_session)):
    """
    Retorna histórico salvo no DB para o ticker informado.
    - ticker: exemplo 'PETR4' ou 'AAPL'
    - limit: número máximo de registros a retornar (padrão 1000)
    """
    ticker = normalize_ticker(ticker)
    rows = get_historico(session, ticker, limit=limit)
    if not rows:
        raise HTTPException(status_code=404, detail="Histórico não encontrado")
    # Converter objetos ORM para dicts simples (evita exposição de detalhes internos)
    result = []
    for r in rows:
        result.append({
            "ticker": r.ticker,
            "date": r.date.isoformat() if isinstance(r.date, datetime) else r.date,
            "close": float(r.close),
            "volume": float(r.volume) if r.volume is not None else None,
            "ret_daily": float(r.ret_daily) if r.ret_daily is not None else None,
            "ret_weekly": float(r.ret_weekly) if r.ret_weekly is not None else None,
            "ret_monthly": float(r.ret_monthly) if r.ret_monthly is not None else None,
        })
    return result

@router.post("/update/{ticker}", status_code=status.HTTP_202_ACCEPTED)
def update_historico_route(ticker: str):
    """
    Força atualização do histórico do ticker (down + upsert + cálculo de retornos).
    Retorna imediatamente (202) e executa sincronicamente — pode demorar alguns segundos dependendo do ticker.
    """
    ticker = normalize_ticker(ticker)
    try:
        ok = ensure_historico_in_db(ticker)
        if not ok:
            raise HTTPException(status_code=500, detail="Falha ao atualizar historico")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar historico: {e}")
    return {"ok": True, "ticker": ticker}

# Endpoint opcional para checar se tem histórico e quando foi o último registro
@router.get("/{ticker}/last")
def historico_last(ticker: str, session: Session = Depends(get_session)):
    rows = get_historico(session, ticker, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="Sem histórico")
    last = rows[0]
    return {"ticker": last.ticker, "date": last.date.isoformat(), "close": float(last.close)}
