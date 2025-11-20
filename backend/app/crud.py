from sqlmodel import Session, select
from .models import Portfolio, Ticket, Historico
from datetime import datetime
from typing import List

def create_portfolio(session: Session, name: str, description=None, metadata=None):
    p = Portfolio(name=name, description=description, meta=metadata)
    session.add(p); session.commit(); session.refresh(p)
    return p

def list_portfolios(session: Session) -> List[Portfolio]:
    return session.exec(select(Portfolio)).all()

def get_portfolio(session: Session, portfolio_id: int):
    return session.get(Portfolio, portfolio_id)

def update_portfolio_metadata(session: Session, portfolio_id: int, metadata: dict):
    p = session.get(Portfolio, portfolio_id)
    if not p: return None
    p.meta = metadata
    session.add(p); session.commit(); session.refresh(p)
    return p

def delete_portfolio(session: Session, portfolio_id: int):
    p = session.get(Portfolio, portfolio_id)
    if not p: return False
    session.delete(p); session.commit(); return True

# tickets
def create_ticket(session: Session, portfolio_id: int, ticket_data: dict):
    # Validar que portfolio_id não é None
    if portfolio_id is None:
        raise ValueError("portfolio_id não pode ser None ao criar ticket")
    # Garantir que portfolio_id não está duplicado no ticket_data
    ticket_data = {k: v for k, v in ticket_data.items() if k != 'portfolio_id'}
    t = Ticket(portfolio_id=portfolio_id, **ticket_data)
    session.add(t); session.commit(); session.refresh(t); return t

def list_tickets(session: Session, portfolio_id: int):
    return session.exec(select(Ticket).where(Ticket.portfolio_id == portfolio_id)).all()

def get_ticket(session: Session, ticket_id: int):
    return session.get(Ticket, ticket_id)

def delete_ticket(session: Session, ticket_id: int):
    t = session.get(Ticket, ticket_id)
    if not t: return False
    session.delete(t); session.commit(); return True

# historico upsert
def upsert_historico(session: Session, ticker: str, rows: List[dict]):
    # rows: [{'date': datetime, 'close':float, 'volume': float}]
    for r in rows:
        existing = session.exec(select(Historico).where(Historico.ticker==ticker, Historico.date==r['date'])).first()
        if existing:
            existing.close = r['close']; existing.volume = r.get('volume')
            # ret calc later in batch
            session.add(existing)
        else:
            h = Historico(ticker=ticker, date=r['date'], close=r['close'], volume=r.get('volume'))
            session.add(h)
    session.commit()
    return True

def get_historico(session: Session, ticker: str, limit: int = 1000):
    return session.exec(select(Historico).where(Historico.ticker==ticker).order_by(Historico.date.desc()).limit(limit)).all()
