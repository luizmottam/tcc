"""
validators.py — Funções de validação para o sistema de portfólios
Aplicação de boas práticas, comentários e alinhamento com regras Buy & Hold.
"""

from fastapi import HTTPException
import db
from typing import Dict


# ============================================================
# Validação do peso total do portfólio
# ============================================================
def validar_peso_total_portfolio(portfolio_id: int, novo_peso: float = 0) -> Dict:
    """
    Valida se a soma de pesos do portfólio não ultrapassa 100%.
    
    Args:
        portfolio_id: ID do portfólio
        novo_peso: Peso a ser adicionado ou alterado (decimal 0-1)
    
    Returns:
        dict com informações detalhadas:
        {
            "peso_total": float,
            "peso_total_pct": float,
            "peso_com_novo": float,
            "peso_com_novo_pct": float,
            "valido": bool,
            "excesso": float,
            "excesso_pct": float,
            "mensagem": str
        }
    """
    with db.get_connection(db.DB_NAME) as conn:
        with conn.cursor(dictionary=True) as cur:
            cur.execute(
                "SELECT COALESCE(SUM(peso), 0) AS peso_total FROM portfolio_ativos WHERE portfolio_id=%s",
                (portfolio_id,)
            )
            resultado = cur.fetchone()
            peso_total = float(resultado['peso_total']) if resultado else 0.0

            peso_com_novo = peso_total + novo_peso
            valido = peso_com_novo <= 1.0
            excesso = peso_com_novo - 1.0  # negativo se válido

            mensagem = f"Peso total: {peso_com_novo*100:.2f}% (OK)" if valido else \
                       f"Peso total excede 100%: {peso_com_novo*100:.2f}% (Excesso de {excesso*100:.2f}%)"

            return {
                "peso_total": peso_total,
                "peso_total_pct": peso_total * 100,
                "peso_com_novo": peso_com_novo,
                "peso_com_novo_pct": peso_com_novo * 100,
                "valido": valido,
                "excesso": excesso,
                "excesso_pct": excesso * 100,
                "mensagem": mensagem
            }


# ============================================================
# Validação antes de adicionar um ativo
# ============================================================
def validar_antes_de_adicionar_ativo(portfolio_id: int, novo_peso: float) -> Dict:
    """
    Valida se é possível adicionar um ativo com o peso especificado.
    Lança HTTPException se não for válido.
    """
    resultado = validar_peso_total_portfolio(portfolio_id, novo_peso)
    if not resultado["valido"]:
        raise HTTPException(
            status_code=400,
            detail=f"Não é possível adicionar ativo. {resultado['mensagem']}"
        )
    return resultado


# ============================================================
# Validação antes de atualizar peso de um ativo existente
# ============================================================
def validar_antes_de_atualizar_peso(portfolio_id: int, ativo_id: int, novo_peso: float) -> Dict:
    """
    Valida se é possível atualizar o peso de um ativo existente.
    Considera o peso anterior do ativo para não contar duas vezes.
    Lança HTTPException 404 se o ativo não existir no portfólio.
    """
    with db.get_connection(db.DB_NAME) as conn:
        with conn.cursor(dictionary=True) as cur:
            cur.execute(
                "SELECT peso FROM portfolio_ativos WHERE portfolio_id=%s AND ativo_id=%s",
                (portfolio_id, ativo_id)
            )
            resultado = cur.fetchone()
            if resultado is None:
                raise HTTPException(
                    status_code=404,
                    detail="Ativo não encontrado no portfólio"
                )

            peso_anterior = float(resultado['peso'])
            diferenca = novo_peso - peso_anterior

            # valida soma de pesos com a diferença
            return validar_antes_de_adicionar_ativo(portfolio_id, diferenca)


# ============================================================
# Verificar duplicidade de portfólio
# ============================================================
def alertar_portfolio_duplicado(user_id: int, titulo: str) -> bool:
    """
    Verifica se já existe portfólio com o mesmo título para o usuário.
    
    Args:
        user_id: ID do usuário
        titulo: Título do portfólio a validar
    
    Returns:
        bool: True se existe duplicado, False se é único
    """
    with db.get_connection(db.DB_NAME) as conn:
        with conn.cursor(dictionary=True) as cur:
            cur.execute(
                "SELECT COUNT(*) AS count FROM portfolios WHERE user_id=%s AND titulo=%s",
                (user_id, titulo)
            )
            resultado = cur.fetchone()
            return (resultado['count'] > 0) if resultado else False
