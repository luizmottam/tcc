// Coleta de dados de mercado: preços ajustados (Yahoo Finance) e CDI (Banco Central - SGS série 12).
// Preço ajustado incorpora dividendos e desdobramentos, o que é obrigatório numa análise Buy and Hold.
//
// Reprodutibilidade: o Yahoo devolve o preço ajustado com pequeno ruído numérico a cada requisição
// (~1e-6), o que basta para o AG seguir outro caminho. Com MARKET_DATA_DIR definido, os dados são
// lidos de um snapshot em disco (ver snapshotMarketData) e o mesmo experimento dá sempre o mesmo resultado.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

const YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart"
const BCB_CDI_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados"
const DAY = 24 * 60 * 60 * 1000

export interface PriceSeries {
  dates: string[] // YYYY-MM-DD
  prices: number[]
}

export interface PriceMatrix {
  tickers: string[]
  dates: string[]
  prices: number[][] // prices[t][i]
}

const cache = new Map<string, unknown>()

// Repete a requisição em falhas de rede ou HTTP 429/5xx, com espera crescente
const fetchWithRetry = async (url: string, init?: RequestInit, attempts = 4): Promise<Response> => {
  for (let i = 1; ; i++) {
    try {
      const response = await fetch(url, init)
      if (response.ok || i >= attempts || (response.status < 500 && response.status !== 429)) return response
    } catch (error) {
      if (i >= attempts) throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (i - 1)))
  }
}

const toIsoDate = (unixSeconds: number): string =>
  // Pregão da B3 fecha em horário de Brasília (UTC-3)
  new Date(unixSeconds * 1000 - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

const yahooSymbol = (ticker: string): string =>
  ticker.startsWith("^") ? ticker : `${ticker.toUpperCase()}.SA`

const snapshotFile = (name: string) =>
  process.env.MARKET_DATA_DIR ? join(process.env.MARKET_DATA_DIR, `${name.replace(/[^A-Za-z0-9]/g, "_")}.json`) : null

const readSnapshot = <T>(name: string): T | null => {
  const file = snapshotFile(name)
  return file && existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null
}

export const fetchPriceSeries = async (ticker: string, start: string, end: string): Promise<PriceSeries> => {
  const snap = readSnapshot<PriceSeries & { start: string; end: string }>(`px_${ticker}`)
  if (snap && snap.start <= start && snap.end >= end) {
    const series: PriceSeries = { dates: [], prices: [] }
    snap.dates.forEach((d, i) => {
      if (d >= start && d <= end) {
        series.dates.push(d)
        series.prices.push(snap.prices[i])
      }
    })
    return series
  }
  return downloadPriceSeries(ticker, start, end)
}

const downloadPriceSeries = async (
  ticker: string,
  start: string,
  end: string
): Promise<PriceSeries> => {
  const key = `px:${ticker}:${start}:${end}`
  if (cache.has(key)) return cache.get(key) as PriceSeries

  const period1 = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000)
  const period2 = Math.floor((new Date(`${end}T00:00:00Z`).getTime() + DAY) / 1000)
  const url = `${YAHOO_URL}/${encodeURIComponent(yahooSymbol(ticker))}?period1=${period1}&period2=${period2}&interval=1d&events=div,split`

  const response = await fetchWithRetry(url, { headers: { "User-Agent": "Mozilla/5.0" } })
  if (!response.ok) throw new Error(`Yahoo HTTP ${response.status} para ${ticker}`)

  const data = await response.json()
  const result = data?.chart?.result?.[0]
  const timestamps: number[] | undefined = result?.timestamp
  const adj: (number | null)[] | undefined = result?.indicators?.adjclose?.[0]?.adjclose
  if (!timestamps || !adj) throw new Error(`Sem histórico para ${ticker}`)

  const series: PriceSeries = { dates: [], prices: [] }
  timestamps.forEach((ts, idx) => {
    const price = adj[idx]
    if (price != null && Number.isFinite(price) && price > 0) {
      series.dates.push(toIsoDate(ts))
      series.prices.push(price)
    }
  })

  cache.set(key, series)
  return series
}

