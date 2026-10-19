import type { Asset, OptimizeRequest } from '../api'

interface Props {
  universe: Asset[]
  value: OptimizeRequest
  loading: boolean
  onChange: (request: OptimizeRequest) => void
  onSubmit: () => void
}

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="font-medium">{label}</span>
    {children}
    {hint && <span className="muted text-xs">{hint}</span>}
  </label>
)

export function OptimizerForm({ universe, value, loading, onChange, onSubmit }: Props) {
  const selected = new Set(value.tickers)
  const { options } = value

  const set = (patch: Partial<OptimizeRequest>) => onChange({ ...value, ...patch })
  const setOption = (patch: Partial<OptimizeRequest['options']>) => onChange({ ...value, options: { ...options, ...patch } })

  const toggle = (ticker: string) => {
    const next = new Set(selected)
    if (next.has(ticker)) next.delete(ticker)
    else next.add(ticker)
    // Mantém a ordem do universo para a otimização ser reproduzível
    set({ tickers: universe.map((a) => a.ticker).filter((t) => next.has(t)) })
  }

  const k = Math.min(options.cardinality, selected.size)
  const feasible = k * options.minWeight <= 1 && k * options.maxWeight >= 1 && selected.size >= 2
  const sectors = [...new Set(universe.map((a) => a.sector))]

  return (
    <section className="card flex flex-col gap-5">
      <div>
        <h3 className="font-semibold">Períodos</h3>
        <p className="muted text-sm">
          O AG otimiza com os dados do treino. O teste mede, fora da amostra, como a carteira comprada no fim do treino
          se comportou mantida sem rebalanceamento (Buy and Hold).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Início do treino">
          <input type="date" value={value.trainStart} onChange={(e) => set({ trainStart: e.target.value })} />
        </Field>
        <Field label="Fim do treino / compra">
          <input type="date" value={value.trainEnd} onChange={(e) => set({ trainEnd: e.target.value })} />
        </Field>
        <Field label="Fim do teste" hint="Deixe vazio para só otimizar">
          <input type="date" value={value.testEnd ?? ''} onChange={(e) => set({ testEnd: e.target.value || undefined })} />
        </Field>
      </div>

      <h3 className="font-semibold">Restrições e algoritmo</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Nº de ativos (K)">
          <input type="number" min={2} max={20} value={options.cardinality}
            onChange={(e) => setOption({ cardinality: Number(e.target.value) })} />
        </Field>
        <Field label="Peso máx. por ativo (%)">
          <input type="number" min={5} max={100} value={Math.round(options.maxWeight * 100)}
            onChange={(e) => setOption({ maxWeight: Number(e.target.value) / 100 })} />
        </Field>
        <Field label="Peso máx. por setor (%)">
          <input type="number" min={10} max={100} value={Math.round(options.maxSectorWeight * 100)}
            onChange={(e) => setOption({ maxSectorWeight: Number(e.target.value) / 100 })} />
        </Field>
        <Field label="Gerações">
          <input type="number" min={10} max={1000} value={options.generations}
            onChange={(e) => setOption({ generations: Number(e.target.value) })} />
        </Field>
        <Field label="Semente" hint="Mesma semente = mesmo resultado">
          <input type="number" min={1} value={options.seed} onChange={(e) => setOption({ seed: Number(e.target.value) })} />
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h3 className="font-semibold">
            Universo de ativos ({selected.size}/{universe.length})
          </h3>
          <div className="flex gap-3 text-xs">
            <button className="underline" onClick={() => set({ tickers: universe.map((a) => a.ticker) })}>
              Todos
            </button>
            <button className="underline" onClick={() => set({ tickers: [] })}>
              Nenhum
            </button>
          </div>
        </div>
        {sectors.map((sector) => (
          <div key={sector} className="flex flex-wrap items-center gap-2">
            <span className="muted w-40 text-xs">{sector}</span>
            {universe
              .filter((a) => a.sector === sector)
              .map((a) => (
                <button
                  key={a.ticker}
                  onClick={() => toggle(a.ticker)}
                  aria-pressed={selected.has(a.ticker)}
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{
                    border: '1px solid var(--border)',
                    background: selected.has(a.ticker) ? 'var(--series-1)' : 'transparent',
                    color: selected.has(a.ticker) ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {a.ticker}
                </button>
              ))}
          </div>
        ))}
      </div>

      {!feasible && (
        <p className="text-sm" style={{ color: 'var(--critical)' }}>
          Restrições inviáveis: com K = {k}, o peso máximo precisa ser ≥ {Math.ceil(100 / Math.max(k, 1))}% e é preciso
          selecionar ao menos 2 ativos.
        </p>
      )}

      <button
        disabled={loading || !feasible}
        onClick={onSubmit}
        className="self-start rounded-lg px-5 py-2 font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--series-1)' }}
      >
        {loading ? 'Otimizando…' : 'Otimizar carteira'}
      </button>
    </section>
  )
}
