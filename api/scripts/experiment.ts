// Experimento do TCC: validação walk-forward fora da amostra.
// Para cada ano de teste, otimiza com os 4 anos anteriores, compra no último pregão do treino
// e mantém a carteira (Buy and Hold) até o fim do ano de teste.
// Cada janela é repetida com várias sementes para medir a estabilidade do AG.
//
// Uso: npx ts-node-dev --transpile-only scripts/experiment.ts [sementes]
import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { PortfolioService } from "../app/modules/portfolio/portfolio.service"
import { decode, DEFAULT_OPTIONS } from "../app/modules/portfolio/optimizer"
import { hypervolume2d } from "../app/modules/portfolio/nsga2"
import { createRng } from "../app/modules/portfolio/rng"
import { fetchPriceMatrix, snapshotMarketData } from "../app/modules/portfolio/market-data"
import { BUY_AND_HOLD_UNIVERSE } from "../app/modules/portfolio/universe"
import { BENCHMARK } from "../app/modules/portfolio/portfolio.service"
import { buyAndHoldCurve, cagr, cvar, dailyReturns } from "../app/modules/portfolio/metrics"

const SEEDS = Number(process.argv[2] ?? 30)
const OUT = join(__dirname, "..", "..", "results")
const SNAPSHOT = { start: "2016-12-01", end: "2026-10-16" }
process.env.MARKET_DATA_DIR = join(OUT, "data")

const WINDOWS = [2021, 2022, 2023, 2024, 2025, 2026].map((year) => ({
  label: year === 2026 ? "2026 (até out.)" : String(year),
  trainStart: `${year - 4}-01-01`,
  trainEnd: `${year - 1}-12-31`,
  testEnd: year === 2026 ? "2026-10-16" : `${year}-12-31`,
}))

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length
const sd = (x: number[]) => {
  const m = mean(x)
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, x.length - 1))
}
const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a)
  const inter = b.filter((x) => A.has(x)).length
  return inter / (A.size + b.length - inter)
}

// Linha de base de busca aleatória com o MESMO número de avaliações do NSGA-II:
// mostra se o AG realmente "aprende" ou se qualquer amostragem chegaria lá.
const randomSearchHv = (prices: number[][], evaluations: number, ref: [number, number], seed: number) => {
  const N = prices[0].length
  const rel = Array.from({ length: N }, (_, i) => Float64Array.from(prices.map((row) => row[i] / prices[0][i])))
  const rng = createRng(seed)
  const pts: number[][] = []
  for (let e = 0; e < evaluations; e++) {
    const { assets, weights } = decode(
      Array.from({ length: N }, () => rng()),
      DEFAULT_OPTIONS.cardinality,
      DEFAULT_OPTIONS.minWeight,
      DEFAULT_OPTIONS.maxWeight
    )
    const curve = buyAndHoldCurve(rel, assets, weights)
    pts.push([-cagr(curve), cvar(dailyReturns(curve))])
  }
  return hypervolume2d(pts, ref)
}

