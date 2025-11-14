# Arquitetura Melhorada - Portfólios de Investimento

## 📋 Resumo das Melhorias

### 1. **Banco de Dados Aprimorado**

#### Nova Tabela: `users`
```sql
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```
- Prepara o sistema para múltiplos usuários
- Cada usuário pode ter seus próprios portfólios

#### Tabela Modificada: `portfolios`
```sql
ALTER TABLE portfolios ADD COLUMN user_id INT DEFAULT 1;
ALTER TABLE portfolios ADD UNIQUE KEY uk_user_titulo (user_id, titulo);
```
- **Mudança**: Adicionada coluna `user_id` (FK para users)
- **Impacto**: Permite que o mesmo título seja usado por usuários diferentes
- **Validação**: Índice UNIQUE garante unicidade por usuário

#### Tabela Melhorada: `portfolio_ativos`
```sql
-- Adicionado coluna para auditoria
ALTER TABLE portfolio_ativos ADD COLUMN data_adicionado TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Adicionada constraint UNIQUE
ALTER TABLE portfolio_ativos ADD UNIQUE KEY uk_portfolio_ativo (portfolio_id, ativo_id);
```
- Cada ativo pode ser adicionado apenas uma vez por portfólio
- Auditoria de quando foi adicionado

---

## 🔒 Validações Implementadas

### Arquivo: `validators.py`

#### 1. `validar_peso_total_portfolio(portfolio_id, novo_peso=0)`
**Valida se a soma de pesos não ultrapassa 100%**

```python
# Exemplo de retorno:
{
    "peso_total": 0.50,           # 50% dos ativos atuais
    "peso_total_pct": 50.0,
    "peso_com_novo": 0.75,        # Com o novo ativo
    "peso_com_novo_pct": 75.0,
    "valido": True,
    "excesso": -0.25,             # Negativo = OK
    "excesso_pct": -25.0,
    "mensagem": "Peso total: 75.00% (OK)"
}
```

#### 2. `validar_antes_de_adicionar_ativo(portfolio_id, novo_peso)`
**Lança exceção (400) se exceder 100%**
- Valida antes de inserir novo ativo
- Retorna detalhes da validação se OK

#### 3. `validar_antes_de_atualizar_peso(portfolio_id, ativo_id, novo_peso)`
**Valida atualização considerando peso anterior**
- Desconta peso anterior do ativo
- Soma diferença ao peso total
- Evita double-counting

#### 4. `alertar_portfolio_duplicado(user_id, titulo)`
**Verifica se existe portfólio com mesmo nome**
- Retorna `True` se existe
- Frontend pode alertar usuário

---

## 🚀 Novos Endpoints

### 1. **GET `/portfolio/{portfolio_id}/peso-total`**
Retorna o peso total atual de um portfólio

**Response:**
```json
{
    "peso_total": 0.75,
    "peso_total_pct": 75.0,
    "peso_com_novo": 0.75,
    "peso_com_novo_pct": 75.0,
    "valido": true,
    "excesso": -0.25,
    "excesso_pct": -25.0,
    "mensagem": "Peso total: 75.00% (OK)"
}
```

**Uso no Frontend:**
```javascript
// Validar em tempo real enquanto o usuário digita
const checkWeight = async (portfolioId, newWeight) => {
    const res = await fetch(`${API_BASE}/portfolio/${portfolioId}/peso-total`);
    const data = await res.json();
    
    if (data.peso_com_novo_pct + (newWeight * 100) > 100) {
        // Mostrar erro
    }
}
```

---

## 📊 Fluxo de Validação

### Adicionando um Ativo:
```
1. Frontend: Usuário preenche formulário (ticker, setor, peso)
   ↓
2. Frontend: Chama GET /portfolio/{id}/peso-total (validação prévia)
   ↓
3. Frontend: Se OK, mostra aviso se passou 80% (warning)
   ↓
4. Backend: POST /portfolio/ativos
   - Valida novamente (defesa em profundidade)
   - Se válido: Insere e retorna validacao no response
   - Se inválido: Retorna 400 com mensagem
```

### Atualizando Peso:
```
1. Frontend: Usuário edita peso
   ↓
2. Frontend: Faz cálculo local (peso_anterior + novo - anterior)
   ↓
3. Frontend: Chama GET /portfolio/{id}/peso-total
   ↓
4. Backend: PUT /portfolio/ativos
   - Busca peso anterior do ativo
   - Calcula diferencial
   - Valida (soma deve ser <= 100%)
   - Se OK: Atualiza
   - Se inválido: Retorna 400
```

