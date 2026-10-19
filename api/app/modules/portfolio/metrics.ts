// Métricas de risco e retorno. Todas determinísticas (sem reamostragem),
// para que a mesma carteira sempre receba a mesma avaliação no AG.

export const TRADING_DAYS = 252

// Trajetória Buy and Hold: compra no dia 0 com pesos w e não rebalanceia.
// V_t = soma_i w_i * P_i(t) / P_i(0)
export const buyAndHoldCurve = (
  relPrices: Float64Array[], // relPrices[i][t] = P_i(t)/P_i(0)
  assets: number[],
  weights: number[]
): Float64Array => {
  const T = relPrices[0].length
  const curve = new Float64Array(T)
  for (let k = 0; k < assets.length; k++) {
    const series = relPrices[assets[k]]
    const w = weights[k]
    for (let t = 0; t < T; t++) curve[t] += w * series[t]
  }
  return curve
}

export const dailyReturns = (curve: ArrayLike<number>): Float64Array => {
  const r = new Float64Array(curve.length - 1)
  for (let t = 1; t < curve.length; t++) r[t - 1] = curve[t] / curve[t - 1] - 1
  return r
}

// Retorno anualizado composto (CAGR) de uma curva de patrimônio
export const cagr = (curve: ArrayLike<number>): number =>
  Math.pow(curve[curve.length - 1] / curve[0], TRADING_DAYS / (curve.length - 1)) - 1

export const mean = (x: ArrayLike<number>): number => {
  let s = 0
  for (let i = 0; i < x.length; i++) s += x[i]
  return s / x.length
}

export const stdev = (x: ArrayLike<number>): number => {
  const m = mean(x)
  let s = 0
  for (let i = 0; i < x.length; i++) s += (x[i] - m) ** 2
  return Math.sqrt(s / (x.length - 1))
}

// CVaR histórico (Rockafellar & Uryasev, 2000): média das perdas nos (1-alpha) piores dias.
// Retorna valor positivo = perda média esperada no cenário de cauda.
export const cvar = (returns: ArrayLike<number>, alpha = 0.95): number => {
  const sorted = Float64Array.from(returns).sort()
  const tail = Math.max(1, Math.floor(sorted.length * (1 - alpha)))
  let s = 0
  for (let i = 0; i < tail; i++) s += sorted[i]
  return -s / tail
}

export const valueAtRisk = (returns: ArrayLike<number>, alpha = 0.95): number => {
  const sorted = Float64Array.from(returns).sort()
  return -sorted[Math.max(0, Math.floor(sorted.length * (1 - alpha)) - 1)]
}

export const maxDrawdown = (curve: ArrayLike<number>): number => {
  let peak = curve[0]
  let mdd = 0
  for (let t = 0; t < curve.length; t++) {
    if (curve[t] > peak) peak = curve[t]
    mdd = Math.max(mdd, 1 - curve[t] / peak)
  }
  return mdd
}

export interface PerformanceReport {
  totalReturn: number
  annualReturn: number
  annualVolatility: number
  sharpe: number // (retorno - CDI) / volatilidade
  sortino: number // (retorno - CDI) / desvio negativo
  cvar95: number // diário
  var95: number // diário
  maxDrawdown: number
}

export const performance = (curve: ArrayLike<number>, riskFreeAnnual: number): PerformanceReport => {
  const r = dailyReturns(curve)
  const annualReturn = cagr(curve)
  const annualVolatility = stdev(r) * Math.sqrt(TRADING_DAYS)

  const rfDaily = Math.pow(1 + riskFreeAnnual, 1 / TRADING_DAYS) - 1
  let downside = 0
  for (let i = 0; i < r.length; i++) downside += Math.min(0, r[i] - rfDaily) ** 2
  const downsideDev = Math.sqrt(downside / r.length) * Math.sqrt(TRADING_DAYS)

  return {
    totalReturn: curve[curve.length - 1] / curve[0] - 1,
    annualReturn,
    annualVolatility,
    sharpe: (annualReturn - riskFreeAnnual) / annualVolatility,
    sortino: downsideDev > 0 ? (annualReturn - riskFreeAnnual) / downsideDev : 0,
    cvar95: cvar(r),
    var95: valueAtRisk(r),
    maxDrawdown: maxDrawdown(curve),
  }
}
