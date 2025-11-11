import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Portfolio, Asset } from "@/types/portfolio";
import { mockPortfolios } from "@/data/mockData";
import { AddAssetDialog } from "@/components/AddAssetDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Plus,
  TrendingUp,
  BarChart3,
  Zap,
  Building2,
  Percent,
  ArrowUpRight,
  AlertTriangle,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const PortfolioDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | undefined>(undefined);

  useEffect(() => {
    const found = mockPortfolios.find((p) => p.id === id);
    if (found) {
      setPortfolio(found);
    }
  }, [id]);

  if (!portfolio) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Portfólio não encontrado</p>
      </div>
    );
  }

  const totalWeight = portfolio.assets.reduce((sum, asset) => sum + asset.weight, 0);
  const isComplete = totalWeight === 100;

  const handleAddAsset = (assetData: Omit<Asset, "id">) => {
    const newAsset: Asset = {
      id: Date.now().toString(),
      ...assetData,
    };
    setPortfolio({
      ...portfolio,
      assets: [...portfolio.assets, newAsset],
    });
    toast.success("Ativo adicionado com sucesso!");
  };

  const handleEditAsset = (updatedAsset: Asset) => {
    setPortfolio({
      ...portfolio,
      assets: portfolio.assets.map((asset) =>
        asset.id === updatedAsset.id ? updatedAsset : asset
      ),
    });
    setEditingAsset(undefined);
    toast.success("Ativo atualizado com sucesso!");
  };

  const openEditDialog = (asset: Asset) => {
    setEditingAsset(asset);
    setIsAddAssetOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setIsAddAssetOpen(open);
    if (!open) {
      setEditingAsset(undefined);
    }
  };

  const handleDeleteAsset = (assetId: string) => {
    setPortfolio({
      ...portfolio,
      assets: portfolio.assets.filter((asset) => asset.id !== assetId),
    });
    toast.success("Ativo removido com sucesso!");
  };

  return (
    <div className="min-h-screen gradient-subtle">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary rounded-xl shadow-elegant">
                <TrendingUp className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">{portfolio.name}</h1>
                <p className="text-muted-foreground">Gerencie os ativos do seu portfólio</p>
              </div>
            </div>
          </div>
        </div>

        {/* Weight Progress */}
        <Card className="p-6 mb-6 shadow-card animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Distribuição Total</h3>
            <span className={`font-bold ${isComplete ? "text-success" : "text-primary"}`}>
              {totalWeight}% / 100%
            </span>
          </div>
          <Progress value={totalWeight} className="h-3" />
          {!isComplete && (
            <p className="text-sm text-muted-foreground mt-2">
              {totalWeight > 100
                ? "⚠️ A distribuição excede 100%. Ajuste os pesos dos ativos."
                : `Faltam ${100 - totalWeight}% para completar o portfólio.`}
            </p>
          )}
        </Card>

        {/* Assets Table */}
        <Card className="p-6 mb-6 shadow-card animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Ativos do Portfólio</h2>
            <Button onClick={() => setIsAddAssetOpen(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Ativo
            </Button>
          </div>

          {portfolio.assets.length === 0 ? (
            <div className="text-center py-12 bg-secondary rounded-lg">
              <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum ativo adicionado ainda</p>
              <Button
                onClick={() => setIsAddAssetOpen(true)}
                variant="outline"
                className="mt-4"
              >
                Adicionar Primeiro Ativo
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-sm">Ticker</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Setor</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Peso</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Retorno</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">CVaR</th>
                    <th className="text-center py-3 px-4 font-semibold text-sm">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.assets.map((asset) => (
                    <tr
                      key={asset.id}
                      className="border-b border-border hover:bg-secondary transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">
                              {asset.ticker.slice(0, 2)}
                            </span>
                          </div>
                          <span className="font-medium">{asset.ticker}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{asset.sector}</td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <Percent className="w-3 h-3" />
                          {asset.weight}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-success font-semibold">
                          <ArrowUpRight className="w-3 h-3" />
                          {asset.expectedReturn}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-destructive font-semibold">
                          <AlertTriangle className="w-3 h-3" />
                          {asset.cvar}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(asset)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAsset(asset.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Action Buttons */}
        {portfolio.assets.length > 0 && (
          <div className="flex gap-4 animate-fade-in">
            <Button
              onClick={() => navigate(`/portfolio/${id}/analysis`)}
              size="lg"
              variant="outline"
              className="flex-1"
            >
              <BarChart3 className="w-5 h-5 mr-2" />
              Gerar Análise
            </Button>
            <Button
              onClick={() => navigate(`/portfolio/${id}/optimization`)}
              size="lg"
              className="flex-1"
              disabled={!isComplete}
            >
              <Zap className="w-5 h-5 mr-2" />
              Otimizar Portfólio
            </Button>
          </div>
        )}

        {/* Add/Edit Asset Dialog */}
        <AddAssetDialog
          open={isAddAssetOpen}
          onOpenChange={handleDialogClose}
          onAddAsset={handleAddAsset}
          asset={editingAsset}
          onEditAsset={handleEditAsset}
        />
      </div>
    </div>
  );
};

export default PortfolioDetails;
