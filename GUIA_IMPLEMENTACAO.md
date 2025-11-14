# 📚 Guia de Implementação - Arquitetura Melhorada

## ✅ Checklist de Implementação

### Backend ✅ COMPLETO

- [x] **db.py**
  - [x] Tabela `users` criada
  - [x] Coluna `user_id` adicionada em `portfolios`
  - [x] Índice UNIQUE (user_id, titulo) criado
  - [x] Coluna `data_adicionado` em `portfolio_ativos`
  - [x] Índice UNIQUE (portfolio_id, ativo_id)

- [x] **validators.py** (NOVO)
  - [x] `validar_peso_total_portfolio()` - calcula peso total
  - [x] `validar_antes_de_adicionar_ativo()` - valida novo ativo
  - [x] `validar_antes_de_atualizar_peso()` - valida atualização
  - [x] `alertar_portfolio_duplicado()` - detecta duplicatas

- [x] **main.py**
  - [x] Importa validators
  - [x] POST `/portfolio/ativos` com validação
  - [x] PUT `/portfolio/ativos` com validação
  - [x] GET `/portfolio/{id}/peso-total` novo endpoint
  - [x] Melhor tratamento de erros (409, 400)

- [x] **migration_v2.sql** (NOVO)
  - [x] Script para atualizar banco existente
  - [x] Preserva dados existentes
  - [x] Adiciona novas colunas e constraints

### Frontend ⏳ TODO

- [ ] **AddAssetDialog.tsx**
  - [ ] Adicionar estado para `weightValidation`
  - [ ] Função `handleWeightChange()` que valida em tempo real
  - [ ] Desabilitar botão "Salvar" se peso > 100%
  - [ ] Mostrar aviso "Você está usando X% do portfólio"
  - [ ] Exibir mensagem de erro se exceder

- [ ] **PortfolioDetails.tsx**
  - [ ] Mudar cor da progress bar conforme peso:
    - Verde: 0-50%
    - Amarelo: 50-80%
    - Laranja: 80-100%
    - Vermelho: >100%
  - [ ] Carregar `peso-total` ao abrir página
  - [ ] Atualizar progress bar após adicionar/remover ativo

- [ ] **CreatePortfolioDialog.tsx**
  - [ ] Verificar se portfólio com mesmo nome já existe
  - [ ] Mostrar alerta: "⚠️  Você já tem um portfólio chamado 'X'"
  - [ ] Permitir criar mesmo assim (apenas alerta)

---

## 🚀 Passo a Passo: Executar Agora

### 1. Atualizar Banco de Dados

```bash
# Terminal: Conectar ao MySQL
mysql -u root -p

# Dentro do MySQL:
use investimentos_local;
source /caminho/para/backend/migration_v2.sql;

# Verificar mudanças
SHOW TABLES;
DESCRIBE portfolios;
DESCRIBE portfolio_ativos;
DESCRIBE users;
```

### 2. Testar Backend (sem frontend)

```bash
# Terminal 1: Iniciar servidor
cd backend
python -m uvicorn main:app --reload

# Terminal 2: Fazer requisições de teste
# Teste 1: Peso total atual
curl http://localhost:8000/portfolio/1/peso-total

# Teste 2: Tentar adicionar ativo que excede 100%
curl -X POST http://localhost:8000/portfolio/ativos \
  -H "Content-Type: application/json" \
  -d '{
    "portfolio_id": 1,
    "ativo_id": 2,
    "peso": 1.5
  }'

# Resposta esperada (400):
# {
#   "detail": "Não é possível adicionar ativo. Peso total excede 100%: 150.00% (Excesso de 50.00%)"
# }

# Teste 3: Adicionar ativo válido
curl -X POST http://localhost:8000/portfolio/ativos \
  -H "Content-Type: application/json" \
  -d '{
    "portfolio_id": 1,
    "ativo_id": 2,
    "peso": 0.30
  }'

# Resposta esperada (201):
# {
#   "msg": "Ativo adicionado ao portfólio",
#   "validacao": {
#     "peso_total": 0.30,
#     "peso_total_pct": 30.0,
#     "peso_com_novo": 0.30,
#     "peso_com_novo_pct": 30.0,
#     "valido": true,
#     "excesso": -0.70,
#     "excesso_pct": -70.0,
#     "mensagem": "Peso total: 30.00% (OK)"
#   }
# }
```

