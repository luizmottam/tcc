import {
  cdiAnnualRate,
  cdiCurve,
  fetchCdi,
  fetchPriceMatrix,
  fetchPriceSeries,
} from "./market-data"
import { buyAndHoldCurve, performance, PerformanceReport } from "./metrics"
import { DEFAULT_OPTIONS, optimize, OptimizationResult, OptimizerOptions, Portfolio } from "./optimizer"
import { BUY_AND_HOLD_UNIVERSE, sectorOf } from "./universe"

export const BENCHMARK = "^BVSP"

export interface OptimizeRequest {
  tickers?: string[]
  trainStart: string
  trainEnd: string
  testEnd?: string // se informado, roda backtest fora da amostra (trainEnd, testEnd]
  options?: Partial<Omit<OptimizerOptions, "riskFreeAnnual">>
}

export interface BacktestSeries {
  name: string
  weights?: { ticker: string; weight: number }[]
  curve: number[]
  report: PerformanceReport
}

export interface OptimizeResponse {
  universe: { ticker: string; sector: string }[]
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

// Mantém só ativos com histórico cobrindo todo o período (evita "encurtar" a janela)
const filterAvailable = async (tickers: string[], start: string, end: string) => {
  const kept: string[] = []
  const excluded: string[] = []
  const limit = new Date(new Date(`${start}T00:00:00Z`).getTime() + 10 * 86400000).toISOString().slice(0, 10)
  await Promise.all(
    tickers.map(async (t) => {
      try {
        const s = await fetchPriceSeries(t, start, end)
        if (s.dates.length > 0 && s.dates[0] <= limit) kept.push(t)
        else excluded.push(t)
      } catch {
        excluded.push(t)
      }
    })
  )
  return { kept: tickers.filter((t) => kept.includes(t)), excluded }
}

export class PortfolioService {
  async optimize(req: OptimizeRequest): Promise<OptimizeResponse> {
    const requested = (req.tickers?.length ? req.tickers : BUY_AND_HOLD_UNIVERSE.map((a) => a.ticker)).map(
      (t) => t.toUpperCase()
    )
    const end = req.testEnd ?? req.trainEnd
    const { kept, excluded } = await filterAvailable(requested, req.trainStart, end)
    if (kept.length < 2) throw new Error("Ativos insuficientes com histórico no período")

    const matrix = await fetchPriceMatrix([...kept, BENCHMARK], req.trainStart, end)
    const cdi = await fetchCdi(req.trainStart, end)

    const trainIdx = matrix.dates.filter((d) => d <= req.trainEnd).length
    const trainPrices = matrix.prices.slice(0, trainIdx).map((row) => row.slice(0, kept.length))
    const trainDates = matrix.dates.slice(0, trainIdx)
    const trainCdi = cdiAnnualRate(cdi, trainDates[0], trainDates[trainDates.length - 1])

    const base = { ...DEFAULT_OPTIONS, ...req.options, riskFreeAnnual: trainCdi }
    const sectors = kept.map(sectorOf)
    const meanCvar = optimize(kept, sectors, trainPrices, { ...base, riskModel: "cvar" })
    const markowitz = optimize(kept, sectors, trainPrices, { ...base, riskModel: "variance" })

    const response: OptimizeResponse = {
      universe: kept.map((ticker) => ({ ticker, sector: sectorOf(ticker) })),
      excluded,
      train: { start: trainDates[0], end: trainDates[trainDates.length - 1], days: trainIdx, cdiAnnual: trainCdi },
      meanCvar,
      markowitz,
    }

    if (req.testEnd) {
      // Fora da amostra: a carteira é comprada no último pregão do treino e mantida (Buy and Hold)
      const testRows = matrix.prices.slice(trainIdx - 1)
      const testDates = matrix.dates.slice(trainIdx - 1)
      response.test = {
        start: testDates[0],
        end: testDates[testDates.length - 1],
        days: testDates.length - 1,
        cdiAnnual: cdiAnnualRate(cdi, testDates[1], testDates[testDates.length - 1]),
        dates: testDates,
        series: this.backtest(kept, testRows, testDates, cdi, [
          { name: "Média-CVaR · máx. STARR", portfolio: meanCvar.recommended },
          { name: "Média-CVaR · mín. CVaR", portfolio: meanCvar.conservative },
          { name: "Markowitz · máx. Sharpe", portfolio: markowitz.recommended },
          { name: "Markowitz · mín. variância", portfolio: markowitz.conservative },
        ]),
      }
    }

    return response
  }

  private backtest(
    tickers: string[],
    rows: number[][],
    dates: string[],
    cdi: Map<string, number>,
    portfolios: { name: string; portfolio: Portfolio }[]
  ): BacktestSeries[] {
    const N = tickers.length
    const T = rows.length
    const rf = cdiAnnualRate(cdi, dates[1], dates[T - 1])
    const rel = Array.from({ length: N + 1 }, (_, i) => {
      const s = new Float64Array(T)
      for (let t = 0; t < T; t++) s[t] = rows[t][i] / rows[0][i]
      return s
    })

    const make = (name: string, assets: number[], weights: number[]): BacktestSeries => {
      const curve = Array.from(buyAndHoldCurve(rel, assets, weights))
      return {
        name,
        weights: assets.map((a, k) => ({ ticker: tickers[a] ?? BENCHMARK, weight: weights[k] })),
        curve,
        report: performance(curve, rf),
      }
    }

    const series = portfolios.map(({ name, portfolio }) =>
      make(
        name,
        portfolio.tickers.map((t) => tickers.indexOf(t)),
        portfolio.weights
      )
    )
    const all = tickers.map((_, i) => i)
    series.push(make("Carteira igualitária 1/N", all, all.map(() => 1 / N)))
    series.push(make("Ibovespa", [N], [1]))

    const cdiSeries = cdiCurve(cdi, dates)
    series.push({ name: "CDI", curve: cdiSeries, report: performance(cdiSeries, rf) })
    return series
  }
}
