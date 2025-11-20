"""
Router para endpoints do dashboard
"""
from fastapi import APIRouter, Depends
from sqlmodel import Session
from ..db import get_session
from ..models import Portfolio, Ticket
from sqlmodel import select
from datetime import datetime, timedelta

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/comparison")
def get_comparison(session: Session = Depends(get_session)):
    """Retorna dados de comparação de performance dos portfólios vs Ibovespa"""
    # Por enquanto, retornar dados mockados
    # Em produção, calcular baseado em dados reais
    
    dates = []
    portfolios_data = []
    ibovespa_data = []
    
    # Gerar últimos 12 meses
    for i in range(12):
        date = datetime.now() - timedelta(days=30 * (12 - i))
        dates.append(date.isoformat())
        # Dados mockados
        portfolios_data.append(5.0 + i * 0.5)  # Crescimento simulado
        ibovespa_data.append(3.0 + i * 0.3)   # Crescimento simulado
    
    return {
        "dates": dates,
        "portfolios": portfolios_data,
        "ibovespa": ibovespa_data
    }

