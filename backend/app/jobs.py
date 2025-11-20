from apscheduler.schedulers.asyncio import AsyncIOScheduler
from .config import settings
from .services.yfinance_service import ensure_historico_in_db
from sqlmodel import Session
from .crud import list_portfolios
import asyncio

sched = AsyncIOScheduler()

def start_jobs():
    # Job: update historico for tickers referenced in tickets
    async def daily_update():
        # naive implementation: find distinct tickers from DB
        from .db import engine
        from .models import Ticket
        from sqlmodel import select
        with Session(engine) as session:
            rows = session.exec(select(Ticket.ticker)).all()
            tickers = list(set([r for r in rows if r]))
        for t in tickers:
            try:
                ensure_historico_in_db(t)
            except Exception as e:
                print("Erro ao atualizar", t, e)
    sched.add_job(daily_update, 'cron', hour=2)  # runs daily at 02:00
    sched.start()