### 3. Implementar Frontend (AddAssetDialog.tsx)

```typescript
import { useState, useEffect } from "react";
import { API_BASE } from "@/config"; // ou import.meta.env.VITE_API_URL

export const AddAssetDialog = ({ ... }) => {
  const [formData, setFormData] = useState({...});
  const [weightValidation, setWeightValidation] = useState<any>(null);
  const [isExceeding, setIsExceeding] = useState(false);

  // ✨ NOVO: Validar peso em tempo real
  const handleWeightChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newWeight = Number(e.target.value);
    setFormData(prev => ({ ...prev, weight: e.target.value }));
    
    try {
      // Chamar backend para validar
      const res = await fetch(`${API_BASE}/portfolio/${portfolioId}/peso-total`);
      if (!res.ok) return;
      
      const validation = await res.json();
      const totalWithNew = validation.peso_total_pct + newWeight;
      
      setWeightValidation({
        current: validation.peso_total_pct,
        withNew: totalWithNew,
        message: validation.mensagem,
        isValid: totalWithNew <= 100,
        isWarning: totalWithNew >= 80 && totalWithNew <= 100
      });
      
      setIsExceeding(totalWithNew > 100);
    } catch (err) {
      console.error("Erro ao validar peso:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* ... */}
        
        <div className="grid gap-4 py-4">
          {/* Peso input com validação */}
          <div className="grid gap-2">
            <Label htmlFor="weight">Peso (%)</Label>
            <Input
              id="weight"
              type="number"
              min="0"
              max="100"
              value={formData.weight}
              onChange={handleWeightChange}
              // Destaque em vermelho se exceder
              className={isExceeding ? "border-red-500 bg-red-50" : ""}
            />
            
            {/* Mostrar validação em tempo real */}
            {weightValidation && (
              <div className={`text-sm p-2 rounded ${
                weightValidation.isValid 
                  ? "bg-green-50 text-green-700"
                  : weightValidation.isWarning
                  ? "bg-yellow-50 text-yellow-700"
                  : "bg-red-50 text-red-700"
              }`}>
                {weightValidation.isValid && "✅"} 
                {weightValidation.isWarning && "⚠️"} 
                {isExceeding && "❌"} 
                {" "}
                Total: {weightValidation.withNew.toFixed(1)}% 
                {isExceeding && ` (Excede em ${(weightValidation.withNew - 100).toFixed(1)}%)`}
              </div>
            )}
          </div>
          
          {/* ... outros campos ... */}
        </div>
        
        <DialogFooter>
          <Button 
            onClick={handleSubmit}
            disabled={isExceeding || !formData.weight}
            // Desabilitar se exceder 100%
          >
            {isExceeding ? "❌ Peso Inválido" : "✅ Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

### 4. Implementar Frontend (PortfolioDetails.tsx)

```typescript
// Em PortfolioDetails.tsx

const [portfolioWeight, setPortfolioWeight] = useState(0);

// Carregar peso total ao abrir
useEffect(() => {
  loadPortfolioWeight();
}, [id]);

const loadPortfolioWeight = async () => {
  if (!id) return;
  try {
    const res = await fetch(`${API_BASE}/portfolio/${id}/peso-total`);
    const data = await res.json();
    setPortfolioWeight(data.peso_total_pct);
  } catch (err) {
    console.error(err);
  }
};

// Atualizar após adicionar/remover ativo
const reloadPortfolio = async () => {
  // ... código existente ...
  await loadPortfolioWeight(); // Adicionar isto
};

// Função para cor da progress bar
const getProgressColor = (percentage: number): string => {
  if (percentage > 100) return "bg-red-500";
  if (percentage >= 80) return "bg-orange-500";
  if (percentage >= 50) return "bg-yellow-500";
  return "bg-green-500";
};

