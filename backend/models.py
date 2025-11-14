"""
Modelos Pydantic usados na API.
- Evitar dados inválidos
- Garantir coerência com Buy and Hold e AG (Markowitz + CVaR)
- Eliminar nomes com acento (populacao)
- Acrescentar parâmetros usados pelo GA revisado
- Padronizar tipos (date ao invés de string)
- Comentários e boas práticas
"""

from pydantic import BaseModel, Field, confloat, condecimal
from typing import Optional, List
from datetime import date


# =========================================================
# ATIVOS
# =========================================================

class AtivoCreate(BaseModel):
    """Modelo para cadastro de ativos estáticos (Buy and Hold)."""
    ticker: str = Field(..., max_length=10, description="Código do ativo ex: PETR4")
    nome_empresa: Optional[str] = Field(None, description="Nome da empresa emissora")
    setor: Optional[str] = Field(None, description="Setor econômico (ex: Energia)")
    segmento: Optional[str] = Field(None, description="Segmento dentro do setor")


# =========================================================
# HISTÓRICO DE PREÇOS
# =========================================================

class HistoricoAtivoCreate(BaseModel):
    """Registro de histórico diario de preços do ativo."""
    ativo_id: int
    data: date  # usa validação automática do Pydantic
    preco_fechamento: condecimal(gt=0)  # fechamento nunca é <= 0
    preco_abertura: Optional[condecimal(gt=0)] = None
    preco_maximo: Optional[condecimal(gt=0)] = None
    preco_minimo: Optional[condecimal(gt=0)] = None


# =========================================================
# PORTFÓLIOS
# =========================================================

class PortfolioCreate(BaseModel):
    """Criação de um novo portfólio."""
    titulo: str = Field(..., max_length=100)
    descricao: Optional[str] = None


class PortfolioAtivoCreate(BaseModel):
    """Associação entre portfólio e ativo, com peso."""
    portfolio_id: int
    ativo_id: int
    peso: confloat(gt=0.0, le=1.0)  # Buy and Hold → peso precisa ser > 0


# =========================================================
# OTIMIZAÇÃO – parâmetros da API
# =========================================================

class OtimizacaoRequest(BaseModel):
    """
    Parâmetros de execução do GA.
    Ajustado para refletir:
    - Markowitz (var_peso)
    - CVaR anual bootstrap (use_annual_cvar_bootstrap / bootstrap_sims)
    """
    portfolio_id: int

    populacao: Optional[int] = Field(
        100, alias="populacao",
        description="Tamanho da população inicial do GA"
    )

    geracoes: Optional[int] = Field(
        50, alias="geracoes",
        description="Número de gerações"
    )

    risco_peso: Optional[float] = Field(
        1.0, alias="risco_peso",
        description="Peso do CVaR na função objetivo"
    )

    var_peso: Optional[float] = Field(
        0.0, alias="var_peso",
        description="Peso da variância (Markowitz) na função objetivo"
    )

    cvar_alpha: Optional[float] = Field(
        0.95, alias="cvar_alpha",
        description="Nível de confiança do CVaR"
    )

    use_annual_cvar_bootstrap: Optional[bool] = Field(
        True, alias="use_annual_cvar_bootstrap",
        description="Usa bootstrap anual para CVaR (mais preciso)"
    )

    bootstrap_sims: Optional[int] = Field(
        2000, alias="bootstrap_sims",
        description="Número de simulações para o CVaR anual"
    )

    seed: Optional[int] = None


# =========================================================
# RESULTADOS
# =========================================================

class ResultadoSolucao(BaseModel):
    """Resultado individual de uma solução do GA."""
    tickers: List[str] = Field(..., description="Ativos na mesma ordem dos pesos")
    pesos_pct: List[float] = Field(..., description="Pesos da carteira em %")
    retorno_esperado_pct: float = Field(..., description="Retorno anual esperado (%)")
    risco_cvar_pct: float = Field(..., description="CVaR anual (%)")
    variancia_anual: float = Field(..., description="Variância anualizada")
