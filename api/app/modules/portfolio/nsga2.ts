// NSGA-II (Deb et al., 2002) com codificação real em [0,1]^n.
// - Seleção: torneio binário por (rank, crowding distance)
// - Cruzamento: SBX (Simulated Binary Crossover)
// - Mutação: polinomial
// - Restrições: dominância restrita (factível domina infactível; entre infactíveis, menor violação vence)
// - Elitismo: (mu + lambda) — pais e filhos competem pela próxima geração
import { Rng } from "./rng"

export interface Evaluation {
  objectives: number[] // todos minimizados
  violation: number // 0 = factível
}

export interface Individual extends Evaluation {
  genome: number[]
  rank: number
  crowding: number
}

export interface Nsga2Options {
  populationSize: number
  generations: number
  genomeLength: number
  crossoverRate: number
  crossoverEta: number
  mutationEta: number
  mutationRate?: number // padrão 1/n
  rng: Rng
  evaluate: (genome: number[]) => Evaluation
  onGeneration?: (generation: number, population: Individual[]) => void
}

const dominates = (a: Individual, b: Individual): boolean => {
  if (a.violation === 0 && b.violation > 0) return true
  if (a.violation > 0 && b.violation === 0) return false
  if (a.violation > 0 && b.violation > 0) return a.violation < b.violation

  let strictlyBetter = false
  for (let m = 0; m < a.objectives.length; m++) {
    if (a.objectives[m] > b.objectives[m]) return false
    if (a.objectives[m] < b.objectives[m]) strictlyBetter = true
  }
  return strictlyBetter
}

// Ordenação rápida por não-dominância: devolve as frentes (índices) em ordem
export const fastNonDominatedSort = (pop: Individual[]): number[][] => {
  const n = pop.length
  const dominatedBy: number[][] = Array.from({ length: n }, () => [])
  const dominationCount = new Array(n).fill(0)
  const fronts: number[][] = [[]]

  for (let p = 0; p < n; p++) {
    for (let q = p + 1; q < n; q++) {
      if (dominates(pop[p], pop[q])) {
        dominatedBy[p].push(q)
        dominationCount[q]++
      } else if (dominates(pop[q], pop[p])) {
        dominatedBy[q].push(p)
        dominationCount[p]++
      }
    }
  }

  for (let p = 0; p < n; p++) {
    if (dominationCount[p] === 0) {
      pop[p].rank = 0
      fronts[0].push(p)
    }
  }

  let i = 0
  while (fronts[i].length > 0) {
    const next: number[] = []
    for (const p of fronts[i]) {
      for (const q of dominatedBy[p]) {
        if (--dominationCount[q] === 0) {
          pop[q].rank = i + 1
          next.push(q)
        }
      }
    }
    fronts.push(next)
    i++
  }
  fronts.pop()
  return fronts
}

const assignCrowding = (pop: Individual[], front: number[]) => {
  front.forEach((i) => (pop[i].crowding = 0))
  if (front.length <= 2) {
    front.forEach((i) => (pop[i].crowding = Infinity))
    return
  }
  const objectives = pop[front[0]].objectives.length
  for (let m = 0; m < objectives; m++) {
    const sorted = [...front].sort((a, b) => pop[a].objectives[m] - pop[b].objectives[m])
    const min = pop[sorted[0]].objectives[m]
    const max = pop[sorted[sorted.length - 1]].objectives[m]
    pop[sorted[0]].crowding = Infinity
    pop[sorted[sorted.length - 1]].crowding = Infinity
    if (max - min === 0) continue
    for (let k = 1; k < sorted.length - 1; k++) {
      pop[sorted[k]].crowding +=
        (pop[sorted[k + 1]].objectives[m] - pop[sorted[k - 1]].objectives[m]) / (max - min)
    }
  }
}

const crowdedBetter = (a: Individual, b: Individual): boolean =>
  a.rank < b.rank || (a.rank === b.rank && a.crowding > b.crowding)

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

