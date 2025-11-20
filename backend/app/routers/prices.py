"""
Router para atualização de preços
"""
from fastapi import APIRouter, Depends
from sqlmodel import Session
from ..db import get_session
from ..models import Ticket
from ..services.yfinance_service import ensure_historico_in_db
from sqlmodel import select

router = APIRouter(prefix="/prices", tags=["prices"])

@router.post("/update")
def update_prices(session: Session = Depends(get_session)):
    """Atualiza preços de todos os tickers nos portfólios"""
    # Buscar todos os tickers únicos
    tickets = session.exec(select(Ticket.ticker).distinct()).all()
    tickers = list(set(tickets))
    
    updated = []
    errors = []
    
    for ticker in tickers:
        try:
            ensure_historico_in_db(ticker)
            updated.append(ticker)
        except Exception as e:
            errors.append({"ticker": ticker, "error": str(e)})
    
    return {
        "updated": updated,
        "errors": errors,
        "total": len(tickers),
        "success": len(updated)
    }

