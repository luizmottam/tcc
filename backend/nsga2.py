"""
Implementação do NSGA-II (Non-dominated Sorting Genetic Algorithm II)
para otimização multi-objetivo de portfólios.
Objetivos: Maximizar retorno e Minimizar risco (CVaR)
"""

import numpy as np
from typing import List, Tuple, Dict, Optional
from ga import (
    compute_annual_return_geo,
    compute_portfolio_variance,
    compute_annual_cvar_bootstrap,
    compute_cvar_daily,
)


def dominates(ind1: Tuple[float, float], ind2: Tuple[float, float]) -> bool:
    """
    Verifica se ind1 domina ind2.
    ind1 domina ind2 se:
    - ind1 é melhor ou igual em todos os objetivos E
    - ind1 é estritamente melhor em pelo menos um objetivo
    
    Para portfólio: (retorno, -risco) - queremos maximizar retorno e minimizar risco
    """
    ret1, risk1 = ind1
    ret2, risk2 = ind2
    
    # ind1 domina se: ret1 >= ret2 AND risk1 <= risk2 AND (ret1 > ret2 OR risk1 < risk2)
    return (ret1 >= ret2 and risk1 <= risk2) and (ret1 > ret2 or risk1 < risk2)


def fast_non_dominated_sort(population: List[Tuple[float, float]]) -> List[List[int]]:
    """
    Classifica a população em fronteiras de não-dominância.
    Retorna lista de fronteiras, onde cada fronteira é uma lista de índices.
    """
    n = len(population)
    S = [[] for _ in range(n)]  # conjunto de soluções dominadas por i
    n_p = [0] * n  # contador de quantas soluções dominam i
    rank = [0] * n
    front = [[]]
    
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            if dominates(population[i], population[j]):
                S[i].append(j)
            elif dominates(population[j], population[i]):
                n_p[i] += 1
        
        if n_p[i] == 0:
            rank[i] = 0
            front[0].append(i)
    
    i = 0
    while front[i]:
        Q = []
        for p in front[i]:
            for q in S[p]:
                n_p[q] -= 1
                if n_p[q] == 0:
                    rank[q] = i + 1
                    Q.append(q)
        i += 1
        if Q:
            front.append(Q)
        else:
            break
    
    return front


def crowding_distance(front: List[int], population: List[Tuple[float, float]]) -> List[float]:
    """
    Calcula a distância de crowding para cada indivíduo na fronteira.
    """
    n = len(front)
    if n == 0:
        return []
    
    distances = [0.0] * n
    
    # Para cada objetivo
    for obj_idx in range(2):  # retorno e risco
        # Ordenar fronteira por este objetivo
        sorted_front = sorted(front, key=lambda i: population[i][obj_idx])
        
        # Valores extremos recebem distância infinita
        distances[0] = float('inf')
        distances[-1] = float('inf')
        
        if len(sorted_front) > 2:
            obj_min = population[sorted_front[0]][obj_idx]
            obj_max = population[sorted_front[-1]][obj_idx]
            obj_range = obj_max - obj_min
            
            if obj_range > 0:
                for j in range(1, len(sorted_front) - 1):
                    idx = sorted_front[j]
                    prev_idx = sorted_front[j - 1]
                    next_idx = sorted_front[j + 1]
                    
                    distances[j] += (
                        (population[next_idx][obj_idx] - population[prev_idx][obj_idx]) / obj_range
                    )
    
    return distances


