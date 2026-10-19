import { statusOf, type SavedPortfolio } from '../store'

interface Props {
  portfolios: SavedPortfolio[]
  selectedId: string | null
  loadingId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
}

export function PortfolioSidebar({ portfolios, selectedId, loadingId, onSelect, onCreate }: Props) {
  return (
    <aside className="card flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Carteiras</h2>
        <span className="muted text-xs">{portfolios.length}</span>
      </div>

      <nav className="flex flex-col gap-1" aria-label="Carteiras salvas">
        {portfolios.map((p) => {
          const active = p.id === selectedId
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              aria-current={active ? 'page' : undefined}
              className="flex flex-col items-start rounded-lg px-3 py-2 text-left"
              style={{
                background: active ? 'color-mix(in srgb, var(--series-1) 12%, transparent)' : 'transparent',
                border: `1px solid ${active ? 'var(--series-1)' : 'transparent'}`,
              }}
            >
              <span className="w-full truncate text-sm font-medium">{p.title || 'Sem título'}</span>
              <span className="muted text-xs">
                {loadingId === p.id ? 'Otimizando…' : statusOf(p)} · {p.request.tickers.length} ativos · K ={' '}
                {p.request.options.cardinality}
              </span>
            </button>
          )
        })}
      </nav>

      <button
        onClick={onCreate}
        className="rounded-lg px-3 py-2 text-sm font-semibold"
        style={{ border: '1px dashed var(--axis)', color: 'var(--text-secondary)' }}
      >
        + Nova carteira
      </button>
    </aside>
  )
}
