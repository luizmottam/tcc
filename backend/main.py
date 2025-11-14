# main_refatorado.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict
import db
from pydantic import BaseModel
import numpy as np
import pandas as pd
from price_fetch import (
    normalize_ticker,
    get_price_history,
    get_returns_matrix,
    compute_asset_metrics,
    get_ibovespa_series,
    get_sector_from_ticker,
    calculate_portfolio_metrics,
    get_performance_series,
)
from ga import run_ga  # algoritmo genético single-objective
from nsga2 import run_nsga2  # NSGA-II multi-objective
import mysql.connector
import threading
import time
import uuid

# -------------------------
# MODELS
# -------------------------
class AssetOut(BaseModel):
    id: str
    ticker: str
    sector: Optional[str]
    weight: float  # em %
    expectedReturn: Optional[float] = None
    cvar: Optional[float] = None

class PortfolioOut(BaseModel):
    id: str
    name: str
    createdAt: str
    assets: List[AssetOut]
    totalReturn: Optional[float] = None
    totalRisk: Optional[float] = None

class OptimizationResultOut(BaseModel):
    originalReturn: float
    originalRisk: float
    optimizedReturn: float
    optimizedRisk: float
    improvement: float
    convergenceGeneration: int
    optimizedWeights: List[dict]

# -------------------------
# APP & CORS
# -------------------------
app = FastAPI(title="API Refatorada - Portfólios GA + CVaR")
db.create_database_and_tables()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Armazenamento de progresso de otimização (em memória)
optimization_progress = {}
progress_lock = threading.Lock()

# -------------------------
# FUNÇÕES AUXILIARES
# -------------------------
def print_individuals_table(results: List[Dict], tickers: List[str]):
    """
    Imprime uma tabela formatada com informações sobre os top indivíduos do GA.
    """
    if not results:
        print("\n[GA] Nenhum resultado para exibir")
        return
    
    print("\n" + "="*130)
    print(" " * 45 + "TABELA DE INDIVÍDUOS - TOP 10 SOLUÇÕES")
    print("="*130)
    
    # Cabeçalho
    header = f"{'Rank':<6} {'Retorno %':<12} {'CVaR %':<12} {'Fitness':<12} {'Sharpe':<10} {'Pesos (%)':<60}"
    print(header)
    print("-" * 130)
    
    # Dados dos indivíduos
    for idx, ind in enumerate(results, 1):
        ret = float(ind.get("retorno_esperado_pct", 0))
        cvar = float(ind.get("risco_cvar_pct", 0))
        var = float(ind.get("variancia_anual", 0))
        pesos = ind.get("pesos_pct", [])
        
        # Calcular fitness aproximado (retorno - risco)
        fitness = ret - cvar
        sharpe = (ret / cvar) if cvar > 0 else 0.0
        
        # Formatar pesos como string (mostrar apenas os maiores, ordenados)
        peso_tuples = [(tickers[i] if i < len(tickers) else f"Ativo{i+1}", float(p)) 
                       for i, p in enumerate(pesos) if p > 0.1]
        peso_tuples.sort(key=lambda x: x[1], reverse=True)  # Ordenar por peso
        pesos_str = ", ".join([f"{t}:{p:.1f}%" for t, p in peso_tuples[:5]])  # Top 5 pesos
        if len(peso_tuples) > 5:
            pesos_str += f" (+{len(peso_tuples) - 5} outros)"
        if len(pesos_str) > 58:
            pesos_str = pesos_str[:55] + "..."
        
        row = f"{idx:<6} {ret:>10.2f}% {cvar:>10.2f}% {fitness:>10.2f} {sharpe:>8.2f} {pesos_str:<60}"
        print(row)
    
    print("-" * 130)
    
    # Estatísticas resumidas
    if len(results) > 0:
        best = results[0]
        worst = results[-1] if len(results) > 1 else results[0]
        
        best_ret = float(best.get('retorno_esperado_pct', 0))
        best_cvar = float(best.get('risco_cvar_pct', 0))
        best_sharpe = (best_ret / best_cvar) if best_cvar > 0 else 0.0
        
        worst_ret = float(worst.get('retorno_esperado_pct', 0))
        worst_cvar = float(worst.get('risco_cvar_pct', 0))
        worst_sharpe = (worst_ret / worst_cvar) if worst_cvar > 0 else 0.0
        
        print(f"\n{'Melhor Indivíduo:':<25} Retorno: {best_ret:>7.2f}% | CVaR: {best_cvar:>7.2f}% | Sharpe: {best_sharpe:>6.2f}")
        if len(results) > 1:
            print(f"{'Pior Indivíduo (top 10):':<25} Retorno: {worst_ret:>7.2f}% | CVaR: {worst_cvar:>7.2f}% | Sharpe: {worst_sharpe:>6.2f}")
        
        # Distribuição de pesos do melhor indivíduo
        print(f"\n{'Distribuição do Melhor Indivíduo:'}")
        best_pesos = best.get("pesos_pct", [])
        peso_list = [(tickers[i] if i < len(tickers) else f"Ativo{i+1}", float(p)) 
                     for i, p in enumerate(best_pesos) if p > 0.01]
        peso_list.sort(key=lambda x: x[1], reverse=True)
        
        total_shown = 0
        for ticker, peso in peso_list:
            print(f"  {ticker:<20} {peso:>7.2f}%")
            total_shown += peso
        if total_shown < 100:
            print(f"  {'(outros)':<20} {100 - total_shown:>7.2f}%")
    
    print("="*130 + "\n")

