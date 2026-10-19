# Otimizador de Carteiras Buy and Hold — NSGA-II + CVaR

TCC (IESB, Ciência da Computação). Aplicação web que otimiza carteiras de ações da B3 para a estratégia
**Buy and Hold** com o modelo **Média-CVaR** resolvido por um algoritmo genético multiobjetivo (**NSGA-II**),
comparado a Markowitz, à carteira igualitária 1/N, ao Ibovespa e ao CDI em dados fora da amostra.

## Estrutura

```text
api/                         Node.js + TypeScript + Express
  app/modules/stock/         consulta de ativos (Yahoo Finance + cache Redis)
  app/modules/portfolio/
    market-data.ts           preços ajustados (Yahoo) e CDI (BCB/SGS 12), snapshot opcional em disco
    metrics.ts               trajetória Buy and Hold, CAGR, CVaR, Sharpe, Sortino, drawdown
    nsga2.ts                 NSGA-II (torneio, SBX, mutação polinomial, dominância restrita, hipervolume)
    optimizer.ts             codificação da carteira, restrições, modelos Média-CVaR e Média-Variância
    portfolio.service.ts     treino, otimização e backtest fora da amostra
    universe.ts              universo padrão de 24 ações com perfil Buy and Hold
  scripts/experiment.ts      experimento walk-forward do TCC (6 janelas × 30 sementes)
frontend/                    React + Vite + Tailwind + Recharts
results/                     saída do experimento (summary.json, raw.json) e snapshot dos dados (data/)
```

## Modelo

- **Objetivos** (período de treino, sobre a trajetória real de compra e manutenção):
  maximizar o CAGR e minimizar o CVaR 95% diário.
- **Restrições**: exatamente K ativos (padrão 8), peso por ativo entre 5% e 25%, no máximo 40% por setor.
- **Codificação**: vetor real em [0,1]^N; os K maiores genes escolhem os ativos e definem os pesos,
  reparados para os limites. Restrição setorial tratada por dominância restrita.
- **Saída**: fronteira de Pareto; recomendada = máximo STARR, conservadora = mínimo CVaR.
- **Comparação**: Markowitz (média-variância) resolvido pelo mesmo AG e mesmas restrições.

## Executar

```bash
# Docker (API + Redis)
docker compose up

# ou localmente
cd api && npm install && PORT=3000 npm run dev
cd frontend && pnpm install && VITE_API_URL=http://localhost:3000 pnpm dev
```

### Endpoints

```http
GET  /portfolio/universe
POST /portfolio/optimize
Content-Type: application/json

{ "trainStart": "2021-01-01", "trainEnd": "2024-12-31", "testEnd": "2025-12-31",
  "tickers": ["ITUB4", "TAEE11", "..."],
  "options": { "cardinality": 8, "maxWeight": 0.25, "maxSectorWeight": 0.4, "generations": 250, "seed": 42 } }
```

`tickers` e `options` são opcionais. Sem `testEnd`, só otimiza.

## Reproduzir o experimento do TCC

```bash
cd api && npm run experiment -- 30
```

Na primeira execução, os dados de 2016-12-01 a 2026-10-16 são baixados e congelados em `results/data/`.
As execuções seguintes leem desse snapshot, e a mesma semente sempre dá o mesmo resultado. Isso é necessário
porque o Yahoo devolve o preço ajustado com ruído numérico (~1e-6) a cada requisição. Para baixar os dados de
novo, apague `results/data/`.
