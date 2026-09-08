import { redisClient } from "../../redis.client"
import { StockRepository } from "./stock.repository"

export interface StockInfo {
  symbol: string
  name: string
}

export interface StockPrice {
  symbol: string
  price: number
  currency: string
}

export interface StockHistory {
  timestamp: number[]
  close: number[]
}


export class StockService {

  private baseUrl = "https://query1.finance.yahoo.com/v8/finance/chart"
  private repository = new StockRepository()

  private normalizeTicker(ticker: string): string {
    return `${ticker.toUpperCase()}.SA`
  }


  private async fetchStock(
    ticker: string,
    params?: Record<string, string>
  ) {

    const yahooTicker = this.normalizeTicker(ticker)

    const query = params
      ? `?${new URLSearchParams(params).toString()}`
      : ""

    const url = `${this.baseUrl}/${yahooTicker}${query}`

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`)
    }

    const data = await response.json()

    const result = data?.chart?.result?.[0]

    if (!result) {
      throw new Error("Invalid API response")
    }

    return result
  }

  private async getCachedOrFetch<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    // 1️⃣ Tenta cache Redis
    const redisData = await redisClient.get(key)
    if (redisData) return JSON.parse(redisData)

    // 2️⃣ Tenta cache interno DAL
    const localCache = await this.repository.get<T>(key)
    if (localCache) return localCache

    // 3️⃣ Faz fetch e salva nos caches
    const data = await fetchFn()
    await redisClient.setEx(key, 60, JSON.stringify(data)) // TTL 60s
    await this.repository.set(key, data)
    return data
  }


  async getStockInfo(ticker: string): Promise<StockInfo> {
    return this.getCachedOrFetch(`info:${ticker.toUpperCase()}`, async () => {
      const result = await this.fetchStock(ticker)
      const { longName: name } = result.meta
      const { regularMarketPrice: price, currency } = result.meta

      return {
        symbol: ticker.toUpperCase(),
        name,
        price,
        currency
      }
    })

  }

  async getStockPrice(ticker: string): Promise<StockPrice> {
    const result = await this.fetchStock(ticker)

    const { regularMarketPrice: price, currency } = result.meta

    return {
      symbol: ticker.toUpperCase(),
      price,
      currency
    }
  }

  async getStockHistory(
    ticker: string,
    range: string,
    interval: string
  ): Promise<StockHistory> {

    const result = await this.fetchStock(ticker, {
      range,
      interval
    })

    return {
      timestamp: result.timestamp,
      close: result.indicators.quote[0].close
    }
  }

}