;(async () => {
  mkdirSync(OUT, { recursive: true })
  await snapshotMarketData([...BUY_AND_HOLD_UNIVERSE.map((a) => a.ticker), BENCHMARK], SNAPSHOT.start, SNAPSHOT.end)
  const service = new PortfolioService()
  const raw: any[] = []
  const summary: any[] = []

  for (const w of WINDOWS) {
    console.log(`\n=== Janela teste ${w.label} | treino ${w.trainStart} a ${w.trainEnd} ===`)
    const runs: any[] = []
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = await service.optimize({ ...w, options: { seed } })
      runs.push(r)
      process.stdout.write(`seed ${seed} `)
    }
    console.log()

    const first = runs[0]
    const names: string[] = first.test.series.map((s: any) => s.name)
    const metrics = Object.keys(first.test.series[0].report)

    const stats = names.map((name) => {
      const reports = runs.map((r) => r.test.series.find((s: any) => s.name === name).report)
      const out: any = { window: w.label, strategy: name }
      metrics.forEach((m) => {
        const values = reports.map((rep: any) => rep[m])
        out[m] = { mean: mean(values), sd: sd(values) }
      })
      return out
    })

    // Estabilidade: sobreposição média dos ativos escolhidos entre sementes
    const overlap = (pick: (r: any) => string[]) => {
      const sets = runs.map(pick)
      const pairs: number[] = []
      for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) pairs.push(jaccard(sets[i], sets[j]))
      return pairs.length ? mean(pairs) : 1
    }

    // Busca aleatória com mesmo orçamento (1 semente por janela basta como referência)
    const matrix = await fetchPriceMatrix(first.universe.map((u: any) => u.ticker), w.trainStart, w.trainEnd)
    const hvNsga = runs.map((r) => r.meanCvar.convergence.at(-1))

    const stability = {
      window: w.label,
      trainDays: first.train.days,
      testDays: first.test.days,
      cdiTrain: first.train.cdiAnnual,
      cdiTest: first.test.cdiAnnual,
      runtimeCvarMs: { mean: mean(runs.map((r) => r.meanCvar.runtimeMs)), sd: sd(runs.map((r) => r.meanCvar.runtimeMs)) },
      runtimeVarMs: { mean: mean(runs.map((r) => r.markowitz.runtimeMs)), sd: sd(runs.map((r) => r.markowitz.runtimeMs)) },
      evaluations: first.meanCvar.evaluations,
      frontSize: mean(runs.map((r) => r.meanCvar.front.length)),
      hvFinal: { mean: mean(hvNsga), sd: sd(hvNsga) },
      jaccardCvarStarr: overlap((r) => r.meanCvar.recommended.tickers),
      jaccardCvarMin: overlap((r) => r.meanCvar.conservative.tickers),
      jaccardVarSharpe: overlap((r) => r.markowitz.recommended.tickers),
      jaccardVarMin: overlap((r) => r.markowitz.conservative.tickers),
      trainScoreStarr: { mean: mean(runs.map((r) => r.meanCvar.recommended.score)), sd: sd(runs.map((r) => r.meanCvar.recommended.score)) },
      excluded: first.excluded,
    }

    summary.push({ stability, stats })
    raw.push({
      window: w,
      universe: first.universe,
      convergenceSeed1: { cvar: first.meanCvar.convergence, variance: first.markowitz.convergence },
      frontSeed1: { cvar: first.meanCvar.front, variance: first.markowitz.front },
      testDates: first.test.dates,
      curvesSeed1: first.test.series.map((s: any) => ({ name: s.name, curve: s.curve, weights: s.weights })),
      picks: runs.map((r) => ({
        starr: r.meanCvar.recommended,
        minCvar: r.meanCvar.conservative,
        sharpe: r.markowitz.recommended,
        minVar: r.markowitz.conservative,
      })),
      randomSearchVsNsga: (() => {
        // Ponto de referência comum: pior retorno e pior CVaR entre ativos individuais (+10%)
        const N = matrix.tickers.length
        const single = Array.from({ length: N }, (_, i) => {
          const curve = matrix.prices.map((row) => row[i] / matrix.prices[0][i])
          return [-cagr(curve), cvar(dailyReturns(curve))]
        })
        const ref: [number, number] = [
          Math.max(...single.map((s) => s[0])) + 0.05,
          Math.max(...single.map((s) => s[1])) * 1.1,
        ]
        const nsga = runs.map((r) => hypervolume2d(r.meanCvar.front.map((p: any) => [-p.expectedReturn, p.risk]), ref))
        const rand = [1, 2, 3, 4, 5].map((s) => randomSearchHv(matrix.prices, first.meanCvar.evaluations, ref, 1000 + s))
        return { ref, nsga: { mean: mean(nsga), sd: sd(nsga) }, random: { mean: mean(rand), sd: sd(rand) } }
      })(),
    })

    stats.forEach((s) =>
      console.log(
        s.strategy.padEnd(30),
        `ret ${(s.annualReturn.mean * 100).toFixed(1)}±${(s.annualReturn.sd * 100).toFixed(1)}%`,
        `sharpe ${s.sharpe.mean.toFixed(2)}`,
        `cvar ${(s.cvar95.mean * 100).toFixed(2)}%`,
        `mdd ${(s.maxDrawdown.mean * 100).toFixed(1)}%`
      )
    )
    console.log("estabilidade", JSON.stringify(stability))
    writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2))
    writeFileSync(join(OUT, "raw.json"), JSON.stringify(raw))
    console.log("hv random vs nsga", JSON.stringify(raw.at(-1).randomSearchVsNsga))
  }

  writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2))
  writeFileSync(join(OUT, "raw.json"), JSON.stringify(raw))
  console.log(`\nResultados salvos em ${OUT}`)
})()