// Monta a matriz de preços só com os dias em que TODOS os ativos negociaram.
export const fetchPriceMatrix = async (
  tickers: string[],
  start: string,
  end: string
): Promise<PriceMatrix> => {
  const all = await Promise.all(tickers.map((t) => fetchPriceSeries(t, start, end)))
  const maps = all.map((s) => new Map(s.dates.map((d, i) => [d, s.prices[i]])))

  const dates = all[0].dates.filter((d) => maps.every((m) => m.has(d)))
  const prices = dates.map((d) => maps.map((m) => m.get(d) as number))

  return { tickers, dates, prices }
}

// CDI diário (% a.d.) indexado por data YYYY-MM-DD
export const fetchCdi = async (start: string, end: string): Promise<Map<string, number>> => {
  const snap = readSnapshot<{ start: string; end: string; rates: [string, number][] }>("cdi")
  if (snap && snap.start <= start && snap.end >= end) {
    return new Map(snap.rates.filter(([d]) => d >= start && d <= end))
  }
  return downloadCdi(start, end)
}

const downloadCdi = async (start: string, end: string): Promise<Map<string, number>> => {
  const key = `cdi:${start}:${end}`
  if (cache.has(key)) return cache.get(key) as Map<string, number>

  const fmt = (iso: string) => iso.split("-").reverse().join("/")
  const rates = new Map<string, number>()

  // A API do BCB limita consultas diárias a 10 anos; quebramos em blocos anuais.
  const startYear = Number(start.slice(0, 4))
  const endYear = Number(end.slice(0, 4))
  for (let year = startYear; year <= endYear; year++) {
    const from = year === startYear ? start : `${year}-01-01`
    const to = year === endYear ? end : `${year}-12-31`
    const url = `${BCB_CDI_URL}?formato=json&dataInicial=${fmt(from)}&dataFinal=${fmt(to)}`
    const response = await fetchWithRetry(url)
    if (!response.ok) throw new Error(`BCB HTTP ${response.status}`)
    const rows: { data: string; valor: string }[] = await response.json()
    rows.forEach((r) => rates.set(r.data.split("/").reverse().join("-"), Number(r.valor) / 100))
  }

  cache.set(key, rates)
  return rates
}

// Taxa CDI anualizada (base 252) acumulada entre duas datas
export const cdiAnnualRate = (cdi: Map<string, number>, start: string, end: string): number => {
  let acc = 1
  let days = 0
  cdi.forEach((rate, date) => {
    if (date >= start && date <= end) {
      acc *= 1 + rate
      days++
    }
  })
  return days === 0 ? 0 : Math.pow(acc, 252 / days) - 1
}

// Série acumulada do CDI alinhada às datas informadas (base 1 no primeiro dia)
export const cdiCurve = (cdi: Map<string, number>, dates: string[]): number[] => {
  const curve = [1]
  for (let t = 1; t < dates.length; t++) {
    let acc = 1
    cdi.forEach((rate, date) => {
      if (date > dates[t - 1] && date <= dates[t]) acc *= 1 + rate
    })
    curve.push(curve[t - 1] * acc)
  }
  return curve
}

// Baixa uma única vez o histórico completo e grava em MARKET_DATA_DIR
export const snapshotMarketData = async (tickers: string[], start: string, end: string) => {
  const dir = process.env.MARKET_DATA_DIR
  if (!dir) throw new Error("Defina MARKET_DATA_DIR")
  mkdirSync(dir, { recursive: true })
  for (const ticker of tickers) {
    const file = snapshotFile(`px_${ticker}`) as string
    if (existsSync(file)) continue
    const series = await downloadPriceSeries(ticker, start, end)
    writeFileSync(file, JSON.stringify({ ticker, start, end, ...series }))
  }
  const cdiFile = snapshotFile("cdi") as string
  if (!existsSync(cdiFile)) {
    const rates = await downloadCdi(start, end)
    writeFileSync(cdiFile, JSON.stringify({ start, end, rates: [...rates.entries()] }))
  }
}
