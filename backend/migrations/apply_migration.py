"""
Script para aplicar migração de métricas do portfólio
"""
import sys
from pathlib import Path

# Adicionar o diretório raiz ao path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.db import engine
from sqlmodel import text

def apply_migration():
    """Aplica a migração para adicionar campos de métricas"""
    migration_file = Path(__file__).parent / "add_portfolio_metrics.sql"
    
    if not migration_file.exists():
        print(f"❌ Arquivo de migração não encontrado: {migration_file}")
        return False
    
    # Ler o arquivo SQL
    with open(migration_file, 'r', encoding='utf-8') as f:
        sql_content = f.read()
    
    # Extrair apenas comandos ALTER TABLE (ignorar comentários)
    lines = sql_content.split('\n')
    alter_statements = []
    in_alter = False
    current_statement = []
    
    for line in lines:
        line = line.strip()
        # Ignorar linhas vazias e comentários
        if not line or line.startswith('--'):
            continue
        
        # Detectar início de ALTER TABLE
        if line.upper().startswith('ALTER TABLE'):
            in_alter = True
            current_statement = [line]
        elif in_alter:
            current_statement.append(line)
            # Detectar fim do statement (ponto e vírgula)
            if line.endswith(';'):
                alter_statements.append(' '.join(current_statement))
                in_alter = False
                current_statement = []
    
    if not alter_statements:
        print("❌ Nenhum comando ALTER TABLE encontrado no arquivo de migração")
        return False
    
    try:
        with engine.connect() as conn:
            # Executar cada statement
            for statement in alter_statements:
                print(f"Executando: {statement[:50]}...")
                try:
                    conn.execute(text(statement))
                    conn.commit()
                    print("✅ Comando executado com sucesso")
                except Exception as e:
                    # Se a coluna já existe, ignorar erro
                    if "Duplicate column name" in str(e) or "already exists" in str(e).lower():
                        print(f"⚠️  Coluna já existe, ignorando: {e}")
                    else:
                        print(f"❌ Erro ao executar comando: {e}")
                        return False
            
            print("\n✅ Migração aplicada com sucesso!")
            return True
    except Exception as e:
        print(f"❌ Erro ao aplicar migração: {e}")
        return False

if __name__ == "__main__":
    success = apply_migration()
    sys.exit(0 if success else 1)

