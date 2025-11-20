"""
Router para gerenciamento de ativos
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import Session
from typing import List, Optional
from pydantic import BaseModel
from ..db import get_session
from ..models import Ticket, Historico
from ..core.ticker_utils import normalize_ticker
from sqlmodel import select

router = APIRouter(prefix="/ativos", tags=["ativos"])

class AtivoCreate(BaseModel):
    ticker: str
    nome_empresa: Optional[str] = None
    setor: Optional[str] = None
    segmento: Optional[str] = None

@router.get("", include_in_schema=True)
@router.get("/", include_in_schema=True)
def list_ativos(session: Session = Depends(get_session)):
    """Lista todos os ativos únicos (tickers)"""
    # Buscar todos os tickers únicos dos tickets
    tickets = session.exec(select(Ticket.ticker).distinct()).all()
    
    ativos = []
    for ticker in tickets:
        # Buscar último ticket com esse ticker para pegar informações
        ticket = session.exec(
            select(Ticket).where(Ticket.ticker == ticker).limit(1)
        ).first()
        
        if ticket:
            ativos.append({
                "id": ticket.id,
                "ticker": ticket.ticker,
                "nome_empresa": ticket.ticker,
                "setor": ticket.type or "",
                "segmento": ticket.type or ""
            })
    
    return ativos

@router.post("", status_code=201, include_in_schema=True)
@router.post("/", status_code=201, include_in_schema=True)
def create_ativo(payload: AtivoCreate, session: Session = Depends(get_session)):
    """Cria um novo ativo (apenas registra o ticker)"""
    # Na verdade, não criamos um ativo separado, apenas retornamos o ID baseado no ticker
    # O ativo será criado quando associado a um portfólio
    ticker = normalize_ticker(payload.ticker)
    
    # Verificar se já existe algum ticket com esse ticker
    existing = session.exec(
        select(Ticket).where(Ticket.ticker == ticker).limit(1)
    ).first()
    
    if existing:
        return {"ativo_id": existing.id, "ticker": ticker, "message": "Ativo já existe"}
    
    # Retornar um ID temporário (será criado quando associado ao portfólio)
    return {
        "ativo_id": 0,  # Será criado quando associado
        "ticker": ticker,
        "message": "Ativo será criado ao ser associado ao portfólio"
    }

