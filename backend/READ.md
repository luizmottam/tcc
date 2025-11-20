# MVP Backend - Otimização de Portfólio (AG Multiobjetivo)

Arquivos gerados neste projeto (salvar cada seção como arquivo correspondente):
- app/main.py
- app/api/optimization_router.py
- app/api/fronteira_router.py
- app/api/comparacao_router.py
- app/api/selic_router.py
- app/core/config.py
- app/core/dates.py
- app/data/loader.py
- app/data/metrics.py
- app/data/split.py
- app/ga/genetic.py
- app/ga/evaluate.py
- app/ga/fronteira.py
- app/models/dto.py
- app/services/optimizer_service.py
- app/services/comparison_service.py
- app/services/selic_service.py
- requirements.txt

Descrição: backend mínimo em FastAPI que implementa coleta de preços (yfinance), cálculo de retornos log, volatilidade, CVaR, e um AG multiobjetivo (NSGA-II simplificado) para gerar fronteira e escolher carteira ótima.

Rodar (exemplo):
$ pip install -r requirements.txt
$ uvicorn app.main:app --reload --port 8000