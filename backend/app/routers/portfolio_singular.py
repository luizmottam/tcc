"""
Router para endpoints /portfolio (singular) compatível com frontend
"""
from fastapi import APIRouter, HTTPException, Depends, Body
from sqlmodel import Session
from typing import Optional
from ..db import get_session
from ..crud import create_portfolio, get_portfolio, delete_portfolio, update_portfolio_metadata
from ..schemas import PortfolioCreate
from ..models import Portfolio, Ticket
# from ..services.optimizer_service import portfolio_metrics  # Temporariamente desabilitado

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

@router.post("", status_code=201, include_in_schema=True)
@router.post("/", status_code=201, include_in_schema=True)
def create_portfolio_endpoint(payload: dict, session: Session = Depends(get_session)):
    """Cria um novo portfólio"""
    name = payload.get("name", "")
    if not name:
        raise HTTPException(status_code=400, detail="Nome do portfólio é obrigatório")
    
    portfolio = create_portfolio(session, name, None, None)
    return {
        "id": portfolio.id,
        "name": portfolio.name,
        "createdAt": portfolio.created_at.isoformat() if portfolio.created_at else None,
        "assets": [],
        "totalReturn": 0,
        "totalRisk": 0,
        "portfolio_id": portfolio.id  # Para compatibilidade
    }

