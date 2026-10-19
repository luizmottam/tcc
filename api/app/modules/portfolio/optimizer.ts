// Otimizador de carteiras Buy and Hold.
// Modelo principal: Média-CVaR multiobjetivo via NSGA-II, com restrição de cardinalidade,
// limites de peso por ativo e limite de concentração setorial.
// Modelo de comparação: Média-Variância (Markowitz) resolvido pelo MESMO AG e MESMAS restrições,
// de modo que a única diferença entre os dois seja a medida de risco.
import { createRng } from "./rng"
import { runNsga2, hypervolume2d, Individual } from "./nsga2"
import { buyAndHoldCurve, cagr, cvar, dailyReturns, TRADING_DAYS } from "./metrics"

export type RiskModel = "cvar" | "variance"

export interface OptimizerOptions {
  riskModel: RiskModel
  cardinality: number // K: número exato de ativos na carteira
  minWeight: number // peso mínimo de cada ativo escolhido
  maxWeight: number // peso máximo de cada ativo
  maxSectorWeight: number // peso máximo por setor
  alpha: number // nível de confiança do CVaR
  populationSize: number
  generations: number
  seed: number
  riskFreeAnnual: number // CDI anualizado do período de treino
}

export const DEFAULT_OPTIONS: Omit<OptimizerOptions, "riskFreeAnnual"> = {
  riskModel: "cvar",
  cardinality: 8,
  minWeight: 0.05,
  maxWeight: 0.25,
  maxSectorWeight: 0.4,
  alpha: 0.95,
  populationSize: 120,
  generations: 250,
  seed: 42,
}

export interface Portfolio {
  tickers: string[]
  weights: number[]
  expectedReturn: number // anualizado no treino
  risk: number // CVaR diário (cvar) ou volatilidade anual (variance)
  score: number // STARR (cvar) ou Sharpe (variance)
}

export interface OptimizationResult {
  riskModel: RiskModel
  front: Portfolio[]
  recommended: Portfolio // maior razão retorno-excedente / risco
  conservative: Portfolio // menor risco
  aggressive: Portfolio // maior retorno
  convergence: number[] // hipervolume por geração
  evaluations: number
  runtimeMs: number
}

// Ajusta pesos para somarem 1 respeitando [lo, hi], distribuindo o excesso/falta
// proporcionalmente à folga de cada ativo (uma passada basta, sem ultrapassar limites).
export const boundWeights = (raw: number[], lo: number, hi: number): number[] => {
  const total = raw.reduce((s, x) => s + x, 0)
  let w = raw.map((x) => Math.min(hi, Math.max(lo, x / total)))
  const sum = w.reduce((s, x) => s + x, 0)
  if (sum < 1) {
    const room = w.reduce((s, x) => s + (hi - x), 0)
    w = w.map((x) => x + ((1 - sum) * (hi - x)) / room)
  } else if (sum > 1) {
    const room = w.reduce((s, x) => s + (x - lo), 0)
    w = w.map((x) => x - ((sum - 1) * (x - lo)) / room)
  }
  return w
}

