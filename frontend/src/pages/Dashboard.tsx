import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Portfolio } from "@/types/portfolio";
import { PortfolioCard } from "@/components/PortfolioCard";
import { CreatePortfolioDialog } from "@/components/CreatePortfolioDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, TrendingUp } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { toast } from "sonner";

// API base
const API_BASE = ((import.meta as any).env?.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

const Dashboard = () => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [comparisonData, setComparisonData] = useState<Array<{ date: string; portfolios: number; ibovespa: number }>>([]);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const navigate = useNavigate();

  /** Carrega portfólios do backend e mapeia para o frontend */
  const loadPortfolios = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/portfolios`);
      if (!res.ok) throw new Error("Falha ao carregar portfólios");

      const data = await res.json();

      const mapped: Portfolio[] = data.map((p: any) => ({
        id: String(p.id),
        name: p.name || p.titulo || "",
        createdAt: p.createdAt ? new Date(p.createdAt) : (p.data_criacao ? new Date(p.data_criacao) : new Date()),
        assets: (p.assets || []).map((a: any) => ({
          id: String(a.id || a.ativo_id),
          ticker: a.ticker,
          sector: a.sector || a.setor || "",
          weight: Number(a.weight ?? a.peso ?? 0),
          expectedReturn: a.expectedReturn ?? 0,
          cvar: a.cvar ?? 0,
        })),
        totalReturn: p.totalReturn ?? 0,
        totalRisk: p.totalRisk ?? 0,
      }));

      setPortfolios(mapped);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar portfólios");
    }
  }, []);

  useEffect(() => {
    loadPortfolios();
  }, [loadPortfolios]);

  /** Carrega dados de comparação Portfólio vs Ibovespa */
  const loadComparisonData = useCallback(async () => {
    if (portfolios.length === 0) {
      setComparisonData([]);
      return;
    }
    
    setLoadingComparison(true);
    try {
      const res = await fetch(`${API_BASE}/dashboard/comparison`);
      if (!res.ok) throw new Error("Falha ao carregar dados de comparação");
      
      const data = await res.json();
      
      // Formatar dados para o gráfico
      const formatted = data.dates.map((date: string, index: number) => ({
        date: new Date(date).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' }),
        portfolios: Number(data.portfolios[index] || 0),
        ibovespa: Number(data.ibovespa[index] || 0),
      }));
      
      setComparisonData(formatted);
    } catch (err) {
      console.error("Erro ao carregar dados de comparação:", err);
      setComparisonData([]);
    } finally {
      setLoadingComparison(false);
    }
  }, [portfolios.length]);

  useEffect(() => {
    loadComparisonData();
  }, [loadComparisonData]);

  /** Criar ou editar portfólio */
  const handleCreatePortfolio = async (name: string) => {
    if (editingPortfolio) {
      try {
        const res = await fetch(`${API_BASE}/portfolio/${editingPortfolio.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name,
          }),
        });
        if (!res.ok) throw new Error("Erro ao atualizar portfólio");

        setPortfolios((prev) =>
          prev.map((p) => (p.id === editingPortfolio.id ? { ...p, name } : p))
        );
        toast.success("Portfólio atualizado com sucesso!");
      } catch (err) {
        console.error(err);
        toast.error("Falha ao atualizar portfólio");
      } finally {
        setEditingPortfolio(null);
      }
    } else {
      try {
        const res = await fetch(`${API_BASE}/portfolio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name }),
        });
        if (!res.ok) throw new Error("Erro ao criar portfólio");

        const body = await res.json();
        const newPortfolio: Portfolio = {
          id: String(body.portfolio_id || Date.now()),
          name,
          createdAt: new Date(),
          assets: [],
          totalReturn: 0,
          totalRisk: 0,
        };
        setPortfolios((prev) => [newPortfolio, ...prev]);
        toast.success("Portfólio criado com sucesso!");
      } catch (err) {
        console.error(err);
        toast.error("Não foi possível criar o portfólio");
      }
    }
    setIsCreateDialogOpen(false);
  };

  /** Navegar para detalhes do portfólio */
  const handleViewDetails = (id: string) => {
    navigate(`/portfolio/${id}`);
  };

  /** Editar portfólio */
  const handleEditPortfolio = (id: string) => {
    const portfolio = portfolios.find((p) => p.id === id);
    if (portfolio) {
      setEditingPortfolio(portfolio);
      setIsCreateDialogOpen(true);
    }
  };

  /** Deletar portfólio */
  const handleDeletePortfolio = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/portfolio/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao deletar no servidor");

      setPortfolios((prev) => prev.filter((p) => p.id !== id));
      toast.success("Portfólio deletado com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível deletar o portfólio");
    }
  };

  /** Fechar diálogo de criação/edição */
  const handleDialogClose = (open: boolean) => {
    setIsCreateDialogOpen(open);
    if (!open) setEditingPortfolio(null);
  };

  // Retorno médio e risco médio
  const averageReturn =
    portfolios.length > 0
      ? portfolios.reduce((sum, p) => sum + (p.totalReturn ?? 0), 0) / portfolios.length
      : 0;

  const averageRisk =
    portfolios.length > 0
      ? portfolios.reduce((sum, p) => sum + (p.totalRisk ?? 0), 0) / portfolios.length
      : 0;

  return (
    <div className="min-h-screen gradient-subtle">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-primary rounded-xl shadow-elegant">
              <TrendingUp className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Meus Portfólios</h1>
              <p className="text-muted-foreground">
                Gerencie e otimize seus investimentos com Algoritmo Genético
              </p>
            </div>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-card p-6 rounded-xl shadow-card border border-border animate-fade-in">
            <p className="text-sm text-muted-foreground mb-1">Total de Portfólios</p>
            <p className="text-3xl font-bold text-foreground">{portfolios.length}</p>
          </div>
          <div className="bg-card p-6 rounded-xl shadow-card border border-border animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <p className="text-sm text-muted-foreground mb-1">Retorno Médio</p>
            <p className="text-3xl font-bold text-success">{averageReturn.toFixed(2)}%</p>
          </div>
          <div className="bg-card p-6 rounded-xl shadow-card border border-border animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <p className="text-sm text-muted-foreground mb-1">Risco Médio (CVaR)</p>
            <p className="text-3xl font-bold text-foreground">{averageRisk.toFixed(2)}%</p>
          </div>
        </div>

        {/* Gráfico de Comparação Portfólio vs Ibovespa */}
        {comparisonData.length > 0 && (
          <Card className="p-6 mb-8 shadow-card animate-fade-in">
            <div className="mb-4">
              <h2 className="text-xl font-bold mb-2">Comparação de Performance</h2>
              <p className="text-sm text-muted-foreground">
                Retorno acumulado dos portfólios vs Ibovespa (últimos 12 meses)
              </p>
            </div>
            {loadingComparison ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={comparisonData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    stroke="hsl(var(--muted-foreground))"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis 
                    label={{ value: 'Retorno Acumulado (%)', angle: -90, position: 'insideLeft' }}
                    tick={{ fontSize: 12 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: any) => `${Number(value).toFixed(2)}%`}
                    labelFormatter={(label) => `Data: ${label}`}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="portfolios" 
                    name="Portfólios (Média)" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="ibovespa" 
                    name="Ibovespa" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        )}

        {/* Grid de Portfólios */}
        {portfolios.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-xl shadow-card border border-border">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Nenhum portfólio criado</h3>
              <p className="text-muted-foreground mb-6">
                Comece criando seu primeiro portfólio de investimentos
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)} size="lg">
                <Plus className="w-5 h-5 mr-2" />
                Criar Primeiro Portfólio
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {portfolios.map((portfolio) => (
              <PortfolioCard
                key={portfolio.id}
                portfolio={portfolio}
                onViewDetails={handleViewDetails}
                onEdit={handleEditPortfolio}
                onDelete={handleDeletePortfolio}
                cvarThreshold={10} // alerta CVaR acima de 10%
              />
            ))}
          </div>
        )}

        {/* Floating Action Button */}
        {portfolios.length > 0 && (
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            size="lg"
            className="fixed bottom-8 right-8 rounded-full w-14 h-14 shadow-elegant"
          >
            <Plus className="w-6 h-6" />
          </Button>
        )}

        {/* Dialogo Create/Edit */}
        <CreatePortfolioDialog
          open={isCreateDialogOpen}
          onOpenChange={handleDialogClose}
          onCreatePortfolio={handleCreatePortfolio}
          portfolio={editingPortfolio}
        />
      </div>
    </div>
  );
};

export default Dashboard;