export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export interface Asset {
  ticker: string
  sector: string
}

export interface Portfolio {
  tickers: string[]
  weights: number[]
  expectedReturn: number
  risk: number
  score: number
}

export interface OptimizationResult {
  riskModel: 'cvar' | 'variance'
  front: Portfolio[]
  recommended: Portfolio
  conservative: Portfolio
  aggressive: Portfolio
  convergence: number[]
  evaluations: number
  runtimeMs: number
}

export interface PerformanceReport {
  totalReturn: number
  annualReturn: number
  annualVolatility: number
  sharpe: number
  sortino: number
  cvar95: number
  var95: number
  maxDrawdown: number
}

export interface BacktestSeries {
  name: string
  weights?: { ticker: string; weight: number }[]
  curve: number[]
  report: PerformanceReport
}

export interface OptimizeResponse {
  universe: Asset[]
  excluded: string[]
  train: { start: string; end: string; days: number; cdiAnnual: number }
  meanCvar: OptimizationResult
  markowitz: OptimizationResult
  test?: {
    start: string
    end: string
    days: number
    cdiAnnual: number
    dates: string[]
    series: BacktestSeries[]
  }
}

export interface OptimizeRequest {
  tickers: string[]
  trainStart: string
  trainEnd: string
  testEnd?: string
  options: {
    cardinality: number
    minWeight: number
    maxWeight: number
    maxSectorWeight: number
    populationSize: number
    generations: number
    seed: number
  }
}

export const fetchUniverse = async (): Promise<Asset[]> => {
  const response = await fetch(`${API_URL}/portfolio/universe`)
  if (!response.ok) throw new Error('Falha ao carregar universo de ativos')
  return response.json()
}

export const optimizePortfolio = async (body: OptimizeRequest): Promise<OptimizeResponse> => {
  const response = await fetch(`${API_URL}/portfolio/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'Falha na otimização')
  return data
}

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace('.', ',')}%`
export const num = (x: number, digits = 2) => x.toFixed(digits).replace('.', ',')