# -------------------------
# UTIL
# -------------------------
def get_db_conn():
    return db.get_connection(db.DB_NAME)

# -------------------------
# CRUD PORTFÓLIO
# -------------------------
@app.get("/portfolios", response_model=List[PortfolioOut])
def list_portfolios():
    conn = get_db_conn()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT id, titulo, data_criacao FROM portfolios ORDER BY data_criacao DESC")
        rows = cur.fetchall()
        portfolios = []
        for p in rows:
            # buscar ativos
            cur.execute("""
                SELECT a.id as ativo_id, a.ticker, a.setor, pa.peso
                FROM portfolio_ativos pa
                JOIN ativos a ON a.id = pa.ativo_id
                WHERE pa.portfolio_id=%s
            """, (p["id"],))
            ativos = cur.fetchall()
            assets = []
            for a in ativos:
                assets.append({
                    "id": str(a["ativo_id"]),
                    "ticker": a["ticker"],
                    "sector": a.get("setor"),
                    "weight": float(a.get("peso") or 0) * 100,
                    "expectedReturn": None,
                    "cvar": None
                })
            # calcular métricas
            tickers = [normalize_ticker(a["ticker"]) for a in assets]
            try:
                metrics = compute_asset_metrics(tickers, period="1y")
                for a in assets:
                    key = normalize_ticker(a["ticker"])
                    if key in metrics:
                        a["expectedReturn"] = metrics[key]["expectedReturn"]
                        a["cvar"] = metrics[key]["cvar"]
            except:
                pass
            
            # Calcular retorno e risco do portfólio corretamente
            # Retorno: média ponderada simples (correto)
            totalReturn = sum((a["expectedReturn"] or 0) * (a["weight"]/100) for a in assets)
            
            # Risco: usar cálculo correto do portfólio considerando correlação
            totalRisk = None
            assets_with_weight = [a for a in assets if a["weight"] > 0]
            if len(tickers) > 0 and len(assets_with_weight) > 0:
                try:
                    # Filtrar apenas ativos com peso > 0 e manter ordem
                    filtered_tickers = []
                    filtered_weights = []
                    for i, a in enumerate(assets):
                        if a["weight"] > 0:
                            filtered_tickers.append(tickers[i])
                            filtered_weights.append(a["weight"] / 100)
                    
                    if len(filtered_tickers) > 0:
                        # Obter pesos normalizados (0-1)
                        weights_array = np.array(filtered_weights)
                        # Normalizar para somar 1
                        total_weight_sum = weights_array.sum()
                        if total_weight_sum > 0:
                            weights_array = weights_array / total_weight_sum
                            
                            # Calcular métricas do portfólio usando função correta
                            portfolio_metrics = calculate_portfolio_metrics(filtered_tickers, weights_array, period="1y")
                            totalRisk = portfolio_metrics.get("cvar", 0.0)
                except Exception as e:
                    print(f"[AVISO] Erro ao calcular risco do portfólio: {e}")
                    # Fallback: média ponderada simples (menos preciso)
                    totalRisk = sum((a["cvar"] or 0) * (a["weight"]/100) for a in assets)
            
            if totalRisk is None:
                totalRisk = sum((a["cvar"] or 0) * (a["weight"]/100) for a in assets)
            portfolios.append({
                "id": str(p["id"]),
                "name": p["titulo"],
                "createdAt": str(p["data_criacao"]),
                "assets": assets,
                "totalReturn": round(totalReturn, 2),
                "totalRisk": round(totalRisk, 2)
            })
        return portfolios
    finally:
        cur.close()
        conn.close()

