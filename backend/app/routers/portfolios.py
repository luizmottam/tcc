from fastapi import APIRouter, Depends, Body
from sqlmodel import Session
from ..db import get_session
from ..crud import create_portfolio, list_portfolios, get_portfolio, delete_portfolio, update_portfolio_metadata
from ..schemas import PortfolioCreate

router = APIRouter(prefix="/portfolios", tags=["portfolios"])

@router.post("/", status_code=201)
def create(payload: PortfolioCreate, session: Session = Depends(get_session)):
    return create_portfolio(session, payload.name, payload.description, payload.metadata)

@router.get("", include_in_schema=True)
@router.get("/", include_in_schema=True)
def list_all(session: Session = Depends(get_session)):
    """Lista todos os portfólios"""
    portfolios = list_portfolios(session)
    # Formatar para compatibilidade com frontend
    result = []
    for p in portfolios:
        from sqlmodel import select
        from ..models import Ticket
        tickets = session.exec(select(Ticket).where(Ticket.portfolio_id == p.id)).all()
        result.append({
            "id": p.id,
            "name": p.name,
            "createdAt": p.created_at.isoformat() if p.created_at else None,
            "assets": [
                {
                    "id": str(t.id),
                    "ticker": t.ticker,
                    "sector": t.type or "",
                    "weight": (t.meta.get("weight", 0) if t.meta and isinstance(t.meta, dict) else 0) or (100.0 / len(tickets) if tickets else 0),
                    "expectedReturn": 0,
                    "variance": 0,
                    "cvar": 0,
                    "currentPrice": t.avg_price if t.avg_price else None
                }
                for t in tickets
            ],
            "totalReturn": p.total_return if p.total_return is not None else 0,
            "totalRisk": p.total_risk if p.total_risk is not None else 0,
            "totalCvar": p.total_cvar if p.total_cvar is not None else 0
        })
    return result

@router.get("/{id}")
def get_one(id: int, session: Session = Depends(get_session)):
    p = get_portfolio(session, id)
    if not p:
        return {"error":"not found"}
    return p

@router.delete("/{id}")
def remove(id: int, session: Session = Depends(get_session)):
    ok = delete_portfolio(session, id)
    return {"ok": ok}

@router.patch("/{id}/metadata")
def patch_meta(id: int, meta: dict = Body(...), session: Session = Depends(get_session)):
    return update_portfolio_metadata(session, id, meta)
