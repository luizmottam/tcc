"""
Router para otimização de portfólios (compatível com frontend)
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from ..db import get_session
from ..models import Portfolio, Ticket
from ..services.optimizer_service import optimize
from ..services.backtest_service import calculate_backtest
from sqlmodel import select
import asyncio
import numpy as np

router = APIRouter(prefix="/otimizar", tags=["otimizacao"])

# Armazenamento temporário de progresso (em produção, usar Redis ou banco)
optimization_progress: Dict[str, Dict[str, Any]] = {}

class OptimizeRequest(BaseModel):
    portfolio_id: int
    populacao: Optional[int] = 100
    geracoes: Optional[int] = 50
    risco_peso: Optional[float] = 1.0
    cvar_alpha: Optional[float] = 0.95
    job_id: Optional[str] = None

@router.post("", include_in_schema=True)
@router.post("/", include_in_schema=True)
async def run_optimization(request: OptimizeRequest, session: Session = Depends(get_session)):
    """Executa otimização de portfólio"""
    portfolio = session.get(Portfolio, request.portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfólio não encontrado")
    
    # Buscar tickers do portfólio
    tickets = session.exec(
        select(Ticket).where(Ticket.portfolio_id == request.portfolio_id)
    ).all()
    
    if len(tickets) < 2:
        raise HTTPException(status_code=400, detail="Portfólio precisa ter pelo menos 2 ativos")
    
    tickers = [t.ticker for t in tickets]
    import time
    job_id = request.job_id or f"opt_{request.portfolio_id}_{time.time()}"
    
    # Inicializar progresso
    optimization_progress[job_id] = {
        "status": "running",
        "progress": 0,
        "message": "Iniciando otimização..."
    }
    
    try:
        # Executar otimização
        result = optimize(tickers, persist=True, persist_portfolio_id=request.portfolio_id)
        
        # Calcular pesos originais (do portfólio atual)
        original_weights_dict = {}
        for t in tickets:
            weight = (t.meta.get("weight", 0) if t.meta else 0) or (100.0 / len(tickets))
            original_weights_dict[t.ticker] = weight
        
        # Formatar resposta para o frontend
        optimized_weights = []
        optimized_weights_dict = {}
        for i, ticker in enumerate(tickers):
            weight = result["best_weights"].get(ticker, 0) * 100  # Converter para porcentagem
            optimized_weights.append({
                "ticker": ticker,
                "weight": weight
            })
            optimized_weights_dict[ticker] = weight
        
        # Calcular backtest real (últimos 6 meses)
        backtest_result = calculate_backtest(
            portfolio_id=request.portfolio_id,
            original_weights=original_weights_dict,
            optimized_weights=optimized_weights_dict,
            months=6
        )
        
        # Extrair métricas do backtest
        original_return = backtest_result["original"]["return_pct"]
        optimized_return = backtest_result["optimized"]["return_pct"]
        original_risk = backtest_result["original"]["cvar_pct"]  # Já em decimal
        optimized_risk = backtest_result["optimized"]["cvar_pct"]  # Já em decimal
        
        optimization_progress[job_id] = {
            "status": "completed",
            "progress": 100,
            "message": "Otimização concluída"
        }
        
        # Extrair informações da fronteira de Pareto
        fronteira = result.get("fronteira", [])
        best_solution = result.get("best", {})
        
        # Calcular fitness para todas as soluções (soma normalizada dos objetivos)
        objs_array = np.array([s.get("objectives", [0, 0, 0]) for s in fronteira])
        if len(objs_array) > 0:
            minv = objs_array.min(axis=0)
            maxv = objs_array.max(axis=0)
            denom = (maxv - minv)
            denom[denom == 0] = 1
            norm_objs = (objs_array - minv) / denom
            fitness_scores = norm_objs.sum(axis=1)
        else:
            fitness_scores = np.array([])
        
        # Formatar fronteira para tabela
        fronteira_table = []
        for i, sol in enumerate(fronteira[:20]):  # Limitar a 20 soluções para não sobrecarregar
            obj = sol.get("objectives", [0, 0, 0])
            weights = sol.get("weights", [])
            # Objetivos vêm como (-retorno, risco, cvar) - retorno está negativado
            retorno_neg = obj[0] if len(obj) > 0 else 0.0
            risco = obj[1] if len(obj) > 1 else 0.0
            cvar = obj[2] if len(obj) > 2 else 0.0
            retorno_positivo = -retorno_neg  # Converter de volta para positivo
            
            # Calcular Sharpe Ratio
            sharpe = float(retorno_positivo / risco) if risco > 0 else 0.0
            
            # Fitness (soma normalizada dos objetivos - menor é melhor)
            fitness = float(fitness_scores[i]) if i < len(fitness_scores) else 0.0
            
            # Garantir que weights existe e tem o tamanho correto
            weights_dict = {}
            if weights is not None and len(weights) > 0:
                for j in range(len(tickers)):
                    if j < len(weights):
                        weights_dict[tickers[j]] = float(weights[j] * 100)  # Converter para %
                    else:
                        weights_dict[tickers[j]] = 0.0
            else:
                # Se não tem weights, distribuir igualmente
                for ticker in tickers:
                    weights_dict[ticker] = 100.0 / len(tickers) if len(tickers) > 0 else 0.0
            
            fronteira_table.append({
                "id": i + 1,
                "retorno": float(retorno_positivo * 100),  # Converter para %
                "risco": float(risco * 100),  # Converter para %
                "cvar": float(cvar),  # CVaR em decimal (não converter para %)
                "sharpe": sharpe,
                "fitness": fitness,
                "weights": weights_dict
            })
        
        return {
            "originalReturn": original_return,
            "originalRisk": original_risk,
            "optimizedReturn": optimized_return,
            "optimizedRisk": optimized_risk,
            "improvement": optimized_return - original_return,
            "convergenceGeneration": request.geracoes,
            "optimizedWeights": optimized_weights,
            "backtestResults": backtest_result,
            "backtestSeries": backtest_result.get("backtestSeries", {}),
            "riskContribution": [
                {
                    "ticker": ticker,
                    "contribution": weight * 0.15
                }
                for ticker, weight in result["best_weights"].items()
            ],
            "fronteiraTable": fronteira_table,  # Nova tabela com resultados do AG
            "bestSolution": {
                "retorno": float(-best_solution.get("objectives", [0])[0] * 100) if best_solution.get("objectives") else 0.0,  # Negativo porque vem negativado
                "risco": float(best_solution.get("objectives", [0, 0])[1] * 100) if len(best_solution.get("objectives", [])) > 1 else 0.0,
                "cvar": float(best_solution.get("objectives", [0, 0, 0])[2]) if len(best_solution.get("objectives", [])) > 2 else 0.0,  # CVaR em decimal
            }
        }
    except Exception as e:
        optimization_progress[job_id] = {
            "status": "error",
            "progress": 0,
            "message": str(e)
        }
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/progresso/{job_id}")
def get_optimization_progress(job_id: str):
    """Retorna o progresso da otimização"""
    progress = optimization_progress.get(job_id, {
        "status": "not_found",
        "progress": 0,
        "message": "Job não encontrado"
    })
    
    return progress