@app.get("/portfolio/{portfolio_id}", response_model=PortfolioOut)
def get_portfolio(portfolio_id: int):
    conn = get_db_conn()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT id, titulo, data_criacao FROM portfolios WHERE id=%s", (portfolio_id,))
        p = cur.fetchone()
        if not p:
            raise HTTPException(status_code=404, detail="Portfólio não encontrado")
        # buscar ativos
        cur.execute("""
            SELECT a.id as ativo_id, a.ticker, a.setor, pa.peso
            FROM portfolio_ativos pa
            JOIN ativos a ON a.id = pa.ativo_id
            WHERE pa.portfolio_id=%s
        """, (portfolio_id,))
        ativos = cur.fetchall()
        assets = []
        for a in ativos:
            assets.append({
                "id": str(a["ativo_id"]),
                "ticker": a["ticker"],
                "sector": a.get("setor"),
                "weight": float(a.get("peso") or 0) * 100,
                "expectedReturn": None,
                "cvar": None
            })
        tickers = [normalize_ticker(a["ticker"]) for a in assets]
        try:
            metrics = compute_asset_metrics(tickers, period="1y")
            for a in assets:
                key = normalize_ticker(a["ticker"])
                if key in metrics:
                    a["expectedReturn"] = metrics[key]["expectedReturn"]
                    a["cvar"] = metrics[key]["cvar"]
        except:
            pass
        
        # Calcular retorno e risco do portfólio corretamente
        # Retorno: média ponderada simples (correto)
        totalReturn = sum((a["expectedReturn"] or 0) * (a["weight"]/100) for a in assets)
        
        # Risco: usar cálculo correto do portfólio considerando correlação
        totalRisk = None
        assets_with_weight = [a for a in assets if a["weight"] > 0]
        if len(tickers) > 0 and len(assets_with_weight) > 0:
            try:
                # Filtrar apenas ativos com peso > 0 e manter ordem
                filtered_tickers = []
                filtered_weights = []
                for i, a in enumerate(assets):
                    if a["weight"] > 0:
                        filtered_tickers.append(tickers[i])
                        filtered_weights.append(a["weight"] / 100)
                
                if len(filtered_tickers) > 0:
                    # Obter pesos normalizados (0-1)
                    weights_array = np.array(filtered_weights)
                    # Normalizar para somar 1
                    total_weight_sum = weights_array.sum()
                    if total_weight_sum > 0:
                        weights_array = weights_array / total_weight_sum
                        
                        # Calcular métricas do portfólio usando função correta
                        portfolio_metrics = calculate_portfolio_metrics(filtered_tickers, weights_array, period="1y")
                        totalRisk = portfolio_metrics.get("cvar", 0.0)
            except Exception as e:
                print(f"[AVISO] Erro ao calcular risco do portfólio: {e}")
                # Fallback: média ponderada simples (menos preciso)
                totalRisk = sum((a["cvar"] or 0) * (a["weight"]/100) for a in assets)
        
        if totalRisk is None:
            totalRisk = sum((a["cvar"] or 0) * (a["weight"]/100) for a in assets)
        return {
            "id": str(p["id"]),
            "name": p["titulo"],
            "createdAt": str(p["data_criacao"]),
            "assets": assets,
            "totalReturn": round(totalReturn,2),
            "totalRisk": round(totalRisk,2)
        }
    finally:
        cur.close()
        conn.close()

@app.post("/portfolio", status_code=201)
def create_portfolio(data: dict):
    name = data.get("name") or data.get("titulo")
    if not name:
        raise HTTPException(status_code=400, detail="Campo 'name' obrigatório")
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO portfolios (titulo) VALUES (%s)", (name,))
        conn.commit()
        return {"portfolio_id": cur.lastrowid, "name": name}
    finally:
        cur.close()
        conn.close()

@app.put("/portfolio/{portfolio_id}")
def update_portfolio(portfolio_id: int, data: dict):
    name = data.get("name") or data.get("titulo")
    if not name:
        raise HTTPException(status_code=400, detail="Campo 'name' obrigatório")
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM portfolios WHERE id=%s", (portfolio_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Portfólio não encontrado")
        cur.execute("UPDATE portfolios SET titulo=%s WHERE id=%s", (name, portfolio_id))
        conn.commit()
        return {"msg": "Portfólio atualizado", "name": name}
    finally:
        cur.close()
        conn.close()

@app.delete("/portfolio/{portfolio_id}")
def delete_portfolio(portfolio_id: int):
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM portfolios WHERE id=%s", (portfolio_id,))
        conn.commit()
        return {"msg": "Portfólio deletado"}
    finally:
        cur.close()
        conn.close()

# -------------------------
# CRUD ATIVOS NO PORTFÓLIO
# -------------------------
@app.get("/ativos")
def list_ativos():
    conn = get_db_conn()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT id, ticker, setor FROM ativos ORDER BY ticker")
        rows = cur.fetchall()
        return [{"id": r["id"], "ticker": r["ticker"], "sector": r.get("setor")} for r in rows]
    finally:
        cur.close()
        conn.close()

@app.post("/ativos", status_code=201)
def create_asset(data: dict):
    ticker = data.get("ticker")
    sector = data.get("sector") or data.get("setor")
    if not ticker:
        raise HTTPException(status_code=400, detail="Campo 'ticker' obrigatório")
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO ativos (ticker, setor) VALUES (%s,%s)", (ticker.upper(), sector))
        conn.commit()
        return {"ativo_id": cur.lastrowid, "ticker": ticker.upper()}
    finally:
        cur.close()
        conn.close()

