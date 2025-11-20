from datetime import datetime
from app.core.dates import get_train_period, get_projection_period

def split_train_projection(price_df, reference_date: datetime = None):
    start_train, end_train = get_train_period(reference_date)
    start_proj, end_proj = get_projection_period(reference_date)
    train_df = price_df.loc[(price_df.index >= start_train) & (price_df.index <= end_train)].copy()
    proj_df = price_df.loc[(price_df.index >= start_proj) & (price_df.index <= end_proj)].copy()
    return train_df, proj_df