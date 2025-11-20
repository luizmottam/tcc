"""
Script para verificar e corrigir tickets órfãos no banco de dados
"""
import sys
from sqlmodel import Session, select
from app.db import engine
from app.models import Ticket, Portfolio

def check_orphan_tickets():
    """Verifica tickets sem portfolio_id válido"""
    with Session(engine) as session:
        # Buscar todos os tickets
        all_tickets = session.exec(select(Ticket)).all()
        
        orphan_tickets = []
        for ticket in all_tickets:
            # Verificar se portfolio existe
            portfolio = session.get(Portfolio, ticket.portfolio_id)
            if not portfolio:
                orphan_tickets.append(ticket)
                print(f"⚠️  Ticket {ticket.id} (ticker: {ticket.ticker}) tem portfolio_id={ticket.portfolio_id} mas o portfólio não existe")
        
        if orphan_tickets:
            print(f"\n❌ Encontrados {len(orphan_tickets)} tickets órfãos")
            response = input("Deseja deletar esses tickets? (s/n): ")
            if response.lower() == 's':
                for ticket in orphan_tickets:
                    session.delete(ticket)
                    print(f"  ✅ Deletado ticket {ticket.id}")
                session.commit()
                print(f"\n✅ {len(orphan_tickets)} tickets órfãos deletados")
            else:
                print("Operação cancelada")
        else:
            print("✅ Nenhum ticket órfão encontrado")
        
        # Verificar tickets com portfolio_id None (não deveria existir)
        tickets_with_none = session.exec(
            select(Ticket).where(Ticket.portfolio_id.is_(None))
        ).all()
        
        if tickets_with_none:
            print(f"\n❌ Encontrados {len(tickets_with_none)} tickets com portfolio_id=None")
            for ticket in tickets_with_none:
                print(f"  ⚠️  Ticket {ticket.id} (ticker: {ticket.ticker}) tem portfolio_id=None")
            response = input("Deseja deletar esses tickets? (s/n): ")
            if response.lower() == 's':
                for ticket in tickets_with_none:
                    session.delete(ticket)
                    print(f"  ✅ Deletado ticket {ticket.id}")
                session.commit()
                print(f"\n✅ {len(tickets_with_none)} tickets com portfolio_id=None deletados")
        else:
            print("✅ Nenhum ticket com portfolio_id=None encontrado")

if __name__ == "__main__":
    try:
        check_orphan_tickets()
    except Exception as e:
        print(f"❌ Erro: {e}")
        sys.exit(1)