@app.put("/ativos/{ativo_id}")
def update_asset(ativo_id: int, data: dict):
    ticker = data.get("ticker")
    sector = data.get("sector") or data.get("setor")
    if not ticker:
        raise HTTPException(status_code=400, detail="Campo 'ticker' obrigatório")
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE ativos SET ticker=%s, setor=%s WHERE id=%s", (ticker.upper(), sector, ativo_id))
        conn.commit()
        return {"msg": "Ativo atualizado", "ativo_id": ativo_id}
    finally:
        cur.close()
        conn.close()

@app.post("/portfolio/ativos", status_code=201)
def add_asset_to_portfolio(data: dict):
    portfolio_id = data.get("portfolio_id")
    ativo_id = data.get("ativo_id")
    weight = float(data.get("weight") or data.get("peso") or 0)
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO portfolio_ativos (portfolio_id, ativo_id, peso) VALUES (%s,%s,%s)",
                    (portfolio_id, ativo_id, weight/100))
        conn.commit()
        return {"msg": "Ativo adicionado ao portfólio"}
    finally:
        cur.close()
        conn.close()

@app.put("/portfolio/{portfolio_id}/ativos/{ativo_id}")
def update_asset_weight(portfolio_id: int, ativo_id: int, data: dict):
    weight = float(data.get("weight") or data.get("peso") or 0)
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE portfolio_ativos SET peso=%s WHERE portfolio_id=%s AND ativo_id=%s",
                    (weight/100, portfolio_id, ativo_id))
        conn.commit()
        return {"msg": "Peso atualizado"}
    finally:
        cur.close()
        conn.close()

@app.delete("/portfolio/{portfolio_id}/ativos/{ativo_id}")
def remove_asset_from_portfolio(portfolio_id: int, ativo_id: int):
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM portfolio_ativos WHERE portfolio_id=%s AND ativo_id=%s",
                    (portfolio_id, ativo_id))
        conn.commit()
        return {"msg": "Ativo removido"}
    finally:
        cur.close()
        conn.close()

# -------------------------
# OTIMIZAÇÃO
# -------------------------
@app.get("/otimizar/progresso/{job_id}")
def get_optimization_progress(job_id: str):
    """Retorna o progresso atual da otimização"""
    with progress_lock:
        progress = optimization_progress.get(job_id, {
            "status": "not_found",
            "progress": 0,
            "message": "Job não encontrado"
        })
    return progress

