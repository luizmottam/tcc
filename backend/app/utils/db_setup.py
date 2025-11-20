"""
Utilitário para criar o banco de dados se não existir
"""
import pymysql
from ..config import settings
import re

def create_database_if_not_exists():
    """Cria o banco de dados se não existir"""
    # Extrair informações da URL de conexão
    # mysql+pymysql://user:password@host:port/database
    url = settings.DATABASE_URL
    
    # Parse da URL
    if url.startswith("mysql+pymysql://"):
        url = url.replace("mysql+pymysql://", "")
    elif url.startswith("mysql://"):
        url = url.replace("mysql://", "")
    
    # Separar credenciais e resto
    if "@" in url:
        auth, rest = url.split("@", 1)
        if ":" in auth:
            user, password = auth.split(":", 1)
        else:
            user = auth
            password = ""
    else:
        user = "root"
        password = ""
        rest = url
    
    # Separar host:port/database
    if "/" in rest:
        host_port, database = rest.rsplit("/", 1)
        # Remover query params se houver
        if "?" in database:
            database = database.split("?")[0]
    else:
        host_port = rest
        database = "portfolio_db"
    
    # Separar host e port
    if ":" in host_port:
        host, port = host_port.split(":", 1)
        port = int(port)
    else:
        host = host_port
        port = 3306
    
    try:
        # Conectar sem especificar database
        connection = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            charset='utf8mb4'
        )
        
        with connection.cursor() as cursor:
            # Criar database se não existir
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            connection.commit()
            print(f"✅ Banco de dados '{database}' criado ou já existe")
        
        connection.close()
        return True
    except Exception as e:
        print(f"❌ Erro ao criar banco de dados: {e}")
        print(f"   Tente criar manualmente: CREATE DATABASE {database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
        return False

