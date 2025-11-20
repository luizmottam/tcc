from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class TicketCreate(BaseModel):
    ticker: str
    quantity: float
    avg_price: float
    buy_date: datetime
    type: Optional[str] = None
    metadata: Optional[dict] = None

class PortfolioCreate(BaseModel):
    name: str
    description: Optional[str] = None
    metadata: Optional[dict] = None

class HistoricoResponse(BaseModel):
    ticker: str
    date: datetime
    close: float
    ret_daily: Optional[float] = None
