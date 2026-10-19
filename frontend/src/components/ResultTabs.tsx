import {
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { num, pct, type BacktestSeries, type OptimizeResponse, type Portfolio } from '../api'

const axis = { stroke: 'var(--axis)', tick: { fill: 'var(--text-muted)', fontSize: 12 } }
const tooltipStyle = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 12,
  },
}

const fmtDate = (iso: string) => iso.split('-').reverse().join('/')

// Séries exibidas no gráfico de evolução (as demais ficam só na tabela)
const CURVE_SERIES = [
  { name: 'Média-CVaR · máx. STARR', color: 'var(--series-1)' },
  { name: 'Markowitz · máx. Sharpe', color: 'var(--series-2)' },
  { name: 'Carteira igualitária 1/N', color: 'var(--series-3)' },
  { name: 'Ibovespa', color: 'var(--series-4)' },
  { name: 'CDI', color: 'var(--text-muted)', dashed: true },
]

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="card">
    <div className="muted text-xs">{label}</div>
    <div className="text-lg font-semibold">{value}</div>
    {hint && <div className="muted text-xs">{hint}</div>}
  </div>
)

function Weights({ title, portfolio, sectorOf }: { title: string; portfolio: Portfolio; sectorOf: (t: string) => string }) {
  const rows = portfolio.tickers
    .map((ticker, k) => ({ ticker, weight: portfolio.weights[k] }))
    .sort((a, b) => b.weight - a.weight)
  const max = Math.max(...rows.map((r) => r.weight))
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      {rows.map((r) => (
        <div key={r.ticker} className="grid grid-cols-[64px_1fr_48px] items-center gap-2 text-xs" title={sectorOf(r.ticker)}>
          <span className="font-medium">{r.ticker}</span>
          <div className="h-3 rounded-r" style={{ width: `${(r.weight / max) * 100}%`, background: 'var(--series-1)' }} />
          <span className="tabular text-right">{pct(r.weight)}</span>
        </div>
      ))}
    </div>
  )
}

function SectorBreakdown({ portfolio, sectorOf }: { portfolio: Portfolio; sectorOf: (t: string) => string }) {
  const bySector = new Map<string, number>()
  portfolio.tickers.forEach((t, k) => bySector.set(sectorOf(t), (bySector.get(sectorOf(t)) ?? 0) + portfolio.weights[k]))
  const rows = [...bySector.entries()].sort((a, b) => b[1] - a[1])
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">Alocação por setor (recomendada)</h4>
      {rows.map(([sector, weight]) => (
        <div key={sector} className="grid grid-cols-[140px_1fr_48px] items-center gap-2 text-xs">
          <span>{sector}</span>
          <div className="h-3 rounded-r" style={{ width: `${weight * 100}%`, background: 'var(--series-1)' }} />
          <span className="tabular text-right">{pct(weight)}</span>
        </div>
      ))}
    </div>
  )
}

function MetricsTable({ series, cdi }: { series: BacktestSeries[]; cdi: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full text-sm">
        <thead>
          <tr className="muted text-left text-xs">
            <th className="py-2 pr-4 font-medium">Estratégia</th>
            <th className="pr-4 text-right font-medium">Retorno</th>
            <th className="pr-4 text-right font-medium">Vol. a.a.</th>
            <th className="pr-4 text-right font-medium">Sharpe</th>
            <th className="pr-4 text-right font-medium">Sortino</th>
            <th className="pr-4 text-right font-medium">CVaR 95% diário</th>
            <th className="text-right font-medium">Drawdown máx.</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.name} style={{ borderTop: '1px solid var(--border)' }}>
              <td className="py-2 pr-4">{s.name}</td>
              <td className="pr-4 text-right">{pct(s.report.totalReturn)}</td>
              <td className="pr-4 text-right">{pct(s.report.annualVolatility)}</td>
              <td className="pr-4 text-right">{num(s.report.sharpe)}</td>
              <td className="pr-4 text-right">{num(s.report.sortino)}</td>
              <td className="pr-4 text-right">{pct(s.report.cvar95, 2)}</td>
              <td className="text-right">{pct(s.report.maxDrawdown)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted mt-2 text-xs">Sharpe e Sortino usam o CDI do período de teste ({pct(cdi)} a.a.) como taxa livre de risco.</p>
    </div>
  )
}