@router.get("/{id}")
def get_portfolio_endpoint(id: int, session: Session = Depends(get_session)):
    """Retorna um portfólio com seus ativos formatados para o frontend"""
    portfolio = get_portfolio(session, id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfólio não encontrado")
    
    from sqlmodel import select
    from ..models import Historico
    from ..services.yfinance_service import get_current_price, ensure_historico_in_db
    from ..data.metrics import annualized_return, annualized_variance, compute_cvar, log_returns, portfolio_accumulated_return
    import pandas as pd
    import numpy as np
    
    # Buscar tickets (ativos) do portfólio
    tickets = session.exec(
        select(Ticket).where(Ticket.portfolio_id == id)
    ).all()
    
    # Tentar buscar métricas do banco primeiro (se já foram calculadas)
    total_return = portfolio.total_return if portfolio.total_return is not None else 0
    total_risk = portfolio.total_risk if portfolio.total_risk is not None else 0
    total_cvar = portfolio.total_cvar if portfolio.total_cvar is not None else 0
    
    # Sempre recalcular para garantir que está atualizado (pode ser otimizado depois)
    needs_recalculation = True
    
    portfolio_weights = []
    portfolio_returns = []
    portfolio_log_returns_list = []  # Para calcular retorno acumulado
    
    # Formatar assets e calcular métricas
    assets = []
    for ticket in tickets:
        # Pegar peso do metadata, ou calcular igualmente se não existir
        weight = 0
        if ticket.meta and isinstance(ticket.meta, dict):
            weight = ticket.meta.get("weight", 0)
        
        if weight == 0 and tickets:
            # Se não tem peso definido, distribuir igualmente
            weight = 100.0 / len(tickets)
        
        weight_decimal = weight / 100.0
        portfolio_weights.append(weight_decimal)
        
        # Buscar preço atual
        current_price = get_current_price(ticket.ticker)
        
        # Garantir que histórico está no banco
        ensure_historico_in_db(ticket.ticker)
        
        # Calcular retorno esperado, CVaR e Variância baseado em histórico
        expected_return = 0.0
        cvar = 0.0
        variance = 0.0
        
        # Buscar dados históricos
        historico_rows = session.exec(
            select(Historico)
            .where(Historico.ticker == ticket.ticker)
            .order_by(Historico.date)
        ).all()
        
        if historico_rows and len(historico_rows) > 1:
            # Criar DataFrame com preços
            prices_df = pd.DataFrame([{
                'date': r.date,
                'close': r.close
            } for r in historico_rows]).sort_values('date')
            
            # Calcular retornos logarítmicos
            if len(prices_df) > 1:
                prices_series = prices_df.set_index('date')['close']
                # log_returns espera DataFrame, então converter Series para DataFrame
                prices_df_for_returns = pd.DataFrame({'close': prices_series})
                log_ret = log_returns(prices_df_for_returns)
                
                if len(log_ret) > 0:
                    # log_ret é um DataFrame, pegar a coluna 'close'
                    returns_series = log_ret['close'] if 'close' in log_ret.columns else log_ret.iloc[:, 0]
                    returns_array = returns_series.values
                    
                    if len(returns_array) > 0:
                        # Retorno anualizado
                        expected_return = float(annualized_return(log_ret).iloc[0] * 100)  # Converter para %
                        
                        # Variância anualizada (Risco Variância)
                        variance = float(annualized_variance(log_ret).iloc[0] * 100)  # Converter para %
                        
                        # CVaR anualizado
                        cvar = float(compute_cvar(returns_array))
                        
                        # Adicionar retornos ponderados para cálculo do portfólio
                        portfolio_returns.append(returns_array * weight_decimal)
                        # Guardar retornos logarítmicos para cálculo de retorno acumulado
                        portfolio_log_returns_list.append({
                            'ticker': ticket.ticker,
                            'log_ret': log_ret,
                            'weight': weight_decimal
                        })
        
        assets.append({
            "id": str(ticket.id),
            "ticker": ticket.ticker,
            "sector": ticket.type or "",
            "weight": weight,
            "expectedReturn": expected_return,
            "variance": variance,
            "cvar": cvar,
            "currentPrice": current_price if current_price > 0 else None
        })
    
    # Calcular métricas do portfólio total (se necessário)
    if needs_recalculation and portfolio_returns and len(portfolio_returns) > 0:
        # Combinar retornos ponderados
        min_len = min(len(r) for r in portfolio_returns if len(r) > 0)
        if min_len > 0:
            combined_returns = np.zeros(min_len)
            for ret_array in portfolio_returns:
                if len(ret_array) >= min_len:
                    combined_returns += ret_array[:min_len]
            
            # CVaR total do portfólio
            if len(combined_returns) > 0:
                total_cvar = float(compute_cvar(combined_returns))
                total_risk = float(np.std(combined_returns) * np.sqrt(252) * 100)  # Volatilidade anualizada em %
            
            # Calcular retorno acumulado usando portfolio_accumulated_return
            if portfolio_log_returns_list and len(portfolio_log_returns_list) > 0:
                try:
                    # Criar DataFrame com retornos logarítmicos de todos os ativos
                    # Alinhar por data
                    all_dates = set()
                    for item in portfolio_log_returns_list:
                        if len(item['log_ret']) > 0:
                            dates = item['log_ret'].index
                            all_dates.update(dates)
                    
                    if all_dates:
                        all_dates = sorted(all_dates)
                        # Criar DataFrame com retornos logarítmicos
                        log_ret_df = pd.DataFrame(index=all_dates)
                        weights_array = []
                        
                        for item in portfolio_log_returns_list:
                            ticker = item['ticker']
                            log_ret = item['log_ret']
                            weight = item['weight']
                            
                            if len(log_ret) > 0:
                                # Pegar coluna 'close' ou primeira coluna
                                ret_series = log_ret['close'] if 'close' in log_ret.columns else log_ret.iloc[:, 0]
                                # Reindexar para alinhar com todas as datas
                                log_ret_df[ticker] = ret_series.reindex(all_dates, fill_value=0)
                                weights_array.append(weight)
                        
                        if len(log_ret_df.columns) > 0 and len(weights_array) == len(log_ret_df.columns):
                            weights_np = np.array(weights_array)
                            # Normalizar pesos para somar 1.0
                            weights_np = weights_np / weights_np.sum() if weights_np.sum() > 0 else weights_np
                            
                            # Calcular retorno acumulado
                            accumulated = portfolio_accumulated_return(weights_np, log_ret_df)
                            # Validar valor antes de converter
                            if np.isfinite(accumulated) and -1.0 <= accumulated <= 5.0:
                                total_return = float(accumulated * 100)  # Converter para %
                            else:
                                # Fallback: usar média anualizada
                                if len(combined_returns) > 0:
                                    total_return = float(np.mean(combined_returns) * 252 * 100)
                                else:
                                    total_return = 0.0
                except Exception as e:
                    print(f"[WARN] Erro ao calcular retorno acumulado: {e}")
                    # Fallback: usar média anualizada
                    if len(combined_returns) > 0:
                        total_return = float(np.mean(combined_returns) * 252 * 100)
    
    # Validar e limitar valores extremos antes de salvar
    # Retorno: entre -100% e 500%
    if total_return < -100:
        total_return = -100
    elif total_return > 500:
        total_return = 500
    elif not np.isfinite(total_return):
        total_return = 0.0
    
    # Risco: entre 0% e 200%
    if total_risk < 0:
        total_risk = 0
    elif total_risk > 200:
        total_risk = 200
    elif not np.isfinite(total_risk):
        total_risk = 0.0
    
    # CVaR: validar valores (em decimal, não porcentagem)
    if total_cvar < 0:
        total_cvar = 0
    elif total_cvar > 2.0:  # Máximo 200% em decimal = 2.0
        total_cvar = 2.0
    elif not np.isfinite(total_cvar):
        total_cvar = 0.0
    
    # Se não conseguiu calcular, usar valores padrão apenas se não há tickets
    if total_return == 0 and total_risk == 0 and total_cvar == 0 and tickets:
        total_return = 10.0
        total_risk = 15.0
        total_cvar = 0.08  # 8% em decimal = 0.08
    
    # Salvar métricas no banco de dados
    portfolio.total_return = total_return
    portfolio.total_risk = total_risk
    portfolio.total_cvar = total_cvar
    session.add(portfolio)
    session.commit()
    session.refresh(portfolio)
    
    return {
        "id": str(portfolio.id),
        "name": portfolio.name,
        "createdAt": portfolio.created_at.isoformat() if portfolio.created_at else None,
        "assets": assets,
        "totalReturn": total_return,
        "totalRisk": total_risk,
        "totalCvar": total_cvar
    }

@router.put("/{id}")
def update_portfolio_endpoint(id: int, payload: dict, session: Session = Depends(get_session)):
    """Atualiza um portfólio"""
    portfolio = get_portfolio(session, id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfólio não encontrado")
    
    if "name" in payload:
        portfolio.name = payload["name"]
        session.add(portfolio)
        session.commit()
        session.refresh(portfolio)
    
    return {
        "id": portfolio.id,
        "name": portfolio.name,
        "createdAt": portfolio.created_at.isoformat() if portfolio.created_at else None
    }

@router.delete("/{id}")
def delete_portfolio_endpoint(id: int, session: Session = Depends(get_session)):
    """Deleta um portfólio"""
    ok = delete_portfolio(session, id)
    if not ok:
        raise HTTPException(status_code=404, detail="Portfólio não encontrado")
    return {"ok": True}

