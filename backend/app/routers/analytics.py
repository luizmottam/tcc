"""
Router para analytics de portfólios
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import Session
from ..db import get_session
from ..models import Portfolio, Ticket
from sqlmodel import select
from datetime import datetime, timedelta

router = APIRouter(prefix="/portfolio", tags=["analytics"])

@router.get("/{portfolio_id}/analytics")
def get_portfolio_analytics(portfolio_id: int, session: Session = Depends(get_session)):
    """Retorna analytics detalhados do portfólio"""
    portfolio = session.get(Portfolio, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfólio não encontrado")
    
    # Por enquanto, retornar dados mockados
    # Em produção, calcular baseado em dados reais do histórico
    
    # Gerar dados temporais (últimos 2 anos)
    temporal_evolution = []
    base_date = datetime.now() - timedelta(days=730)
    for i in range(24):  # 24 meses
        date = base_date + timedelta(days=30 * i)
        temporal_evolution.append({
            "date": date.isoformat(),
            "portfolio": 5.0 + i * 0.3,
            "base": 4.0 + i * 0.2,
            "ibovespa": 3.0 + i * 0.15,
            "selic": 10.0 + i * 0.1
        })
    
    # Alocação setorial mockada
    tickets = session.exec(
        select(Ticket).where(Ticket.portfolio_id == portfolio_id)
    ).all()
    
    sectoral_allocation = {}
    for ticket in tickets:
        sector = ticket.type or "Outros"
        weight = ticket.meta.get("weight", 0) if ticket.meta else 0
        sectoral_allocation[sector] = sectoral_allocation.get(sector, 0) + weight
    
    sectoral_list = [
        {"sector": sector, "weight": weight}
        for sector, weight in sectoral_allocation.items()
    ]
    
    return {
        "temporal_evolution": temporal_evolution,
        "sectoral_allocation": sectoral_list,
        "metrics": {
            "portfolio_otimizado": {
                "retorno_anual": 12.5,
                "volatilidade": 15.2,
                "cvar": 8.3,
                "sharpe": 0.82,
                "desvio_padrao": 15.2
            },
            "portfolio_base": {
                "retorno_anual": 10.0,
                "volatilidade": 18.5,
                "cvar": 10.2,
                "sharpe": 0.54,
                "desvio_padrao": 18.5
            },
            "ibovespa": {
                "retorno_anual": 8.5,
                "volatilidade": 20.0,
                "cvar": 12.0,
                "sharpe": 0.43,
                "desvio_padrao": 20.0
            },
            "selic": {
                "retorno_anual": 10.5,
                "volatilidade": 0.1,
                "cvar": 0.05,
                "sharpe": 105.0,
                "desvio_padrao": 0.1
            }
        }
    }

