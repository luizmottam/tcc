# Migrações do Banco de Dados

Este diretório contém scripts de migração para atualizar o esquema do banco de dados.

## Migração: Adicionar Métricas ao Portfólio

### Arquivo: `add_portfolio_metrics.sql`

Adiciona os seguintes campos à tabela `portfolio`:
- `total_return`: Retorno total acumulado do portfólio (%)
- `total_risk`: Risco total (volatilidade) do portfólio (%)
- `total_cvar`: CVaR total do portfólio (%)

### Como Aplicar

#### Opção 1: Script Python (Recomendado)
```bash
cd backend
python migrations/apply_migration.py
```

#### Opção 2: SQL Direto (MySQL)
```bash
mysql -u seu_usuario -p nome_do_banco < migrations/add_portfolio_metrics.sql
```

#### Opção 3: SQL Direto (PostgreSQL)
```bash
psql -U seu_usuario -d nome_do_banco -f migrations/add_portfolio_metrics.sql
```

### Verificação

Após aplicar a migração, verifique se as colunas foram criadas:

**MySQL:**
```sql
DESCRIBE portfolio;
```

**PostgreSQL:**
```sql
\d portfolio
```

Você deve ver as colunas:
- `total_return`
- `total_risk`
- `total_cvar`

### Notas

- A migração é **idempotente**: pode ser executada múltiplas vezes sem problemas
- Se as colunas já existirem, o script Python irá ignorar o erro
- Os valores padrão são `NULL`, então portfólios existentes não serão afetados
- As métricas serão calculadas e salvas automaticamente na próxima vez que um portfólio for consultado

