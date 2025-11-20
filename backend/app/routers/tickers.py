from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
from typing import List

from ..db import get_session
from ..schemas import TicketCreate
from ..crud import create_ticket, list_tickets, get_ticket, delete_ticket
from ..services.yfinance_service import ensure_historico_in_db
from ..core.ticker_utils import normalize_ticker

router = APIRouter()

# Rotas sob /portfolios/{portfolio_id}/tickets
@router.get("/portfolios/{portfolio_id}/tickets", response_model=List[dict])
def list_by_portfolio(portfolio_id: int, session: Session = Depends(get_session)):
    """
    Retorna todos os tickets de um portfólio.
    """
    rows = list_tickets(session, portfolio_id)
    return rows

@router.post("/portfolios/{portfolio_id}/tickets", status_code=status.HTTP_201_CREATED)
def create_for_portfolio(portfolio_id: int, payload: TicketCreate, session: Session = Depends(get_session)):
    """
    Cria um ticket no portfólio. Garante que o histórico do ticker exista no DB (chama yfinance uma vez).
    """
    # Normalize ticker (adiciona .SA automaticamente)
    ticker = normalize_ticker(payload.ticker)

    # Tentar garantir historico (down/upsert). Não falhar a criação por causa de fetch temporário.
    try:
        ensure_historico_in_db(ticker)
    except Exception as e:
        # Log e prosseguir: autorização para criar ticket mesmo que fetch falhe (p.ex. rate limit)
        # Em produção, podemos decidir bloquear aqui.
        print(f"[WARN] Falha ao garantir historico para {ticker}: {e}")

    data = {
        "ticker": ticker,
        "quantity": payload.quantity,
        "avg_price": payload.avg_price,
        "buy_date": payload.buy_date,
        "type": payload.type,
        "meta": payload.metadata or {}  # Mapeia metadata do schema para meta do modelo
    }

    ticket = create_ticket(session, portfolio_id, data)
    if not ticket:
        raise HTTPException(status_code=500, detail="Erro ao criar ticket")
    return ticket

# Rotas diretas em /tickets/{ticket_id}
@router.get("/tickets/{ticket_id}")
def get_ticket_by_id(ticket_id: int, session: Session = Depends(get_session)):
    t = get_ticket(session, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Ticket não encontrado")
    return t

@router.delete("/tickets/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket_by_id(ticket_id: int, session: Session = Depends(get_session)):
    ok = delete_ticket(session, ticket_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Ticket não encontrado")
    return None  # 204 No Content não deve ter corpo
