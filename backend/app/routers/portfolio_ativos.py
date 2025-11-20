"""
Router para gerenciamento de ativos em portfólios
"""
from fastapi import APIRouter, HTTPException, Depends, Body
from sqlmodel import Session
from typing import Optional
from ..db import get_session
from ..models import Portfolio, Ticket
from ..crud import create_ticket, delete_ticket, get_ticket
from ..core.ticker_utils import normalize_ticker
from sqlmodel import select
from datetime import datetime

router = APIRouter(prefix="/portfolio", tags=["portfolio-ativos"])

@router.post("/ativos", status_code=201)
def add_ativo_to_portfolio(payload: dict, session: Session = Depends(get_session)):
    """Adiciona um ativo a um portfólio"""
    portfolio_id = payload.get("portfolio_id")
    ativo_id = payload.get("ativo_id")
    weight = payload.get("weight", 0)  # Peso em porcentagem (0-100)
    ticker = normalize_ticker(payload.get("ticker", "")) if payload.get("ticker") else ""
    
    if not portfolio_id:
        raise HTTPException(status_code=400, detail="portfolio_id é obrigatório")
    
    # Verificar se portfólio existe
    portfolio = session.get(Portfolio, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfólio não encontrado")
    
    # Se não temos ticker no payload, tentar buscar de um ticket existente pelo ativo_id
    if not ticker and ativo_id and ativo_id != 0:
        existing_ticket = session.get(Ticket, ativo_id)
        if existing_ticket:
            ticker = existing_ticket.ticker
    
    # Ticker é obrigatório
    if not ticker:
        raise HTTPException(
            status_code=400, 
            detail="ticker é obrigatório. Envie 'ticker' no payload."
        )
    
    # Verificar se já existe ticket com esse ticker neste portfólio
    existing = session.exec(
        select(Ticket)
        .where(Ticket.portfolio_id == portfolio_id)
        .where(Ticket.ticker == ticker)
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail=f"Ativo {ticker} já existe neste portfólio")
    
    # Criar novo ticket (ativo no portfólio)
    ticket_data = {
        "ticker": ticker,
        "quantity": weight / 100.0,  # Converter porcentagem para quantidade relativa
        "avg_price": 0.0,
        "buy_date": datetime.utcnow(),
        "type": payload.get("sector", ""),
        "meta": {"weight": weight}
    }
    
    ticket = create_ticket(session, portfolio_id, ticket_data)
    
    return {
        "id": ticket.id,
        "ticker": ticket.ticker,
        "weight": weight,
        "message": "Ativo adicionado ao portfólio"
    }

@router.put("/{portfolio_id}/ativos/{ativo_id}")
def update_ativo_weight(
    portfolio_id: int,
    ativo_id: int,
    payload: dict,
    session: Session = Depends(get_session)
):
    """Atualiza o peso de um ativo no portfólio"""
    weight = payload.get("weight", 0)  # Peso em porcentagem
    
    ticket = get_ticket(session, ativo_id)
    if not ticket or ticket.portfolio_id != portfolio_id:
        raise HTTPException(status_code=404, detail="Ativo não encontrado no portfólio")
    
    # Atualizar peso no metadata
    if not ticket.meta:
        ticket.meta = {}
    ticket.meta["weight"] = weight
    ticket.quantity = weight / 100.0  # Atualizar quantity também
    
    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    
    return {
        "id": ticket.id,
        "ticker": ticket.ticker,
        "weight": weight,
        "message": "Peso atualizado"
    }

@router.delete("/{portfolio_id}/ativos/{ativo_id}")
def remove_ativo_from_portfolio(
    portfolio_id: int,
    ativo_id: int,
    session: Session = Depends(get_session)
):
    """Remove um ativo de um portfólio"""
    ticket = get_ticket(session, ativo_id)
    if not ticket or ticket.portfolio_id != portfolio_id:
        raise HTTPException(status_code=404, detail="Ativo não encontrado no portfólio")
    
    ok = delete_ticket(session, ativo_id)
    if not ok:
        raise HTTPException(status_code=500, detail="Erro ao remover ativo")
    
    return {"ok": True, "message": "Ativo removido do portfólio"}