// Renderizar com nova cor
<Card className="p-6 mb-6">
  <div className="flex items-center justify-between mb-2">
    <h3 className="font-semibold">Distribuição Total</h3>
    <span className={`font-bold ${
      portfolioWeight > 100 
        ? "text-red-600" 
        : portfolioWeight >= 80 
        ? "text-orange-600"
        : "text-green-600"
    }`}>
      {portfolioWeight.toFixed(1)}% / 100%
    </span>
  </div>
  
  {/* Progress bar com cor dinâmica */}
  <div className={`h-3 rounded-full ${getProgressColor(portfolioWeight)}`} 
       style={{ width: `${Math.min(portfolioWeight, 100)}%` }} />
  
  {/* Mensagens contextuais */}
  {portfolioWeight > 100 && (
    <p className="text-sm text-red-600 mt-2">
      ❌ A distribuição excede 100%! Remova {(portfolioWeight - 100).toFixed(1)}%
    </p>
  )}
  {portfolioWeight >= 80 && portfolioWeight <= 100 && (
    <p className="text-sm text-orange-600 mt-2">
      ⚠️  Faltam {(100 - portfolioWeight).toFixed(1)}% para completar
    </p>
  )}
  {portfolioWeight < 80 && (
    <p className="text-sm text-green-600 mt-2">
      ✅ Você pode adicionar mais ativos
    </p>
  )}
</Card>
```

### 5. Testar Integração (Frontend + Backend)

1. Abrir aplicação no navegador
2. Ir para um portfólio existente
3. Clicar "Adicionar Ativo"
4. Preencher ticker e setor
5. **Digitar peso:**
   - Verde: 0-50%
   - Amarelo: 50-80%
   - Laranja: 80-100%
   - Vermelho: >100%
6. Se exceder, botão fica desabilitado
7. Salvar e verificar se atualiza progress bar

---

## 🐛 Troubleshooting

### Erro: "Tabela 'users' não existe"
```bash
# Solução: Executar migration
mysql -u root -p investimentos_local < backend/migration_v2.sql
```

### Erro 409: "Este ativo já foi adicionado ao portfólio"
```
✅ Comportamento esperado - cada ativo aparece 1x por portfólio
Solução: Editar peso do ativo em vez de adicionar novamente
```

### Erro 400: "Peso total excede 100%"
```
✅ Comportamento esperado - backend não deixa exceder
Solução: Remover outros ativos ou reduzir peso deste
```

### Frontend não mostra cor correta
```
Verificar:
1. Browser console para errors
2. Endpoint /portfolio/{id}/peso-total retorna dados?
3. CSS classes (Tailwind) estão carregando?
```

---

## 📖 Referência Rápida

### Endpoints Principais

| Método | Endpoint | O que faz |
|--------|----------|----------|
| GET | `/portfolio/{id}/peso-total` | Retorna peso total |
| POST | `/portfolio/ativos` | Adiciona ativo com validação |
| PUT | `/portfolio/ativos` | Atualiza peso com validação |
| GET | `/portfolio/{id}` | Detalhes do portfólio |

### Estados de Peso

| Range | Cor | Ação |
|-------|-----|------|
| 0-50% | 🟢 Verde | Pode adicionar |
| 50-80% | 🟡 Amarelo | Aviso: próximo do limite |
| 80-100% | 🟠 Laranja | Aviso: faltam X% |
| >100% | 🔴 Vermelho | ❌ Bloqueado - remova pesos |

### Validações

**Frontend:**
- Número entre 0-100
- Desabilita se >100%
- Mostra cores em tempo real

**Backend:**
- Valida soma total
- Retorna 400 se exceder
- Retorna detalhes de validação

---

## ✨ Próximos Passos (Futuros)

1. **Autenticação**: Associar usuários reais em vez de user_id=1
2. **Historico**: Manter log de alterações (quem mudou, quando)
3. **Previsões**: Calcular retorno/risco total
4. **Exportar**: Gerar relatórios em PDF
5. **Mobile**: Responsive design melhorado

---

## 📞 Suporte

Se tiver dúvidas sobre a implementação:

1. Verificar `ARQUITETURA_MELHORADA.md` para conceitos
2. Verificar `RESUMO_MELHORIAS.md` para visão geral
3. Verificar `validators.py` para funções específicas
4. Testar com `curl` no terminal

---

**Documento criado em:** 2025-11-13
**Versão da Arquitetura:** 2.0
