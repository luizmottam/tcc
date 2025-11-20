import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import init_db
from .routers import (
    portfolios, 
    tickers, 
    historico, 
    optimize,
    portfolio_singular,
    ativos,
    portfolio_ativos,
    dashboard,
    prices,
    analytics,
    risk_contribution,
    otimizar
)
from .jobs import start_jobs

def create_app():
    app = FastAPI(
        title="MVP Otimização de Portfólio - GA Simples",
        version="1.0.0",
        redirect_slashes=False  # Desabilita redirects automáticos de /portfolios para /portfolios/
    )
    
    # Configurar CORS para permitir requisições do frontend
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",  # Vite padrão
            "http://localhost:3000",  # React padrão
            "http://localhost:8080",  # Porta alternativa
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:8080"
        ],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=3600,
    )
    
    # Inicializa DB (cria banco se não existir e cria tabelas)
    init_db()

    # Registra rotas
    app.include_router(portfolios.router)  # /portfolios (plural)
    app.include_router(portfolio_singular.router)  # /portfolio (singular) - compatível com frontend
    app.include_router(tickers.router)  # /tickets
    app.include_router(historico.router)  # /historico
    app.include_router(optimize.router)  # /optimize
    app.include_router(otimizar.router)  # /otimizar - compatível com frontend
    app.include_router(ativos.router)  # /ativos
    app.include_router(portfolio_ativos.router)  # /portfolio/ativos
    app.include_router(dashboard.router)  # /dashboard
    app.include_router(prices.router)  # /prices
    app.include_router(analytics.router)  # /portfolio/{id}/analytics
    app.include_router(risk_contribution.router)  # /portfolio/{id}/risk-contribution

    return app

app = create_app()

if __name__ == "__main__":
    # Inicia cron jobs (atualização de histórico, etc)
    start_jobs()

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