---

## 🎨 Integração com Frontend

### Componente `AddAssetDialog.tsx` (Melhorias)

```typescript
const [weightValidation, setWeightValidation] = useState<any>(null);
const [exceeds100, setExceeds100] = useState(false);

const handleWeightChange = async (newWeight: string) => {
    setFormData(prev => ({ ...prev, weight: newWeight }));
    
    // Validar em tempo real
    const res = await fetch(`${API_BASE}/portfolio/${portfolioId}/peso-total`);
    const data = await res.json();
    
    const totalWithNew = data.peso_com_novo_pct + (Number(newWeight) || 0);
    setExceeds100(totalWithNew > 100);
    
    // Mostrar aviso em amarelo se 80-100%
    if (totalWithNew >= 80 && totalWithNew <= 100) {
        // ⚠️ Warning: Você está próximo do limite
    }
};

// Desabilitar botão se exceder
const isSubmitDisabled = exceeds100 || !formData.weight;
```

### Página `PortfolioDetails.tsx` (Alertas)

```typescript
// Mostrar progress bar com cores:
// 0-50% = Verde
// 50-80% = Amarelo
// 80-100% = Laranja
// >100% = Vermelho + Mensagem de erro

const getProgressColor = (percentage: number) => {
    if (percentage > 100) return 'bg-red-500';
    if (percentage >= 80) return 'bg-orange-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
};
```

---

## 📝 Checklist de Implementação

Backend:
- ✅ Arquivo `validators.py` criado com 4 funções de validação
- ✅ `db.py` atualizado com tabela `users` e índice UNIQUE
- ✅ `main.py` importa validators
- ✅ POST `/portfolio/ativos` valida peso total
- ✅ PUT `/portfolio/ativos` valida peso com diferencial
- ✅ GET `/portfolio/{id}/peso-total` novo endpoint
- ✅ Tratamento de erros (409 para duplicado, 400 para excesso de peso)

Frontend (TODO):
- ⬜ Implementar validação em tempo real no `AddAssetDialog`
- ⬜ Mostrar cores de progresso em `PortfolioDetails`
- ⬜ Alertar quando duplicar nome de portfólio
- ⬜ Desabilitar botão "Salvar" quando peso > 100%
- ⬜ Mostrar mensagem "Faltam X% para completar"

---

## 🔄 Exemplos de Uso

### Exemplo 1: Adicionar ativo que excede 100%
```bash
# Backend valida:
POST /portfolio/ativos
{
  "portfolio_id": 1,
  "ativo_id": 5,
  "peso": 0.60  # 60%
}

# Peso atual: 0.50 (50%) + novo 0.60 (60%) = 1.10 (110%)
# Response 400:
{
  "detail": "Não é possível adicionar ativo. Peso total excede 100%: 110.00% (Excesso de 10.00%)"
}
```

### Exemplo 2: Peso total atual
```bash
GET /portfolio/1/peso-total

Response 200:
{
  "peso_total": 0.75,
  "peso_total_pct": 75.0,
  "peso_com_novo": 0.75,
  "peso_com_novo_pct": 75.0,
  "valido": true,
  "excesso": -0.25,
  "excesso_pct": -25.0,
  "mensagem": "Peso total: 75.00% (OK)"
}
```

### Exemplo 3: Portfólio duplicado
```bash
# Dois portfólios com o mesmo nome (mesmo usuário)
POST /portfolio
{
  "titulo": "Meu Portfólio"  # Frontend alerta: "Você já tem um portfólio com este nome"
}
```

---

## 🛡️ Defesa em Profundidade

1. **Frontend**: Validação visual e em tempo real
2. **Backend**: Validação antes de modificar banco
3. **Banco de Dados**: UNIQUE constraints para previnir duplicatas
4. **Response**: Retorna detalhes de validação para feedback ao usuário

---

## 📚 Próximos Passos

1. Atualizar o banco de dados (executar migrations)
2. Testar endpoints de validação
3. Implementar UI do frontend com alertas
4. Adicionar testes unitários para validators.py
5. Documentar API com Swagger/OpenAPI