def run_nsga2(
    return_matrix: np.ndarray,
    tickers: List[str],
    populacao: int = 100,
    geracoes: int = 50,
    cvar_alpha: float = 0.95,
    use_annual_cvar_bootstrap: bool = True,
    bootstrap_sims: int = 2000,
    seed: Optional[int] = None,
) -> Dict:
    """
    Executa NSGA-II para otimização multi-objetivo.
    Objetivos: Maximizar retorno anual, Minimizar CVaR anual
    
    Retorna:
    - results: lista de soluções não-dominadas (fronteira de Pareto)
    - history: histórico de evolução
    """
    rng = np.random.default_rng(seed)
    
    n_days, n_assets = return_matrix.shape
    if n_assets != len(tickers):
        raise ValueError("Número de tickers deve igualar número de colunas em return_matrix.")
    
    # Precompute cov matrix
    cov_daily = np.cov(return_matrix, rowvar=False)
    if np.isnan(cov_daily).any():
        raise ValueError("Covariância contém NaNs")
    
    def random_weights() -> np.ndarray:
        w = rng.random(n_assets)
        w = np.clip(w, 0, None)
        s = w.sum()
        return (w / s) if s > 0 else np.ones(n_assets) / n_assets
    
    def evaluate(weights: np.ndarray) -> Tuple[float, float]:
        """
        Retorna (retorno_anual, risco_cvar_anual)
        Para NSGA-II: queremos maximizar retorno e minimizar risco
        """
        port_daily = (return_matrix * weights).sum(axis=1)
        annual_ret = compute_annual_return_geo(port_daily)
        
        if use_annual_cvar_bootstrap:
            annual_cvar = compute_annual_cvar_bootstrap(
                port_daily, alpha=cvar_alpha, n_sim=bootstrap_sims, block=252, seed=seed
            )
        else:
            daily_cvar = compute_cvar_daily(port_daily, alpha=cvar_alpha)
            annual_cvar = daily_cvar * np.sqrt(252)
        
        return float(annual_ret), float(annual_cvar)
    
    # Inicializar população
    population_weights = [random_weights() for _ in range(populacao)]
    population_objectives = [evaluate(w) for w in population_weights]
    
    history = []
    
    # NSGA-II loop
    for gen in range(geracoes):
        # Classificar em fronteiras
        fronts = fast_non_dominated_sort(population_objectives)
        
        # Histórico: melhor solução (primeira da primeira fronteira)
        if fronts and len(fronts[0]) > 0:
            best_idx = fronts[0][0]
            best_ret, best_risk = population_objectives[best_idx]
            history.append({
                "generation": int(gen),
                "annual_return": float(best_ret),
                "annual_cvar": float(best_risk),
                "fitness": float(best_ret - best_risk),  # para compatibilidade
                "front_size": len(fronts[0]) if fronts else 0,
            })
        
        # Seleção para próxima geração
        new_pop_weights = []
        new_pop_objectives = []
        
        # Preencher com soluções das fronteiras até atingir tamanho da população
        front_idx = 0
        while len(new_pop_weights) < populacao and front_idx < len(fronts):
            current_front = fronts[front_idx]
            
            if len(new_pop_weights) + len(current_front) <= populacao:
                # Adicionar toda a fronteira
                for idx in current_front:
                    new_pop_weights.append(population_weights[idx].copy())
                    new_pop_objectives.append(population_objectives[idx])
            else:
                # Preencher espaço restante usando crowding distance
                remaining = populacao - len(new_pop_weights)
                distances = crowding_distance(current_front, population_objectives)
                sorted_indices = sorted(
                    range(len(current_front)),
                    key=lambda i: distances[i],
                    reverse=True
                )
                for i in sorted_indices[:remaining]:
                    idx = current_front[i]
                    new_pop_weights.append(population_weights[idx].copy())
                    new_pop_objectives.append(population_objectives[idx])
                break
            
            front_idx += 1
        
        # Reprodução para completar população
        while len(new_pop_weights) < populacao:
            # Seleção por torneio binário
            idx1 = rng.integers(0, len(new_pop_weights))
            idx2 = rng.integers(0, len(new_pop_weights))
            
            # Escolher melhor (menor rank ou maior crowding distance)
            if idx1 < idx2:
                parent1 = new_pop_weights[idx1]
            else:
                parent1 = new_pop_weights[idx2]
            
            idx3 = rng.integers(0, len(new_pop_weights))
            idx4 = rng.integers(0, len(new_pop_weights))
            if idx3 < idx4:
                parent2 = new_pop_weights[idx3]
            else:
                parent2 = new_pop_weights[idx4]
            
            # Crossover aritmético
            alpha = rng.random()
            child = alpha * parent1 + (1 - alpha) * parent2
            
            # Mutação
            if rng.random() < 0.2:
                child += rng.normal(0, 0.05, size=n_assets)
            
            child = np.clip(child, 0, None)
            s = child.sum()
            child = (np.ones(n_assets) / n_assets) if s == 0 else child / s
            
            new_pop_weights.append(child)
            new_pop_objectives.append(evaluate(child))
        
        population_weights = new_pop_weights
        population_objectives = new_pop_objectives
    
    # Fronteira final de Pareto
    final_fronts = fast_non_dominated_sort(population_objectives)
    pareto_front = final_fronts[0] if final_fronts else []
    
    # Preparar resultados
    results = []
    for idx in pareto_front[:20]:  # Top 20 da fronteira de Pareto
        w = population_weights[idx]
        ret, risk = population_objectives[idx]
        
        results.append({
            "retorno_esperado_pct": float(ret * 100),
            "risco_cvar_pct": float(risk * 100),
            "variancia_anual": float(compute_portfolio_variance(w, cov_daily)),
            "pesos_pct": [float(x * 100) for x in w],
            "tickers": tickers,
        })
    
    # Ordenar por retorno (para compatibilidade)
    results.sort(key=lambda x: x["retorno_esperado_pct"], reverse=True)
    
    return {"results": results, "history": history}