// Decodificação do cromossomo: genoma g em [0,1]^N.
// Os K genes de maior valor definem os ativos escolhidos; seus valores definem os pesos.
export const decode = (genome: number[], K: number, lo: number, hi: number) => {
  const assets = genome
    .map((g, i) => [g, i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, K)
    .map(([, i]) => i)
    .sort((a, b) => a - b)
  const weights = boundWeights(assets.map((i) => genome[i] + 1e-9), lo, hi)
  return { assets, weights }
}

export const optimize = (
  tickers: string[],
  sectors: string[],
  prices: number[][], // prices[t][i] do período de treino
  options: OptimizerOptions
): OptimizationResult => {
  const started = Date.now()
  const N = tickers.length
  const T = prices.length
  const K = Math.min(options.cardinality, N)

  if (K * options.minWeight > 1 || K * options.maxWeight < 1) {
    throw new Error("Restrições inviáveis: K * pesoMínimo deve ser <= 1 <= K * pesoMáximo")
  }

  // Pré-cálculo (feito uma única vez): preços relativos e estatísticas de Markowitz
  const relPrices = Array.from({ length: N }, (_, i) => {
    const s = new Float64Array(T)
    for (let t = 0; t < T; t++) s[t] = prices[t][i] / prices[0][i]
    return s
  })
  const assetReturns = relPrices.map((s) => dailyReturns(s))
  const mu = assetReturns.map((r) => r.reduce((a, b) => a + b, 0) / r.length)
  const cov = mu.map((mi, i) =>
    mu.map((mj, j) => {
      let s = 0
      for (let t = 0; t < T - 1; t++) s += (assetReturns[i][t] - mi) * (assetReturns[j][t] - mj)
      return s / (T - 2)
    })
  )

  const sectorViolation = (assets: number[], weights: number[]): number => {
    const bySector = new Map<string, number>()
    assets.forEach((a, k) => bySector.set(sectors[a], (bySector.get(sectors[a]) ?? 0) + weights[k]))
    let v = 0
    bySector.forEach((w) => (v += Math.max(0, w - options.maxSectorWeight)))
    return v
  }

  // Objetivos (minimização): [-retorno, risco]
  const objectivesOf = (assets: number[], weights: number[]): [number, number] => {
    if (options.riskModel === "cvar") {
      const curve = buyAndHoldCurve(relPrices, assets, weights)
      return [-cagr(curve), cvar(dailyReturns(curve), options.alpha)]
    }
    let ret = 0
    let variance = 0
    assets.forEach((i, a) => {
      ret += weights[a] * mu[i]
      assets.forEach((j, b) => (variance += weights[a] * weights[b] * cov[i][j]))
    })
    return [-ret * TRADING_DAYS, Math.sqrt(variance * TRADING_DAYS)]
  }

  let evaluations = 0
  const evaluate = (genome: number[]) => {
    evaluations++
    const { assets, weights } = decode(genome, K, options.minWeight, options.maxWeight)
    return { objectives: objectivesOf(assets, weights), violation: sectorViolation(assets, weights) }
  }

  const convergence: number[] = []
  let ref: [number, number] | null = null

  const population = runNsga2({
    populationSize: options.populationSize,
    generations: options.generations,
    genomeLength: N,
    crossoverRate: 0.9,
    crossoverEta: 15,
    mutationEta: 20,
    rng: createRng(options.seed),
    evaluate,
    onGeneration: (_, pop) => {
      const feasible = pop.filter((p) => p.violation === 0).map((p) => p.objectives)
      if (!ref && feasible.length > 0) {
        // Ponto de referência: pior valor da população inicial + 10% de margem
        const worst0 = Math.max(...feasible.map((o) => o[0]))
        const worst1 = Math.max(...feasible.map((o) => o[1]))
        ref = [worst0 + Math.abs(worst0) * 0.1, worst1 * 1.1]
      }
      convergence.push(ref ? hypervolume2d(feasible, ref) : 0)
    },
  })

  const toPortfolio = (ind: Individual): Portfolio => {
    const { assets, weights } = decode(ind.genome, K, options.minWeight, options.maxWeight)
    const expectedReturn = -ind.objectives[0]
    const risk = ind.objectives[1]
    return {
      tickers: assets.map((i) => tickers[i]),
      weights,
      expectedReturn,
      risk,
      score: (expectedReturn - options.riskFreeAnnual) / risk,
    }
  }

  // Fronteira de Pareto final: rank 0 e factível, sem duplicatas
  const seen = new Set<string>()
  const front = population
    .filter((p) => p.rank === 0 && p.violation === 0)
    .map(toPortfolio)
    .filter((p) => {
      const key = `${p.expectedReturn.toFixed(8)}:${p.risk.toFixed(8)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.risk - b.risk)

  if (front.length === 0) throw new Error("Nenhuma carteira factível encontrada")

  return {
    riskModel: options.riskModel,
    front,
    recommended: front.reduce((best, p) => (p.score > best.score ? p : best)),
    conservative: front[0],
    aggressive: front.reduce((best, p) => (p.expectedReturn > best.expectedReturn ? p : best)),
    convergence,
    evaluations,
    runtimeMs: Date.now() - started,
  }
}
