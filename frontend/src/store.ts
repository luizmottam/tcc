import { useCallback, useEffect, useState } from 'react'
import type { OptimizeRequest, OptimizeResponse } from './api'

// Carteira salva pelo usuário: título, descrição, configuração e o último resultado da otimização.
export interface SavedPortfolio {
  id: string
  title: string
  description: string
  createdAt: string
  updatedAt: string
  request: OptimizeRequest
  result?: OptimizeResponse
  resultKey?: string // configuração que gerou o resultado (detecta parâmetros alterados)
  optimizedAt?: string
}

const STORAGE_KEY = 'tcc:portfolios:v1'

export const requestKey = (request: OptimizeRequest) => JSON.stringify(request)

export const statusOf = (p: SavedPortfolio) =>
  !p.result ? 'Rascunho' : p.resultKey === requestKey(p.request) ? 'Otimizada' : 'Parâmetros alterados'

export const defaultRequest = (tickers: string[]): OptimizeRequest => ({
  tickers,
  trainStart: '2021-01-01',
  trainEnd: '2024-12-31',
  testEnd: '2025-12-31',
  options: {
    cardinality: 8,
    minWeight: 0.05,
    maxWeight: 0.25,
    maxSectorWeight: 0.4,
    populationSize: 120,
    generations: 250,
    seed: 42,
  },
})

export const newPortfolio = (title: string, request: OptimizeRequest): SavedPortfolio => {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), title, description: '', createdAt: now, updatedAt: now, request }
}

const load = (): SavedPortfolio[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// Lista de carteiras persistida no navegador (localStorage)
export function usePortfolios() {
  const [portfolios, setPortfolios] = useState<SavedPortfolio[]>(load)
  const [saveError, setSaveError] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios))
      // Reflete na tela o resultado da gravação no armazenamento externo (localStorage)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSaveError(false)
    } catch {
      setSaveError(true)
    }
  }, [portfolios])

  const add = useCallback((portfolio: SavedPortfolio) => setPortfolios((list) => [...list, portfolio]), [])

  const update = useCallback(
    (id: string, patch: Partial<SavedPortfolio>) =>
      setPortfolios((list) =>
        list.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p))
      ),
    []
  )

  const remove = useCallback((id: string) => setPortfolios((list) => list.filter((p) => p.id !== id)), [])

  return { portfolios, add, update, remove, saveError }
}
