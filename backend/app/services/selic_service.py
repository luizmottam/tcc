def get_selic_series(start, end):
    # placeholder: retornar lista zeros do mesmo comprimento
    import pandas as pd
    idx = pd.date_range(start=start, end=end, freq='B')
    return [0.0] * len(idx)