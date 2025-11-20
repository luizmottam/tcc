from typing import List, Dict
import numpy as np

def pareto_front(solutions: List[Dict]):
    """Retorna lista de não dominados (simples). Cada solution tem 'objectives' = [o1,o2,o3]."""
    objs = np.array([s['objectives'] for s in solutions])
    dominated = set()
    n = objs.shape[0]
    for i in range(n):
        for j in range(n):
            if i == j: continue
            if all(objs[j] <= objs[i]) and any(objs[j] < objs[i]):
                dominated.add(i)
                break
    nondominated = [solutions[i] for i in range(n) if i not in dominated]
    return nondominated
