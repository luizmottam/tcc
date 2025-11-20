from app.data.metrics import portfolio_return, portfolio_volatility, compute_cvar, log_returns
import numpy as np

def compare_weights(price_df, weights_opt, weights_base):
    lr = log_returns(price_df)
    daily_opt = lr.values @ np.array(list(weights_opt))
    daily_base = lr.values @ np.array(list(weights_base))
    retorno_opt = float(np.mean(daily_opt) * 252)
    retorno_base = float(np.mean(daily_base) * 252)
    vol_opt = float(np.std(daily_opt) * np.sqrt(252))
    vol_base = float(np.std(daily_base) * np.sqrt(252))
    cvar_opt = compute_cvar(daily_opt)
    cvar_base = compute_cvar(daily_base)
    ok = (retorno_opt > retorno_base) and (vol_opt < vol_base) and (cvar_opt < cvar_base)
    diagnosis = "AG funcionou" if ok else "A carteira otimizada não superou a carteira não otimizada."
    return {
        'retorno_opt': retorno_opt,
        'retorno_base': retorno_base,
        'vol_opt': vol_opt,
        'vol_base': vol_base,
        'cvar_opt': cvar_opt,
        'cvar_base': cvar_base,
        'ok': ok,
        'diagnosis': diagnosis
    }