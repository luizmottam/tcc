import { useEffect, useRef, useState } from 'react'
import { fetchUniverse, optimizePortfolio, type Asset } from './api'
import { OptimizerForm } from './components/OptimizerForm'
import { PortfolioSidebar } from './components/PortfolioSidebar'
import { CompositionTab, FrontierTab, PerformanceTab, SummaryTab } from './components/ResultTabs'
import { defaultRequest, newPortfolio, requestKey, statusOf, usePortfolios } from './store'

const TABS = [
  { id: 'config', label: 'Configuração' },
  { id: 'summary', label: 'Resumo' },
  { id: 'performance', label: 'Desempenho' },
  { id: 'frontier', label: 'Fronteira' },
  { id: 'composition', label: 'Composição' },
] as const
type TabId = (typeof TABS)[number]['id']

function App() {
  const { portfolios, add, update, remove, saveError } = usePortfolios()
  const [universe, setUniverse] = useState<Asset[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('config')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchUniverse()
      .then(setUniverse)
      .catch((e) => setError(e.message))
  }, [])

  // Primeira visita: cria uma carteira inicial com o universo completo
  const seeded = useRef(false)
  useEffect(() => {
    if (universe.length > 0 && portfolios.length === 0 && !seeded.current) {
      seeded.current = true
      const first = newPortfolio('Carteira 1', defaultRequest(universe.map((a) => a.ticker)))
      add(first)
      setSelectedId(first.id)
    }
  }, [universe, portfolios.length, add])

  const current = portfolios.find((p) => p.id === selectedId) ?? portfolios[0]

  const select = (id: string) => {
    setSelectedId(id)
    setError('')
    const p = portfolios.find((x) => x.id === id)
    setTab(p?.result ? 'summary' : 'config')
  }

  const create = () => {
    const p = newPortfolio(`Carteira ${portfolios.length + 1}`, defaultRequest(universe.map((a) => a.ticker)))
    add(p)
    setSelectedId(p.id)
    setTab('config')
  }

  const duplicate = () => {
    if (!current) return
    const copy = { ...newPortfolio(`${current.title} (cópia)`, current.request), description: current.description }
    add(copy)
    setSelectedId(copy.id)
    setTab('config')
  }

  const removeCurrent = () => {
    if (!current || !window.confirm(`Excluir "${current.title}"? Essa ação não pode ser desfeita.`)) return
    remove(current.id)
    setSelectedId(portfolios.find((p) => p.id !== current.id)?.id ?? null)
  }

  const run = async () => {
    if (!current) return
    const { id, request } = current
    setLoadingId(id)
    setError('')
    try {
      const result = await optimizePortfolio(request)
      update(id, { result, resultKey: requestKey(request), optimizedAt: new Date().toISOString() })
      if (selectedId === id || !selectedId) setTab('summary')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado')
    } finally {
      setLoadingId(null)
    }
  }

  const status = current ? statusOf(current) : ''

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold">Otimizador de Carteiras Buy and Hold</h1>
        <p className="muted text-sm">
          Algoritmo genético multiobjetivo (NSGA-II) com modelo Média-CVaR, comparado a Markowitz, carteira 1/N,
          Ibovespa e CDI.
        </p>
      </header>

      {saveError && (
        <p className="card text-sm" style={{ color: 'var(--critical)' }}>
          Não foi possível salvar no navegador (armazenamento cheio ou bloqueado). As alterações valem só nesta sessão.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <PortfolioSidebar
          portfolios={portfolios}
          selectedId={current?.id ?? null}
          loadingId={loadingId}
          onSelect={select}
          onCreate={create}
        />

        {current ? (
          <main className="flex min-w-0 flex-col gap-4">
            <section className="card flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <input
                  aria-label="Título da carteira"
                  value={current.title}
                  onChange={(e) => update(current.id, { title: e.target.value })}
                  className="min-w-0 flex-1 text-xl font-semibold"
                  style={{ border: '1px solid transparent', background: 'transparent' }}
                  placeholder="Título da carteira"
                />
                <div className="flex gap-2 text-sm">
                  <button onClick={duplicate} className="rounded-lg px-3 py-1" style={{ border: '1px solid var(--border)' }}>
                    Duplicar
                  </button>
                  <button
                    onClick={removeCurrent}
                    className="rounded-lg px-3 py-1"
                    style={{ border: '1px solid var(--border)', color: 'var(--critical)' }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
              <textarea
                aria-label="Descrição da carteira"
                value={current.description}
                onChange={(e) => update(current.id, { description: e.target.value })}
                placeholder="Descrição: objetivo, perfil do investidor, observações…"
                rows={2}
                className="w-full resize-y rounded-lg px-3 py-2 text-sm"
                style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}
              />
              <p className="muted text-xs">
                {loadingId === current.id ? 'Otimizando…' : status}
                {current.optimizedAt && ` · otimizada em ${new Date(current.optimizedAt).toLocaleString('pt-BR')}`}
                {status === 'Parâmetros alterados' && ' · otimize de novo para atualizar os resultados'}
              </p>
            </section>

            <div role="tablist" aria-label="Seções da carteira" className="flex gap-1 overflow-x-auto"
              style={{ borderBottom: '1px solid var(--border)' }}>
              {TABS.map((t) => {
                const disabled = t.id !== 'config' && !current.result
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={active}
                    disabled={disabled}
                    onClick={() => setTab(t.id)}
                    className="whitespace-nowrap px-4 py-2 text-sm font-medium disabled:opacity-40"
                    style={{
                      borderBottom: `2px solid ${active ? 'var(--series-1)' : 'transparent'}`,
                      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                      marginBottom: -1,
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>

            {error && (
              <p className="card" style={{ color: 'var(--critical)' }}>
                {error}
              </p>
            )}

            <div role="tabpanel">
              {tab === 'config' && (
                <OptimizerForm
                  universe={universe}
                  value={current.request}
                  loading={loadingId === current.id}
                  onChange={(request) => update(current.id, { request })}
                  onSubmit={run}
                />
              )}
              {current.result && tab === 'summary' && <SummaryTab data={current.result} />}
              {current.result && tab === 'performance' && <PerformanceTab data={current.result} />}
              {current.result && tab === 'frontier' && <FrontierTab data={current.result} />}
              {current.result && tab === 'composition' && <CompositionTab data={current.result} />}
            </div>
          </main>
        ) : (
          <p className="card muted">Carregando…</p>
        )}
      </div>
    </div>
  )
}

export default App
