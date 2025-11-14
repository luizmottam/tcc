# db.py
"""
Módulo responsável por:
- Carregar credenciais do MySQL
- Criar conexão com o banco
- Criar banco + tabelas caso não existam

Pontos fortes corrigidos:
- Estrutura mais limpa
- Comentários concisos
- Inserção de usuário padrão protegida
- Melhoria no fluxo de conexão
"""

import os
import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv

# Carrega variáveis do .env
load_dotenv()

# Variáveis de ambiente com fallback
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "Jogadorn1")
DB_NAME = os.getenv("DB_NAME", "db")
DB_PORT = int(os.getenv("DB_PORT", "3306"))


def get_connection(db: str | None = None):
    """Cria e retorna uma conexão com o MySQL.
       Se 'db' for passado, conecta direto nele.
    """
    config = {
        "host": DB_HOST,
        "user": DB_USER,
        "password": DB_PASS,
        "port": DB_PORT,
        "autocommit": True
    }

    if db:
        config["database"] = db

    return mysql.connector.connect(**config)


def create_database_and_tables():
    """Cria o banco e todas as tabelas necessárias para o sistema."""

    # 1) Cria o banco se não existir
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        f"CREATE DATABASE IF NOT EXISTS {DB_NAME} "
        "DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    )
    cursor.close()
    conn.close()

    # 2) Conecta no banco criado
    conn = get_connection(DB_NAME)
    cursor = conn.cursor()

    # ---------------- USERS ----------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(100) UNIQUE,
            data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ---------------- ATIVOS ----------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ativos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ticker VARCHAR(10) UNIQUE NOT NULL,
            nome_empresa VARCHAR(100),
            setor VARCHAR(100),
            segmento VARCHAR(100)
        )
    """)

    # --------- HISTÓRICO DE ATIVOS ---------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS historico_ativos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ativo_id INT NOT NULL,
            data DATE NOT NULL,
            preco_abertura DECIMAL(16,6),
            preco_fechamento DECIMAL(16,6),
            preco_maximo DECIMAL(16,6),
            preco_minimo DECIMAL(16,6),
            FOREIGN KEY (ativo_id)
                REFERENCES ativos(id)
                ON DELETE CASCADE
        )
    """)

    # --------------- PORTFÓLIOS ---------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS portfolios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT DEFAULT 1,
            titulo VARCHAR(100) NOT NULL,
            descricao TEXT,
            data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_user_titulo (user_id, titulo),
            FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
        )
    """)

    # --------- PORTFÓLIO → ATIVOS ------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_ativos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            portfolio_id INT NOT NULL,
            ativo_id INT NOT NULL,
            peso DECIMAL(10,6) NOT NULL,
            data_adicionado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (portfolio_id)
                REFERENCES portfolios(id)
                ON DELETE CASCADE,
            FOREIGN KEY (ativo_id)
                REFERENCES ativos(id)
                ON DELETE CASCADE,
            UNIQUE KEY uk_portfolio_ativo (portfolio_id, ativo_id)
        )
    """)

    # ------------- RESULTADOS DO AG -------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS resultados_otimizacao (
            id INT AUTO_INCREMENT PRIMARY KEY,
            portfolio_id INT NOT NULL,
            retorno_esperado DECIMAL(16,6),
            risco_cvar DECIMAL(16,6),  -- CVaR já ajustado
            geracao INT,
            data_execucao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (portfolio_id)
                REFERENCES portfolios(id)
                ON DELETE CASCADE
        )
    """)

    # ---------- Usuário padrão ----------
    cursor.execute("""
        INSERT IGNORE INTO users (id, username, email)
        VALUES (1, 'default_user', 'default@example.com')
    """)

    cursor.close()
    conn.close()


if __name__ == "__main__":
    create_database_and_tables()
    print("Banco e tabelas criados/verificados.")