export function SummaryTab({ data }: { data: OptimizeResponse }) {
  const sectorOf = (t: string) => data.universe.find((u) => u.ticker === t)?.sector ?? ''
  const { meanCvar, test } = data
  const rec = meanCvar.recommended
  const find = (name: string) => test?.series.find((s) => s.name === name)
  const recTest = find('Média-CVaR · máx. STARR')
  const ibov = find('Ibovespa')
  const equal = find('Carteira igualitária 1/N')

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Treino" value={`${fmtDate(data.train.start)} – ${fmtDate(data.train.end)}`} hint={`${data.train.days} pregões`} />
        <Stat label="CDI no treino" value={`${pct(data.train.cdiAnnual)} a.a.`} />
        <Stat label="Tempo NSGA-II" value={`${num(meanCvar.runtimeMs / 1000, 1)} s`} />
        <Stat label="Avaliações" value={meanCvar.evaluations.toLocaleString('pt-BR')} />
      </section>

      <section className="card flex flex-col gap-4">
        <div>
          <h3 className="font-semibold">Carteira recomendada (máximo STARR)</h3>
          <p className="muted text-sm">Maior retorno acima do CDI por unidade de CVaR na fronteira de Pareto do treino.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Retorno no treino" value={`${pct(rec.expectedReturn)} a.a.`} />
          <Stat label="CVaR 95% diário no treino" value={pct(rec.risk, 2)} />
          {recTest && <Stat label="Retorno no teste" value={pct(recTest.report.totalReturn)} hint={test && `${fmtDate(test.start)} – ${fmtDate(test.end)}`} />}
          {recTest && ibov && equal && (
            <Stat
              label="Contra Ibovespa / 1/N"
              value={`${num((recTest.report.totalReturn - ibov.report.totalReturn) * 100, 1)} / ${num((recTest.report.totalReturn - equal.report.totalReturn) * 100, 1)} p.p.`}
            />
          )}
        </div>
        <Weights title="Composição" portfolio={rec} sectorOf={sectorOf} />
      </section>

      {data.excluded.length > 0 && (
        <p className="muted text-xs">Excluídos por falta de histórico no período: {data.excluded.join(', ')}.</p>
      )}
    </div>
  )
}