@app.post("/otimizar", response_model=OptimizationResultOut)
def optimize_portfolio(data: dict):
    portfolio_id = data.get("portfolio_id")
    populacao = data.get("populacao", 100)
    geracoes = data.get("geracoes", 50)
    risco_peso = data.get("risco_peso", 1.0)
    cvar_alpha = data.get("cvar_alpha", 0.95)
    job_id = data.get("job_id", str(uuid.uuid4()))

    # Inicializar progresso
    with progress_lock:
        optimization_progress[job_id] = {
            "status": "running",
            "progress": 0,
            "message": "Iniciando otimização...",
            "step": "init"
        }

    def update_progress(progress: int, message: str, step: str = ""):
        with progress_lock:
            optimization_progress[job_id] = {
                "status": "running",
                "progress": progress,
                "message": message,
                "step": step
            }

    try:
        print(f"[OTIMIZAÇÃO] Iniciando otimização para portfólio {portfolio_id}, job_id: {job_id}")
        update_progress(5, "Carregando dados do portfólio...", "loading_portfolio")
        print(f"[OTIMIZAÇÃO] Progresso: 5% - Carregando dados do portfólio")
        
        conn = get_db_conn()
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute("""
                SELECT a.ticker, pa.peso
                FROM portfolio_ativos pa
                JOIN ativos a ON a.id = pa.ativo_id
                WHERE pa.portfolio_id = %s
            """, (portfolio_id,))
            rows = cur.fetchall()
            if not rows:
                raise HTTPException(status_code=400, detail="Portfólio sem ativos")

            tickers = [normalize_ticker(r["ticker"]) for r in rows]
            weights = np.array([float(r["peso"]) for r in rows])
            print(f"[OTIMIZAÇÃO] Tickers encontrados: {tickers}")

            update_progress(15, f"Buscando dados históricos de {len(tickers)} ativos...", "fetching_prices")
            print(f"[OTIMIZAÇÃO] Progresso: 15% - Buscando dados históricos de {len(tickers)} ativos")
            return_matrix = get_returns_matrix(tickers, period="2y")
            print(f"[OTIMIZAÇÃO] Matriz de retornos obtida: {return_matrix.shape}")
            
            update_progress(40, "Calculando métricas dos ativos...", "computing_metrics")
            print(f"[OTIMIZAÇÃO] Progresso: 40% - Calculando métricas dos ativos")
            # Calcular retorno e risco originais usando o mesmo método do portfólio
            try:
                # Retorno: média ponderada simples (correto)
                metrics = compute_asset_metrics(tickers, period="1y")
                original_returns = np.array([metrics.get(normalize_ticker(t), {}).get("expectedReturn", 0.1) for t in tickers])
                original_return = np.sum(weights * original_returns)
                
                # Risco: usar cálculo correto do portfólio considerando correlação (mesmo método usado em get_portfolio)
                try:
                    # Normalizar pesos para somar 1
                    weights_normalized = weights / weights.sum() if weights.sum() > 0 else weights
                    original_metrics = calculate_portfolio_metrics(tickers, weights_normalized, period="1y")
                    original_risk = original_metrics.get("cvar", 0.0)
                    print(f"[OTIMIZAÇÃO] Risco original calculado com correlação: {original_risk:.2f}%")
                except Exception as e:
                    print(f"[AVISO] Erro ao calcular risco original com correlação, usando fallback: {e}")
                    # Fallback: média ponderada simples
                    original_risks = np.array([metrics.get(normalize_ticker(t), {}).get("cvar", 0.05) for t in tickers])
                    original_risk = np.sum(weights * original_risks)
            except Exception as e:
                print(f"[ERRO] Falha ao calcular métricas originais: {e}")
                original_return = np.sum(weights * np.array([0.1]*len(weights)))
                original_risk = np.sum(weights * np.array([0.05]*len(weights)))

            update_progress(50, f"Executando NSGA-II ({populacao} indivíduos, {geracoes} gerações)...", "running_ga")
            print(f"[OTIMIZAÇÃO] Progresso: 50% - Executando NSGA-II ({populacao} indivíduos, {geracoes} gerações)")
            
            # Usar NSGA-II para otimização multi-objetivo
            use_nsga2 = data.get("use_nsga2", True)  # Por padrão usa NSGA-II
            if use_nsga2:
                ga_result = run_nsga2(return_matrix, tickers, populacao, geracoes, cvar_alpha)
                print(f"[OTIMIZAÇÃO] NSGA-II concluído. Fronteira de Pareto com {len(ga_result['results'])} soluções.")
            else:
                ga_result = run_ga(return_matrix, tickers, populacao, geracoes, risco_peso, cvar_alpha)
                print(f"[OTIMIZAÇÃO] GA single-objective concluído. Melhor fitness: {ga_result['results'][0].get('retorno_esperado_pct', 0):.2f}%")
            
            # Mostrar tabela dos indivíduos
            print_individuals_table(ga_result["results"], tickers)

            update_progress(90, "Processando resultados...", "processing_results")
            print(f"[OTIMIZAÇÃO] Progresso: 90% - Processando resultados")
            # preparar retorno compatível com OptimizationResult
            best = ga_result["results"][0]
            print(f"[OTIMIZAÇÃO] Melhor resultado: {best}")
            
            # Garantir que optimized_weights está no formato correto
            optimized_weights = []
            if "tickers" in best and "pesos_pct" in best:
                for t, w in zip(best["tickers"], best["pesos_pct"]):
                    optimized_weights.append({
                        "ticker": str(t),
                        "weight": float(w)
                    })
            print(f"[OTIMIZAÇÃO] Pesos otimizados: {optimized_weights}")

            # Preparar histórico para o frontend
            history = ga_result.get("history", [])
            history_formatted = [
                {
                    "generation": h.get("generation", 0),
                    "ret": float(h.get("annual_return", 0) * 100),  # converter para %
                    "cvar": float(h.get("annual_cvar", 0) * 100),  # converter para %
                    "fitness": float(h.get("fitness", 0) * 100),
                }
                for h in history
            ]

            optimized_return = float(best.get("retorno_esperado_pct", 0))
            optimized_risk = float(best.get("risco_cvar_pct", 0))
            original_return_val = float(original_return)
            
            # Calcular séries temporais e métricas
            try:
                update_progress(95, "Calculando séries temporais e métricas...", "calculating_metrics")
                print(f"[OTIMIZAÇÃO] Calculando séries temporais e métricas")
                
                # Série temporal do portfólio otimizado
                optimized_weights_array = np.array([w / 100 for w in best["pesos_pct"]])
                performance_series = get_performance_series(tickers, optimized_weights_array, period="2y")
                
                # Série temporal do portfólio original
                original_weights_array = np.array(weights)
                original_performance_series = get_performance_series(tickers, original_weights_array, period="2y")
                
                # Métricas quantitativas
                optimized_metrics = calculate_portfolio_metrics(tickers, optimized_weights_array, period="2y")
                original_metrics = calculate_portfolio_metrics(tickers, original_weights_array, period="2y")
                
                # Alocação setorial
                sector_allocation = {}
                for t, w in zip(tickers, best["pesos_pct"]):
                    sector = get_sector_from_ticker(t)
                    if not sector or sector == "":
                        sector = "Outros"
                    sector_allocation[sector] = sector_allocation.get(sector, 0) + float(w)
                
                # Garantir que sempre há dados (mesmo que vazio)
                if not sector_allocation:
                    sector_allocation = {"Outros": 100.0}
                
                print(f"[OTIMIZAÇÃO] Alocação setorial calculada: {sector_allocation}")
                
                # Formatar séries para JSON
                performance_data = performance_series.to_dict('records') if not performance_series.empty else []
                original_performance_data = original_performance_series.to_dict('records') if not original_performance_series.empty else []
                
            except Exception as e:
                print(f"[ERRO] Falha ao calcular séries temporais: {e}")
                import traceback
                traceback.print_exc()
                performance_data = []
                original_performance_data = []
                optimized_metrics = {}
                original_metrics = {}
                # Calcular alocação setorial mesmo em caso de erro nas séries
                sector_allocation = {}
                try:
                    for t, w in zip(tickers, best["pesos_pct"]):
                        sector = get_sector_from_ticker(t)
                        if not sector or sector == "":
                            sector = "Outros"
                        sector_allocation[sector] = sector_allocation.get(sector, 0) + float(w)
                    if not sector_allocation:
                        sector_allocation = {"Outros": 100.0}
                except Exception as e2:
                    print(f"[ERRO] Falha ao calcular alocação setorial: {e2}")
                    sector_allocation = {"Outros": 100.0}
            
            result = {
                "originalReturn": original_return_val,
                "originalRisk": float(original_risk),
                "optimizedReturn": optimized_return,
                "optimizedRisk": optimized_risk,
                "improvement": optimized_return - original_return_val,
                "convergenceGeneration": len(history),
                "optimizedWeights": optimized_weights,
                "history": history_formatted,
                "job_id": job_id,
                "performanceSeries": performance_data,
                "originalPerformanceSeries": original_performance_data,
                "optimizedMetrics": optimized_metrics,
                "originalMetrics": original_metrics,
                "sectorAllocation": sector_allocation,
            }
            
            print(f"[OTIMIZAÇÃO] Resultado final: originalReturn={result['originalReturn']:.2f}%, optimizedReturn={result['optimizedReturn']:.2f}%, optimizedRisk={result['optimizedRisk']:.2f}%")
            print(f"[OTIMIZAÇÃO] Número de pesos otimizados: {len(optimized_weights)}")

            update_progress(100, "Otimização concluída com sucesso!", "completed")
            print(f"[OTIMIZAÇÃO] Progresso: 100% - Otimização concluída com sucesso!")
            time.sleep(0.5)  # Dar tempo para o frontend ler o progresso final
            
            # Limpar progresso após 1 minuto
            def cleanup():
                time.sleep(60)
                with progress_lock:
                    if job_id in optimization_progress:
                        del optimization_progress[job_id]
            threading.Thread(target=cleanup, daemon=True).start()

            return result
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        with progress_lock:
            optimization_progress[job_id] = {
                "status": "error",
                "progress": 0,
                "message": f"Erro: {str(e)}",
                "step": "error"
            }
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------
# DASHBOARD ENDPOINTS
# -------------------------

