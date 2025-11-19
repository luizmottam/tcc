import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { Portfolio, Asset } from "@/types/portfolio";

import { AddAssetDialog } from "@/components/AddAssetDialog";
import { RiskContributionCard } from "@/components/RiskContributionCard";
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

// API base
const API_BASE = ((import.meta as any).env?.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

const PortfolioDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/portfolio/${id}`);
        if (!res.ok) {
          setPortfolio(null);
          return;
        }
        const data = await res.json();
        // O backend retorna diretamente um PortfolioOut: { id, name, createdAt, assets, totalReturn, totalRisk }
        const mapped: Portfolio = {
          id: String(data.id),
          name: data.name || "",
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
          assets: (data.assets || []).map((a: any) => ({
            id: String(a.id || ""),
            ticker: a.ticker || "",
            sector: a.sector || "",
            weight: Number(a.weight || 0),  // Já vem em percentual (0-100) do backend
            expectedReturn: Number(a.expectedReturn ?? 0),
            cvar: Number(a.cvar ?? 0),
            currentPrice: a.currentPrice ?? undefined,
          })),
          totalReturn: data.totalReturn ?? 0,
          totalRisk: data.totalRisk ?? 0,
        };
        setPortfolio(mapped);
      } catch (err) {
        console.error("Erro ao carregar portfólio:", err);
        setPortfolio(null);
      }
    };
    load();
  }, [id]);

  // helper to reload current portfolio from server
  const reloadPortfolio = async () => {
    if (!id) return;
    try {
      const res = await fetch(`${API_BASE}/portfolio/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      // O backend retorna diretamente um PortfolioOut: { id, name, createdAt, assets, totalReturn, totalRisk }
      const mapped: Portfolio = {
        id: String(data.id),
        name: data.name || "",
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        assets: (data.assets || []).map((a: any) => ({
          id: String(a.id || ""),
          ticker: a.ticker || "",
          sector: a.sector || "",
          weight: Number(a.weight || 0),
          expectedReturn: Number(a.expectedReturn ?? 0),
          cvar: Number(a.cvar ?? 0),
        })),
        totalReturn: data.totalReturn ?? 0,
        totalRisk: data.totalRisk ?? 0,
      };
      setPortfolio(mapped);
    } catch (err) {
      console.error("Erro ao recarregar portfólio:", err);
    }
  };

  if (!portfolio) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Portfólio não encontrado</p>
      </div>
    );
  }

  // Calcular peso total com arredondamento para evitar problemas de precisão
  const totalWeight = Math.round(portfolio.assets.reduce((sum, asset) => sum + asset.weight, 0) * 100) / 100;
  // Considerar completo se estiver entre 99.9% e 100.1% (tolerância para erros de ponto flutuante)
  const isComplete = totalWeight >= 99.9 && totalWeight <= 100.1;
  const isExceeding = totalWeight > 100.1;

  const handleAddAsset = (assetData: Omit<Asset, "id">) => {
    // Persist asset: create ativo then associate to portfolio
    (async () => {
      try {
        // 1) Verificar se o ativo já existe
        let ativoId: number | null = null;
        const ativosRes = await fetch(`${API_BASE}/ativos`);
        if (ativosRes.ok) {
          const ativos = await ativosRes.json();
          const existing = ativos.find((a: any) => a.ticker === assetData.ticker.toUpperCase());
          if (existing) {
            ativoId = existing.id;
          }
        }

        // 2) Se não existe, criar o ativo
        if (!ativoId) {
          const createRes = await fetch(`${API_BASE}/ativos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              ticker: assetData.ticker, 
              nome_empresa: assetData.ticker, 
              setor: assetData.sector,
              segmento: assetData.sector
            }),
          });
          if (!createRes.ok) throw new Error("Erro ao criar ativo");
          const createBody = await createRes.json();
          ativoId = createBody.ativo_id;
        }

        // 3) associar ao portfólio
        // O AddAssetDialog já passa o peso em decimal (0-1), então não precisa dividir por 100
        const paRes = await fetch(`${API_BASE}/portfolio/ativos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portfolio_id: Number(id), ativo_id: Number(ativoId), weight: Number(assetData.weight) * 100 }),
        });
        if (!paRes.ok) throw new Error("Erro ao associar ativo ao portfólio");

        // 4) recarregar portfólio
        await reloadPortfolio();
        toast.success("Ativo adicionado ao portfólio com sucesso!");
      } catch (err) {
        console.error(err);
        toast.error("Falha ao adicionar ativo");
      }
    })();
  };

  const handleEditAsset = (updatedAsset: Asset) => {
    // update peso in portfolio_ativos if asset exists in server
    (async () => {
      try {
        const ativoIdNum = Number(updatedAsset.id);
        if (!isNaN(ativoIdNum)) {
          // O updatedAsset.weight já vem em porcentagem (0-100) do Asset, mas o backend espera em decimal
          // Mas o AddAssetDialog passa em decimal, então precisamos converter
          // Se updatedAsset.weight está em porcentagem, dividimos por 100
          // Se está em decimal, multiplicamos por 100 para converter para porcentagem e depois dividimos
          // Vamos assumir que o AddAssetDialog passa em decimal (0-1)
          const weightInPercent = updatedAsset.weight > 1 ? updatedAsset.weight : updatedAsset.weight * 100;
          const res = await fetch(`${API_BASE}/portfolio/${id}/ativos/${ativoIdNum}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ weight: weightInPercent }),
          });
          if (!res.ok) throw new Error("Falha ao atualizar peso");
          await reloadPortfolio();
          toast.success("Ativo atualizado com sucesso!");
        } else {
          // fallback local update
          setPortfolio({
            ...portfolio,
            assets: portfolio.assets.map((asset) => (asset.id === updatedAsset.id ? updatedAsset : asset)),
          });
          toast.success("Ativo atualizado localmente");
        }
      } catch (err) {
        console.error(err);
        toast.error("Erro ao atualizar ativo");
      } finally {
        setEditingAsset(undefined);
      }
    })();
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
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/portfolio/${id}/ativos/${assetId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Falha ao remover ativo do servidor");
        await reloadPortfolio();
        toast.success("Ativo removido com sucesso!");
      } catch (err) {
        console.error(err);
        // fallback local
        setPortfolio({
          ...portfolio,
          assets: portfolio.assets.filter((asset) => asset.id !== assetId),
        });
        toast.error("Não foi possível remover no servidor, atualizado localmente");
      }
    })();
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
            <span className={`font-bold ${
              isComplete ? "text-success" : 
              isExceeding ? "text-destructive" : 
              "text-primary"
            }`}>
              {totalWeight.toFixed(2)}% / 100%
            </span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-primary/20">
            <div
              className={`h-full transition-all ${
                isExceeding ? "bg-destructive" :
                isComplete ? "bg-green-500" :
                totalWeight >= 80 ? "bg-yellow-500" :
                "bg-primary"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, totalWeight))}%` }}
            />
          </div>
          {isExceeding && (
            <p className="text-sm text-destructive mt-2 font-semibold">
              ⚠️ A distribuição excede 100% ({totalWeight.toFixed(2)}%). Ajuste os pesos dos ativos.
            </p>
          )}
          {!isComplete && !isExceeding && (
            <p className="text-sm text-muted-foreground mt-2">
              Faltam {Math.max(0, (100 - totalWeight)).toFixed(2)}% para completar o portfólio.
            </p>
          )}
          {isComplete && (
            <p className="text-sm text-success mt-2 font-semibold">
              ✓ Portfólio completo! Pronto para otimização.
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
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[15%]" />
                  <col className="w-[15%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-sm">Ticker</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Setor</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Preço</th>
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
                      <td className="py-3 px-4 align-middle">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary">
                              {asset.ticker.slice(0, 2)}
                            </span>
                          </div>
                          <span className="font-medium truncate">{asset.ticker}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground align-middle truncate">
                        {asset.sector || "-"}
                      </td>
                      <td className="py-3 px-4 text-right align-middle">
                        <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap">
                          {asset.currentPrice ? (
                            <>R$ {asset.currentPrice.toFixed(2)}</>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right align-middle">
                        <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap">
                          <Percent className="w-3 h-3 flex-shrink-0" />
                          {asset.weight.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right align-middle">
                        <span className="inline-flex items-center gap-1 text-success font-semibold whitespace-nowrap">
                          <ArrowUpRight className="w-3 h-3 flex-shrink-0" />
                          {asset.expectedReturn.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right align-middle">
                        <span className="inline-flex items-center gap-1 text-destructive font-semibold whitespace-nowrap">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          {asset.cvar.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center align-middle">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(asset)}
                            className="h-8 w-8 p-0"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAsset(asset.id)}
                            className="h-8 w-8 p-0"
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

        {/* Contribuição de Risco */}
        {portfolio.assets.length > 0 && (
          <RiskContributionCard portfolioId={id || ""} />
        )}

        {/* Action Buttons */}
        {portfolio.assets.length > 0 && (
          <div className="flex gap-4 animate-fade-in">
            <Button
              onClick={() => navigate(`/portfolio/${id}/analytics`)}
              size="lg"
              variant="outline"
              className="flex-1"
            >
              <BarChart3 className="w-5 h-5 mr-2" />
              Relatório Avançado
            </Button>
            <Button
              onClick={() => navigate(`/portfolio/${id}/optimization`)}
              size="lg"
              className="flex-1"
              disabled={!isComplete || isExceeding}
              title={!isComplete && !isExceeding ? "Complete o portfólio (100%) para otimizar" : isExceeding ? "Ajuste os pesos para não exceder 100%" : ""}
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
          currentPortfolioWeights={portfolio.assets.map((a) => a.weight / 100)}
        />
      </div>
    </div>
  );
};

export default PortfolioDetails;
