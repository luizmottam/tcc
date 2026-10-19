export interface StockCacheEntry<T> {
  data: T
  timestamp: number
}

export class StockRepository {
  private cache: Map<string, StockCacheEntry<any>> = new Map()

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key)
    if (!entry) return null

    const now = Date.now()
    if (now - entry.timestamp > 60 * 1000) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  async set<T>(key: string, data: T) {
    this.cache.set(key, { data, timestamp: Date.now() })
  }
}