// SBX para variáveis em [0,1]
const sbx = (p1: number[], p2: number[], eta: number, rng: Rng): [number[], number[]] => {
  const c1 = [...p1]
  const c2 = [...p2]
  for (let i = 0; i < p1.length; i++) {
    if (rng() > 0.5 || Math.abs(p1[i] - p2[i]) < 1e-14) continue
    const u = rng()
    const beta = u <= 0.5 ? Math.pow(2 * u, 1 / (eta + 1)) : Math.pow(1 / (2 * (1 - u)), 1 / (eta + 1))
    c1[i] = clamp01(0.5 * ((1 + beta) * p1[i] + (1 - beta) * p2[i]))
    c2[i] = clamp01(0.5 * ((1 - beta) * p1[i] + (1 + beta) * p2[i]))
  }
  return [c1, c2]
}

// Mutação polinomial para variáveis em [0,1]
const polynomialMutation = (genome: number[], rate: number, eta: number, rng: Rng): number[] =>
  genome.map((x) => {
    if (rng() >= rate) return x
    const u = rng()
    const delta = u < 0.5 ? Math.pow(2 * u, 1 / (eta + 1)) - 1 : 1 - Math.pow(2 * (1 - u), 1 / (eta + 1))
    return clamp01(x + delta)
  })

export const runNsga2 = (opts: Nsga2Options): Individual[] => {
  const { populationSize: N, genomeLength: n, rng, evaluate } = opts
  const mutationRate = opts.mutationRate ?? 1 / n

  const makeIndividual = (genome: number[]): Individual => ({
    genome,
    ...evaluate(genome),
    rank: 0,
    crowding: 0,
  })

  let population: Individual[] = Array.from({ length: N }, () =>
    makeIndividual(Array.from({ length: n }, () => rng()))
  )
  fastNonDominatedSort(population).forEach((f) => assignCrowding(population, f))
  opts.onGeneration?.(0, population)

  const tournament = (): Individual => {
    const a = population[Math.floor(rng() * N)]
    const b = population[Math.floor(rng() * N)]
    return crowdedBetter(a, b) ? a : b
  }

  for (let gen = 1; gen <= opts.generations; gen++) {
    const offspring: Individual[] = []
    while (offspring.length < N) {
      const p1 = tournament()
      const p2 = tournament()
      let [c1, c2] =
        rng() < opts.crossoverRate
          ? sbx(p1.genome, p2.genome, opts.crossoverEta, rng)
          : [[...p1.genome], [...p2.genome]]
      c1 = polynomialMutation(c1, mutationRate, opts.mutationEta, rng)
      c2 = polynomialMutation(c2, mutationRate, opts.mutationEta, rng)
      offspring.push(makeIndividual(c1))
      if (offspring.length < N) offspring.push(makeIndividual(c2))
    }

    // Elitismo (mu + lambda): une pais e filhos e seleciona por frentes + crowding
    const combined = [...population, ...offspring]
    const fronts = fastNonDominatedSort(combined)
    const next: Individual[] = []
    for (const front of fronts) {
      assignCrowding(combined, front)
      if (next.length + front.length <= N) {
        front.forEach((i) => next.push(combined[i]))
      } else {
        const sorted = [...front].sort((a, b) => combined[b].crowding - combined[a].crowding)
        sorted.slice(0, N - next.length).forEach((i) => next.push(combined[i]))
        break
      }
    }
    population = next
    opts.onGeneration?.(gen, population)
  }

  return population
}

// Hipervolume 2D (minimização) em relação a um ponto de referência.
// Mede, num único número, quão boa e espalhada está a fronteira — usado para medir convergência.
export const hypervolume2d = (points: number[][], ref: [number, number]): number => {
  const pts = points
    .filter((p) => p[0] < ref[0] && p[1] < ref[1])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let hv = 0
  let prevF2 = ref[1]
  for (const p of pts) {
    if (p[1] < prevF2) {
      hv += (ref[0] - p[0]) * (prevF2 - p[1])
      prevF2 = p[1]
    }
  }
  return hv
}