export function PerformanceTab({ data }: { data: OptimizeResponse }) {
  const { test } = data
  if (!test) return <p className="card muted">Defina um fim de teste na aba Configuração para ver o desempenho fora da amostra.</p>

  const curveData = test.dates.map((date, t) => {
    const row: Record<string, number | string> = { date: fmtDate(date) }
    test.series.forEach((s) => (row[s.name] = (s.curve[t] - 1) * 100))
    return row
  })

  return (
    <section className="card flex flex-col gap-3">
      <div>
        <h3 className="font-semibold">Desempenho fora da amostra (Buy and Hold)</h3>
        <p className="muted text-sm">
          Retorno acumulado (%) de {fmtDate(test.start)} a {fmtDate(test.end)}. Carteiras compradas no último pregão do
          treino e mantidas sem rebalanceamento.
        </p>
      </div>
      <div className="h-80">
        <ResponsiveContainer>
          <LineChart data={curveData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="date" {...axis} minTickGap={48} />
            <YAxis {...axis} unit="%" width={48} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => `${num(v, 1)}%`} />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
            {CURVE_SERIES.map((s) => (
              <Line key={s.name} dataKey={s.name} stroke={s.color} strokeWidth={2}
                strokeDasharray={s.dashed ? '4 4' : undefined} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <MetricsTable series={test.series} cdi={test.cdiAnnual} />
    </section>
  )
}

export function FrontierTab({ data }: { data: OptimizeResponse }) {
  const { meanCvar } = data
  const frontData = meanCvar.front.map((p) => ({ x: p.risk * 100, y: p.expectedReturn * 100 }))
  // Rótulo de cada escolha posicionado longe da curva, para não colidir com os pontos
  const picks = [
    { label: 'Mín. CVaR', p: meanCvar.conservative, position: 'right' as const },
    { label: 'Máx. STARR', p: meanCvar.recommended, position: 'top' as const },
    { label: 'Máx. retorno', p: meanCvar.aggressive, position: 'bottom' as const },
  ].map((k) => ({ ...k, data: [{ x: k.p.risk * 100, y: k.p.expectedReturn * 100, label: k.label }] }))
  const convergence = meanCvar.convergence.map((hv, gen) => ({ gen, hv: hv * 1e4 }))

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="card flex flex-col gap-3">
        <div>
          <h3 className="font-semibold">Fronteira de Pareto Média-CVaR (treino)</h3>
          <p className="muted text-sm">{meanCvar.front.length} carteiras não dominadas encontradas pelo NSGA-II.</p>
        </div>
        <div className="h-80">
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 16, right: 24, bottom: 16, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" />
              <XAxis type="number" dataKey="x" name="CVaR 95%" unit="%" {...axis} domain={['auto', 'auto']}
                label={{ value: 'CVaR 95% diário', position: 'insideBottom', offset: -8, fill: 'var(--text-muted)', fontSize: 12 }} />
              <YAxis type="number" dataKey="y" name="Retorno" unit="%" {...axis} width={48} domain={['auto', 'auto']} />
              <ZAxis range={[48, 48]} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => `${num(v, 2)}%`} />
              <Scatter name="Fronteira" data={frontData} fill="var(--series-1)" fillOpacity={0.55} isAnimationActive={false} />
              {picks.map((k) => (
                <Scatter key={k.label} name={k.label} data={k.data} fill="var(--series-2)" stroke="var(--surface)"
                  strokeWidth={2} isAnimationActive={false}>
                  <LabelList dataKey="label" position={k.position} offset={10} fill="var(--text-secondary)" fontSize={11} />
                </Scatter>
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card flex flex-col gap-3">
        <div>
          <h3 className="font-semibold">Convergência do NSGA-II</h3>
          <p className="muted text-sm">Hipervolume da fronteira por geração (×10⁻⁴). Estabilizar indica convergência.</p>
        </div>
        <div className="h-80">
          <ResponsiveContainer>
            <LineChart data={convergence} margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="gen" type="number" domain={[0, 'dataMax']} tickCount={6} {...axis}
                label={{ value: 'Geração', position: 'insideBottom', offset: -8, fill: 'var(--text-muted)', fontSize: 12 }} />
              <YAxis {...axis} width={48} domain={['auto', 'auto']} tickFormatter={(v: number) => num(v, 1)} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => num(v, 3)} labelFormatter={(g) => `Geração ${g}`} />
              <Line dataKey="hv" name="Hipervolume" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}

export function CompositionTab({ data }: { data: OptimizeResponse }) {
  const sectorOf = (t: string) => data.universe.find((u) => u.ticker === t)?.sector ?? ''
  const { meanCvar, markowitz } = data
  return (
    <div className="flex flex-col gap-6">
      <section className="card grid grid-cols-1 gap-6 md:grid-cols-2">
        <Weights title="Média-CVaR · máx. STARR (recomendada)" portfolio={meanCvar.recommended} sectorOf={sectorOf} />
        <Weights title="Média-CVaR · mín. CVaR (conservadora)" portfolio={meanCvar.conservative} sectorOf={sectorOf} />
        <Weights title="Markowitz · máx. Sharpe" portfolio={markowitz.recommended} sectorOf={sectorOf} />
        <Weights title="Markowitz · mín. variância" portfolio={markowitz.conservative} sectorOf={sectorOf} />
      </section>
      <section className="card">
        <SectorBreakdown portfolio={meanCvar.recommended} sectorOf={sectorOf} />
      </section>
    </div>
  )
}
