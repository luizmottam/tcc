"""
Script para testar a integração completa do backend
"""
import requests
import json
from datetime import datetime

API_BASE = "http://localhost:8000"

def test_endpoint(method, endpoint, data=None, expected_status=200):
    """Testa um endpoint"""
    url = f"{API_BASE}{endpoint}"
    print(f"\n🔍 Testando {method} {endpoint}")
    
    try:
        if method == "GET":
            response = requests.get(url)
        elif method == "POST":
            response = requests.post(url, json=data)
        elif method == "PUT":
            response = requests.put(url, json=data)
        elif method == "DELETE":
            response = requests.delete(url)
        else:
            print(f"❌ Método {method} não suportado")
            return False
        
        if response.status_code == expected_status:
            print(f"✅ Status {response.status_code} - OK")
            if response.content:
                try:
                    result = response.json()
                    print(f"   Resposta: {json.dumps(result, indent=2, ensure_ascii=False)[:200]}...")
                except:
                    print(f"   Resposta: {response.text[:200]}...")
            return True
        else:
            print(f"❌ Status {response.status_code} (esperado {expected_status})")
            print(f"   Erro: {response.text[:200]}")
            return False
    except requests.exceptions.ConnectionError:
        print(f"❌ Erro de conexão - Servidor não está rodando em {API_BASE}")
        return False
    except Exception as e:
        print(f"❌ Erro: {e}")
        return False

def main():
    print("=" * 60)
    print("TESTE DE INTEGRAÇÃO - BACKEND")
    print("=" * 60)
    
    # Verificar se servidor está rodando
    print("\n1. Verificando se servidor está rodando...")
    try:
        response = requests.get(f"{API_BASE}/docs")
        if response.status_code == 200:
            print("✅ Servidor está rodando")
        else:
            print("⚠️ Servidor respondeu mas com status inesperado")
    except:
        print("❌ Servidor não está rodando. Inicie com: python -m app.main")
        return
    
    results = []
    
    # Teste 1: Criar portfólio
    print("\n" + "=" * 60)
    print("TESTE 1: Criar Portfólio")
    print("=" * 60)
    portfolio_data = {"name": f"Portfólio Teste {datetime.now().strftime('%H%M%S')}"}
    result1 = test_endpoint("POST", "/portfolio", portfolio_data, 201)
    results.append(("Criar Portfólio", result1))
    
    if result1:
        # Pegar ID do portfólio criado
        try:
            response = requests.post(f"{API_BASE}/portfolio", json=portfolio_data)
            portfolio_id = response.json().get("id") or response.json().get("portfolio_id")
            if portfolio_id:
                portfolio_id = int(portfolio_id)
            else:
                # Tentar listar e pegar o último
                response = requests.get(f"{API_BASE}/portfolios")
                portfolios = response.json()
                if portfolios:
                    portfolio_id = portfolios[-1].get("id")
        except:
            portfolio_id = 1  # Fallback
    else:
        portfolio_id = 1  # Usar ID padrão para continuar testes
    
    # Teste 2: Listar portfólios
    print("\n" + "=" * 60)
    print("TESTE 2: Listar Portfólios")
    print("=" * 60)
    result2 = test_endpoint("GET", "/portfolios", expected_status=200)
    results.append(("Listar Portfólios", result2))
    
    # Teste 3: Obter portfólio específico
    print("\n" + "=" * 60)
    print(f"TESTE 3: Obter Portfólio {portfolio_id}")
    print("=" * 60)
    result3 = test_endpoint("GET", f"/portfolio/{portfolio_id}", expected_status=200)
    results.append(("Obter Portfólio", result3))
    
    # Teste 4: Listar ativos
    print("\n" + "=" * 60)
    print("TESTE 4: Listar Ativos")
    print("=" * 60)
    result4 = test_endpoint("GET", "/ativos", expected_status=200)
    results.append(("Listar Ativos", result4))
    
    # Teste 5: Criar ativo
    print("\n" + "=" * 60)
    print("TESTE 5: Criar Ativo")
    print("=" * 60)
    ativo_data = {"ticker": "PETR4", "nome_empresa": "Petrobras", "setor": "Energia"}
    result5 = test_endpoint("POST", "/ativos", ativo_data, 201)
    results.append(("Criar Ativo", result5))
    
    # Teste 6: Adicionar ativo ao portfólio
    print("\n" + "=" * 60)
    print(f"TESTE 6: Adicionar Ativo ao Portfólio {portfolio_id}")
    print("=" * 60)
    add_ativo_data = {
        "portfolio_id": portfolio_id,
        "ativo_id": 0,  # Será criado
        "ticker": "PETR4",
        "sector": "Energia",
        "weight": 25.0
    }
    result6 = test_endpoint("POST", "/portfolio/ativos", add_ativo_data, 201)
    results.append(("Adicionar Ativo ao Portfólio", result6))
    
    # Teste 7: Dashboard comparison
    print("\n" + "=" * 60)
    print("TESTE 7: Dashboard Comparison")
    print("=" * 60)
    result7 = test_endpoint("GET", "/dashboard/comparison", expected_status=200)
    results.append(("Dashboard Comparison", result7))
    
    # Teste 8: Analytics
    print("\n" + "=" * 60)
    print(f"TESTE 8: Analytics do Portfólio {portfolio_id}")
    print("=" * 60)
    result8 = test_endpoint("GET", f"/portfolio/{portfolio_id}/analytics", expected_status=200)
    results.append(("Analytics", result8))
    
    # Teste 9: Risk Contribution
    print("\n" + "=" * 60)
    print(f"TESTE 9: Risk Contribution do Portfólio {portfolio_id}")
    print("=" * 60)
    result9 = test_endpoint("GET", f"/portfolio/{portfolio_id}/risk-contribution", expected_status=200)
    results.append(("Risk Contribution", result9))
    
    # Teste 10: Otimização
    print("\n" + "=" * 60)
    print(f"TESTE 10: Otimização do Portfólio {portfolio_id}")
    print("=" * 60)
    otimizar_data = {
        "portfolio_id": portfolio_id,
        "populacao": 50,
        "geracoes": 30,
        "job_id": f"test_{datetime.now().timestamp()}"
    }
    result10 = test_endpoint("POST", "/otimizar", otimizar_data, 200)
    results.append(("Otimização", result10))
    
    # Resumo
    print("\n" + "=" * 60)
    print("RESUMO DOS TESTES")
    print("=" * 60)
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASSOU" if result else "❌ FALHOU"
        print(f"{status} - {name}")
    
    print(f"\n📊 Resultado: {passed}/{total} testes passaram")
    
    if passed == total:
        print("🎉 Todos os testes passaram! Integração completa funcionando!")
    else:
        print("⚠️ Alguns testes falharam. Verifique os erros acima.")

if __name__ == "__main__":
    try:
        import requests
    except ImportError:
        print("❌ Biblioteca 'requests' não instalada. Instale com: pip install requests")
        exit(1)
    
    main()