@app.get("/dashboard/comparison")
def get_dashboard_comparison():
    """
    Retorna dados de comparação entre todos os portfólios e Ibovespa para o Dashboard.
    Retorna série temporal agregada dos portfólios vs Ibovespa.
    """
    try:
        conn = get_db_conn()
        cur = conn.cursor(dictionary=True)
        
        # Buscar todos os portfólios com ativos
        cur.execute("SELECT id, titulo FROM portfolios ORDER BY data_criacao DESC")
        portfolios = cur.fetchall()
        
        if not portfolios:
            return {
                "dates": [],
                "portfolios": [],
                "ibovespa": []
            }
        
        # Buscar Ibovespa
        ibov_df = get_ibovespa_series('1y')
        
        # Agregar dados de todos os portfólios
        all_portfolio_series = []
        all_dates_set = set()
        
        for p in portfolios:
            portfolio_id = p["id"]
            cur.execute("""
                SELECT a.ticker, pa.peso
                FROM portfolio_ativos pa
                JOIN ativos a ON a.id = pa.ativo_id
                WHERE pa.portfolio_id=%s
            """, (portfolio_id,))
            assets = cur.fetchall()
            
            if len(assets) < 2:
                continue
            
            tickers = [normalize_ticker(a["ticker"]) for a in assets]
            weights = np.array([float(a["peso"] or 0) for a in assets])
            
            if weights.sum() <= 0:
                continue
            
            weights = weights / weights.sum()  # Normalizar
            
            try:
                portfolio_series = get_performance_series(tickers, weights, period="1y")
                
                if portfolio_series.empty:
                    continue
                
                # Normalizar para começar em 0 (primeiro valor = 0)
                if 'portfolio' in portfolio_series.columns:
                    first_value = portfolio_series['portfolio'].iloc[0] if len(portfolio_series) > 0 else 0
                    portfolio_series['portfolio_normalized'] = portfolio_series['portfolio'] - first_value
                elif 'cumulative_return' in portfolio_series.columns:
                    first_value = portfolio_series['cumulative_return'].iloc[0] if len(portfolio_series) > 0 else 0
                    portfolio_series['portfolio_normalized'] = portfolio_series['cumulative_return'] - first_value
                else:
                    continue
                
                # Converter para dicionário por data
                portfolio_dict = {}
                for _, row in portfolio_series.iterrows():
                    date = str(row.get('date', ''))
                    if date and date != 'nan':
                        portfolio_dict[date] = float(row.get('portfolio_normalized', 0))
                        all_dates_set.add(date)
                
                all_portfolio_series.append(portfolio_dict)
                
            except Exception as e:
                print(f"[AVISO] Erro ao calcular série do portfólio {portfolio_id}: {e}")
                import traceback
                traceback.print_exc()
                continue
        
        cur.close()
        conn.close()
        
        # Calcular média dos portfólios por data (apenas datas comuns a todos)
        dates = sorted(all_dates_set)
        portfolio_avg = []
        
        for date in dates:
            values = []
            for portfolio_dict in all_portfolio_series:
                if date in portfolio_dict:
                    values.append(portfolio_dict[date])
            
            if values:
                avg = sum(values) / len(values)
            else:
                avg = 0
            portfolio_avg.append(avg)
        
        # Alinhar Ibovespa com as datas (normalizar também)
        ibovespa_values = []
        if not ibov_df.empty and 'date' in ibov_df.columns and 'ibovespa' in ibov_df.columns:
            ibov_dict = dict(zip(ibov_df['date'], ibov_df['ibovespa']))
            # Normalizar Ibovespa para começar em 0
            first_ibov_date = min(ibov_dict.keys()) if ibov_dict else None
            first_ibov_value = ibov_dict.get(first_ibov_date, 0) if first_ibov_date else 0
            
            for date in dates:
                ibov_value = float(ibov_dict.get(date, first_ibov_value))
                ibov_normalized = ibov_value - first_ibov_value
                ibovespa_values.append(ibov_normalized)
        else:
            ibovespa_values = [0] * len(dates)
        
        return {
            "dates": dates,
            "portfolios": portfolio_avg,
            "ibovespa": ibovespa_values
        }
        
    except Exception as e:
        print(f"[ERRO] Falha ao calcular comparação do dashboard: {e}")
        import traceback
        traceback.print_exc()
        return {
            "dates": [],
            "portfolios": [],
            "ibovespa": []
        }

