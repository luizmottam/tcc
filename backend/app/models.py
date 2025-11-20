from sqlmodel import SQLModel, Field, Relationship, Column, JSON
from typing import Optional, List
from datetime import datetime

class Portfolio(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    meta: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    # Métricas do portfólio (calculadas e persistidas)
    total_return: Optional[float] = Field(default=None, description="Retorno total acumulado do portfólio (%)")
    total_risk: Optional[float] = Field(default=None, description="Risco total (volatilidade) do portfólio (%)")
    total_cvar: Optional[float] = Field(default=None, description="CVaR total do portfólio (%)")
    tickets: List["Ticket"] = Relationship(back_populates="portfolio")

class Ticket(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    portfolio_id: int = Field(foreign_key="portfolio.id", nullable=False)
    ticker: str
    quantity: float
    avg_price: float
    buy_date: datetime
    type: Optional[str] = None
    meta: Optional[dict] = Field(default=None, sa_column=Column(JSON))

    portfolio: Optional[Portfolio] = Relationship(back_populates="tickets")
    
    def __init__(self, **data):
        # Garantir que portfolio_id nunca seja None
        if 'portfolio_id' in data and data['portfolio_id'] is None:
            raise ValueError("portfolio_id não pode ser None")
        super().__init__(**data)

class Historico(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    ticker: str = Field(index=True)
    date: datetime = Field(index=True)
    close: float
    volume: Optional[float] = None
    ret_daily: Optional[float] = None
    ret_weekly: Optional[float] = None
    ret_monthly: Optional[float] = None

    class Config:
        arbitrary_types_allowed = True
