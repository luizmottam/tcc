import numpy as np
import random
from typing import List, Tuple
from app.ga.evaluate import evaluate_candidate
from app.ga.fronteira import pareto_front

# Parâmetros mínimos (não expostos no MVP)
POP_SIZE = 100
NGEN = 100
CXPB = 0.8
MUTPB = 0.15

random.seed(42)
np.random.seed(42)


def random_population(n_assets: int, pop_size: int = POP_SIZE):
    pop = []
    for _ in range(pop_size):
        v = np.random.rand(n_assets)
        v = v / v.sum()
        pop.append(v)
    return pop


def tournament_selection(pop, scores, k=2):
    i1, i2 = random.sample(range(len(pop)), 2)
    # lower rank (better) wins; here scores are tuples of objectives
    s1 = scores[i1]
    s2 = scores[i2]
    # simple dominance check
    if dominates(s1, s2):
        return pop[i1]
    elif dominates(s2, s1):
        return pop[i2]
    else:
        return pop[random.choice([i1,i2])]


def dominates(a, b):
    # a and b are tuples (o1,o2,o3) where lower is better for all
    return all(x <= y for x, y in zip(a, b)) and any(x < y for x, y in zip(a, b))


def sbx_crossover(p1, p2):
    # Simples: aritmético
    beta = np.random.rand()
    c1 = beta * p1 + (1 - beta) * p2
    c2 = beta * p2 + (1 - beta) * p1
    # normalizar
    c1 = np.maximum(c1, 0);
    c2 = np.maximum(c2, 0);
    c1 = c1 / c1.sum()
    c2 = c2 / c2.sum()
    return c1, c2


def mutate(ind, mu=0.1):
    noise = np.random.normal(0, mu, size=ind.shape)
    ind = ind + noise
    ind = np.clip(ind, 0, None)
    if ind.sum() == 0:
        ind = np.ones_like(ind) / len(ind)
    else:
        ind = ind / ind.sum()
    return ind


def run_ga(price_df, pop_size=POP_SIZE, ngen=NGEN):
    n_assets = price_df.shape[1]
    pop = random_population(n_assets, pop_size)
    archive = []
    for gen in range(ngen):
        # avaliar
        scores = [evaluate_candidate(ind, price_df) for ind in pop]
        # registrar no archive
        for ind, sc in zip(pop, scores):
            archive.append({'weights': ind.copy(), 'objectives': sc})
        # seleção para a próxima geração
        new_pop = []
        while len(new_pop) < pop_size:
            p1 = tournament_selection(pop, scores)
            p2 = tournament_selection(pop, scores)
            if np.random.rand() < 0.8:
                c1, c2 = sbx_crossover(p1, p2)
            else:
                c1, c2 = p1.copy(), p2.copy()
            if np.random.rand() < 0.15:
                c1 = mutate(c1)
            if np.random.rand() < 0.15:
                c2 = mutate(c2)
            new_pop.extend([c1, c2])
        pop = new_pop[:pop_size]
    # consolidar archive e extrair fronteira
    nondom = pareto_front(archive)
    # escolher solução ótima: heurística simples -> mínima soma normalizada dos objetivos
    objs = np.array([s['objectives'] for s in nondom])
    # normalizar por coluna
    minv = objs.min(axis=0)
    maxv = objs.max(axis=0)
    denom = (maxv - minv)
    denom[denom==0]=1
    norm = (objs - minv) / denom
    scores_sum = norm.sum(axis=1)
    best_idx = int(np.argmin(scores_sum))
    best = nondom[best_idx]
    return {
        'fronteira': nondom,
        'best': best
    }