from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "mysql+pymysql://root:Jogadorn1@localhost:3306/portfolio_db"
    YFINANCE_DAYS_FALLBACK: int = 3650
    CRON_DAILY: str = "0 2 * * *"
    OPTIMIZER_REFERENCE_DOC: str = "/mnt/data/Backend.docx"  # path que você subiu
    OPTIMIZER_TIMEOUT_SEC: int = 30

    class Config:
        env_file = ".env"

settings = Settings()
