import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Portfolio } from "@/types/portfolio";
import { mockPortfolios } from "@/data/mockData";
import { PortfolioCard } from "@/components/PortfolioCard";
import { CreatePortfolioDialog } from "@/components/CreatePortfolioDialog";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp } from "lucide-react";
import { toast } from "sonner";

const Dashboard = () => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>(mockPortfolios);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const navigate = useNavigate();

  const handleCreatePortfolio = (name: string) => {
    if (editingPortfolio) {
      // Edit existing portfolio
      setPortfolios(
        portfolios.map((p) =>
          p.id === editingPortfolio.id ? { ...p, name } : p
        )
      );
      toast.success("Portfólio atualizado com sucesso!");
      setEditingPortfolio(null);
    } else {
      // Create new portfolio
      const newPortfolio: Portfolio = {
        id: Date.now().toString(),
        name,
        createdAt: new Date(),
        assets: [],
      };
      setPortfolios([...portfolios, newPortfolio]);
      toast.success("Portfólio criado com sucesso!");
    }
  };

  const handleViewDetails = (id: string) => {
    navigate(`/portfolio/${id}`);
  };

  const handleEditPortfolio = (id: string) => {
    const portfolio = portfolios.find((p) => p.id === id);
    if (portfolio) {
      setEditingPortfolio(portfolio);
      setIsCreateDialogOpen(true);
    }
  };

  const handleDeletePortfolio = (id: string) => {
    setPortfolios(portfolios.filter((p) => p.id !== id));
    toast.success("Portfólio deletado com sucesso!");
  };

  const handleDialogClose = (open: boolean) => {
    setIsCreateDialogOpen(open);
    if (!open) {
      setEditingPortfolio(null);
    }
  };

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

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-card p-6 rounded-xl shadow-card border border-border animate-fade-in">
            <p className="text-sm text-muted-foreground mb-1">Total de Portfólios</p>
            <p className="text-3xl font-bold text-foreground">{portfolios.length}</p>
          </div>
          <div className="bg-card p-6 rounded-xl shadow-card border border-border animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <p className="text-sm text-muted-foreground mb-1">Retorno Médio</p>
            <p className="text-3xl font-bold text-success">
              {portfolios.length > 0
                ? (
                    portfolios.reduce((acc, p) => acc + (p.totalReturn || 0), 0) /
                    portfolios.length
                  ).toFixed(2)
                : "0.00"}
              %
            </p>
          </div>
          <div className="bg-card p-6 rounded-xl shadow-card border border-border animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <p className="text-sm text-muted-foreground mb-1">Risco Médio (CVaR)</p>
            <p className="text-3xl font-bold text-foreground">
              {portfolios.length > 0
                ? (
                    portfolios.reduce((acc, p) => acc + (p.totalRisk || 0), 0) /
                    portfolios.length
                  ).toFixed(2)
                : "0.00"}
              %
            </p>
          </div>
        </div>

        {/* Portfolios Grid */}
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

        {/* Create/Edit Dialog */}
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
