-- Migração: Adicionar campos de métricas ao portfólio
-- Data: 2025-01-XX
-- Descrição: Adiciona campos total_return, total_risk e total_cvar à tabela portfolio

-- Para MySQL
ALTER TABLE portfolio 
ADD COLUMN total_return FLOAT DEFAULT NULL COMMENT 'Retorno total acumulado do portfólio (%)',
ADD COLUMN total_risk FLOAT DEFAULT NULL COMMENT 'Risco total (volatilidade) do portfólio (%)',
ADD COLUMN total_cvar FLOAT DEFAULT NULL COMMENT 'CVaR total do portfólio (%)';

-- Para PostgreSQL (comentado, descomente se usar PostgreSQL)
-- ALTER TABLE portfolio 
-- ADD COLUMN total_return FLOAT DEFAULT NULL,
-- ADD COLUMN total_risk FLOAT DEFAULT NULL,
-- ADD COLUMN total_cvar FLOAT DEFAULT NULL;
-- COMMENT ON COLUMN portfolio.total_return IS 'Retorno total acumulado do portfólio (%)';
-- COMMENT ON COLUMN portfolio.total_risk IS 'Risco total (volatilidade) do portfólio (%)';
-- COMMENT ON COLUMN portfolio.total_cvar IS 'CVaR total do portfólio (%)';

-- Para SQLite (comentado, descomente se usar SQLite)
-- SQLite não suporta ALTER TABLE ADD COLUMN diretamente em algumas versões
-- Se necessário, recrie a tabela ou use uma ferramenta de migração
-- ALTER TABLE portfolio ADD COLUMN total_return REAL DEFAULT NULL;
-- ALTER TABLE portfolio ADD COLUMN total_risk REAL DEFAULT NULL;
-- ALTER TABLE portfolio ADD COLUMN total_cvar REAL DEFAULT NULL;

