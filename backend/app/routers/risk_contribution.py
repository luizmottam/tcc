"""
Router para contribuição de risco
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import Session
from ..db import get_session
from ..models import Portfolio, Ticket
from sqlmodel import select

router = APIRouter(prefix="/portfolio", tags=["risk"])

@router.get("/{portfolio_id}/risk-contribution")
def get_risk_contribution(portfolio_id: int, session: Session = Depends(get_session)):
    """Retorna a contribuição de risco de cada ativo no portfólio"""
    portfolio = session.get(Portfolio, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfólio não encontrado")
    
    tickets = session.exec(
        select(Ticket).where(Ticket.portfolio_id == portfolio_id)
    ).all()
    
    # Por enquanto, retornar dados mockados
    # Em produção, calcular baseado em covariância e pesos
    contributions = []
    total_weight = sum(
        (t.meta.get("weight", 0) if t.meta else 0) for t in tickets
    ) or 100
    
    for ticket in tickets:
        weight = (ticket.meta.get("weight", 0) if ticket.meta else 0) or (100 / len(tickets) if tickets else 0)
        contributions.append({
            "ticker": ticket.ticker,
            "weight": weight,
            "risk_contribution": weight * 0.15,  # Mock: 15% de risco por ativo
            "marginal_risk": 0.15
        })
    
    return {
        "contributions": contributions,
        "total_risk": sum(c["risk_contribution"] for c in contributions)
    }