# -------------------------
# ANALYTICS ENDPOINTS
# -------------------------

@app.get("/portfolio/{portfolio_id}/analytics")
def get_portfolio_analytics(portfolio_id: str):
    """
    Retorna análise completa do portfólio:
    1. Evolução temporal (Portfolio, Base, Ibovespa)
    2. Alocação setorial
    3. Métricas quantitativas
    """
    try:
        conn = db.get_connection()
        cur = conn.cursor(dictionary=True)
        
        # Buscar portfólio
        cur.execute("SELECT * FROM portfolios WHERE id = %s", (portfolio_id,))
        portfolio = cur.fetchone()
        if not portfolio:
            raise HTTPException(status_code=404, detail="Portfólio não encontrado")
        
        # Buscar ativos do portfólio
        cur.execute("""
            SELECT a.id, a.ticker, pa.peso as weight
            FROM portfolio_ativos pa
            JOIN ativos a ON a.id = pa.ativo_id
            WHERE pa.portfolio_id = %s
        """, (portfolio_id,))
        assets = cur.fetchall()
        cur.close()
        
        if not assets:
            raise HTTPException(status_code=400, detail="Portfólio sem ativos")
        
        tickers = [normalize_ticker(a['ticker']) for a in assets]
        weights = np.array([float(a['weight'] or 0) for a in assets])
        if weights.sum() > 0:
            weights = weights / weights.sum()  # Normalizar
        
        # =====================
        # 1. EVOLUÇÃO TEMPORAL
        # =====================
        
        # Portfólio otimizado
        portfolio_evolution = get_performance_series(tickers, weights, '2y')
        
        # Portfólio base (pesos iguais)
        base_weights = np.ones(len(tickers)) / len(tickers)
        base_evolution = get_performance_series(tickers, base_weights, '2y')
        
        # Ibovespa
        ibov_df = get_ibovespa_series('2y')
        
        # Montar série temporal combinada
        temporal_data = []
        if not portfolio_evolution.empty:
            # Identificar colunas corretas
            portfolio_col = 'portfolio' if 'portfolio' in portfolio_evolution.columns else 'cumulative_return'
            base_col = 'portfolio' if 'portfolio' in base_evolution.columns else 'cumulative_return'
            
            # Normalizar para começar em 0 (primeiro valor = 0)
            first_portfolio_value = portfolio_evolution[portfolio_col].iloc[0] if len(portfolio_evolution) > 0 else 0
            first_base_value = base_evolution[base_col].iloc[0] if not base_evolution.empty and len(base_evolution) > 0 else 0
            first_ibov_value = ibov_df['ibovespa'].iloc[0] if not ibov_df.empty and 'ibovespa' in ibov_df.columns and len(ibov_df) > 0 else 0
            
            for idx, row in portfolio_evolution.iterrows():
                date = str(row.get('date', ''))
                if not date or date == 'nan':
                    continue
                
                # Normalizar valores para começar em 0
                portfolio_value = float(row.get(portfolio_col, 0)) - first_portfolio_value
                
                # Buscar valor base correspondente
                base_row = base_evolution[base_evolution['date'] == date]
                if not base_row.empty:
                    base_value = float(base_row[base_col].iloc[0]) - first_base_value
                else:
                    base_value = 0
                
                entry = {
                    'date': date,
                    'portfolio': portfolio_value,
                    'base': base_value,
                }
                
                # Adicionar Ibovespa (normalizado)
                if not ibov_df.empty and 'ibovespa' in ibov_df.columns:
                    ibov_row = ibov_df[ibov_df['date'] == date]
                    if not ibov_row.empty:
                        ibov_value = float(ibov_row['ibovespa'].iloc[0]) - first_ibov_value
                    else:
                        ibov_value = 0
                else:
                    ibov_value = 0
                entry['ibovespa'] = ibov_value
                
                # SELIC (normalizado - começa em 0)
                if len(temporal_data) == 0:
                    entry['selic'] = 0
                else:
                    # Calcular dias desde o início
                    first_date = pd.to_datetime(portfolio_evolution['date'].iloc[0])
                    current_date = pd.to_datetime(date)
                    days_passed = (current_date - first_date).days
                    selic_daily = 11.75 / 252 / 100  # taxa diária (11.75% ao ano)
                    entry['selic'] = ((1 + selic_daily) ** days_passed - 1) * 100
                
                temporal_data.append(entry)
        
        # =====================
        # 2. ALOCAÇÃO SETORIAL
        # =====================
        
        sectoral_allocation = {}
        for asset in assets:
            ticker = asset['ticker']
            weight = asset['weight']
            sector = get_sector_from_ticker(ticker)
            
            if sector not in sectoral_allocation:
                sectoral_allocation[sector] = {'weight': 0, 'tickers': []}
            
            sectoral_allocation[sector]['weight'] += weight
            sectoral_allocation[sector]['tickers'].append(ticker)
        
        sectoral_data = [
            {'sector': sector, 'weight': info['weight']}
            for sector, info in sectoral_allocation.items()
        ]
        
        # =====================
        # 3. MÉTRICAS QUANTITATIVAS
        # =====================
        
        try:
            # Retornar histórico para cálculo de métricas
            price_history = get_price_history(tickers, '2y')
            returns_matrix = get_returns_matrix(tickers, '2y')
            
            if returns_matrix.shape[0] > 1:
                # Portfólio otimizado
                portfolio_returns = returns_matrix @ weights
                portfolio_metrics = calculate_portfolio_metrics(portfolio_returns)
                
                # Portfólio base
                base_returns = returns_matrix @ base_weights
                base_metrics = calculate_portfolio_metrics(base_returns)
                
                # Ibovespa
                if not ibov_df.empty:
                    ibov_returns = ibov_df['ibovespa'].pct_change().dropna().values / 100
                    ibov_metrics = calculate_portfolio_metrics(ibov_returns)
                else:
                    ibov_metrics = {
                        'retorno_anual': 0,
                        'volatilidade': 0,
                        'cvar': 0,
                        'sharpe': 0,
                        'desvio_padrao': 0
                    }
                
                # SELIC (aproximado)
                selic_metrics = {
                    'retorno_anual': 0.032 * 252 * 100,  # ~8% a.a.
                    'volatilidade': 0.1,
                    'cvar': 0,
                    'sharpe': 0,
                    'desvio_padrao': 0.1
                }
            else:
                portfolio_metrics = base_metrics = ibov_metrics = selic_metrics = {
                    'retorno_anual': 0,
                    'volatilidade': 0,
                    'cvar': 0,
                    'sharpe': 0,
                    'desvio_padrao': 0
                }
        except Exception as e:
            print(f"Erro ao calcular métricas: {e}")
            portfolio_metrics = base_metrics = ibov_metrics = selic_metrics = {
                'retorno_anual': 0,
                'volatilidade': 0,
                'cvar': 0,
                'sharpe': 0,
                'desvio_padrao': 0
            }
        
        metrics_data = {
            'portfolio_otimizado': portfolio_metrics,
            'portfolio_base': base_metrics,
            'ibovespa': ibov_metrics,
            'selic': selic_metrics
        }
        
        conn.close()
        
        return {
            'temporal_evolution': temporal_data,
            'sectoral_allocation': sectoral_data,
            'metrics': metrics_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Erro em analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

