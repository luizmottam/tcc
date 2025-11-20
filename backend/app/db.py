from sqlmodel import SQLModel, create_engine, Session
from .config import settings

# Configurações específicas por tipo de banco
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    # SQLite: não precisa de pool_pre_ping
    connect_args = {"check_same_thread": False}
    engine = create_engine(settings.DATABASE_URL, echo=False, connect_args=connect_args)
elif "mysql" in settings.DATABASE_URL.lower():
    # MySQL/pymysql: configurações importantes para charset e encoding
    # pymysql usa charset diretamente na URL ou como connect_arg
    connect_args = {
        "charset": "utf8mb4",
    }
    # Adiciona charset na URL se não estiver presente
    if "?" not in settings.DATABASE_URL:
        db_url = f"{settings.DATABASE_URL}?charset=utf8mb4"
    else:
        db_url = settings.DATABASE_URL
    engine = create_engine(
        db_url,
        echo=False,
        pool_pre_ping=True,  # Verifica conexões antes de usar (importante para MySQL)
        pool_recycle=3600,   # Recicla conexões após 1 hora (evita timeouts)
        connect_args=connect_args
    )
else:
    # PostgreSQL e outros
    engine = create_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)

def init_db():
    """Cria o banco de dados se não existir e depois cria as tabelas."""
    try:
        # Se for MySQL, tentar criar o banco se não existir
        if "mysql" in settings.DATABASE_URL.lower():
            try:
                from .utils.db_setup import create_database_if_not_exists
                create_database_if_not_exists()
            except Exception as e:
                print(f"[WARN] Não foi possível criar banco automaticamente: {e}")
        
        # Criar tabelas
        SQLModel.metadata.create_all(engine)
        print("[INFO] Banco de dados inicializado com sucesso!")
    except Exception as e:
        # Log do erro mas não impede o servidor de iniciar
        print(f"[WARN] Não foi possível inicializar o banco de dados: {e}")
        print(f"[INFO] O servidor iniciará, mas operações de banco podem falhar.")
        print(f"[INFO] Verifique se o MySQL está rodando e se as credenciais estão corretas no .env")

def get_session():
    with Session(engine) as session:
        yield session
