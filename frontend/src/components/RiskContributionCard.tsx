import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Info, ChevronDown, ChevronUp } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from "recharts";
import { toast } from "sonner";

const API_BASE = ((import.meta as any).env?.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

interface RiskContributionCardProps {
  portfolioId: string;
}

interface RiskContributionAsset {
  ticker: string;
  weight: number;
  contribution_pct: number;
  marginal_contribution: number;
  component_cvar: number;
  explanation: string;
}

interface RiskContributionData {
  portfolio_id: number;
  portfolio_name: string;
  assets: RiskContributionAsset[];
  portfolio_cvar: number;
  total_contribution: number;
}

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef'];

export const RiskContributionCard = ({ portfolioId }: RiskContributionCardProps) => {
  const [data, setData] = useState<RiskContributionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadRiskContribution = async () => {
    if (!portfolioId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/portfolio/${portfolioId}/risk-contribution`);
      if (!res.ok) {
        throw new Error("Falha ao carregar contribuição de risco");
      }
      const riskData = await res.json();
      setData(riskData);
    } catch (err) {
      console.error("Erro ao carregar contribuição de risco:", err);
      toast.error("Não foi possível carregar a contribuição de risco");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRiskContribution();
  }, [portfolioId]);

  if (loading) {
    return (
      <Card className="p-6 mb-6 shadow-card">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Card>
    );
  }

  if (!data || !data.assets || data.assets.length === 0) {
    return null;
  }

  const chartData = data.assets
    .map((asset) => ({
      ticker: asset.ticker,
      contribution: asset.contribution_pct,
      weight: asset.weight,
      componentCvar: asset.component_cvar,
    }))
    .sort((a, b) => b.contribution - a.contribution);

  return (
    <Card className="p-6 mb-6 shadow-card animate-fade-in">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h3 className="text-xl font-bold">Contribuição de Risco por CVaR</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            Mostra quanto cada ativo contribui para o risco total do portfólio (CVaR 95%)
          </p>
          <p className="text-xs text-muted-foreground">
            CVaR do Portfólio: <span className="font-semibold">{data.portfolio_cvar.toFixed(2)}%</span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="gap-2"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {expanded ? "Recolher" : "Expandir"}
        </Button>
      </div>

      <div className="mb-4">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="ticker"
              angle={-45}
              textAnchor="end"
              height={80}
              tick={{ fontSize: 12 }}
              stroke="hsl(var(--muted-foreground))"
            />
            <YAxis
              label={{ value: 'Contribuição (%)', angle: -90, position: 'insideLeft' }}
              tick={{ fontSize: 12 }}
              stroke="hsl(var(--muted-foreground))"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
              formatter={(value: any, name: string, props: any) => {
                if (name === "Contribuição") {
                  return [`${Number(value).toFixed(2)}%`, "Contribuição de Risco"];
                } else if (name === "Peso") {
                  return [`${Number(value).toFixed(2)}%`, "Peso no Portfólio"];
                } else if (name === "CVaR Individual") {
                  return [`${Number(value).toFixed(2)}%`, "CVaR Individual"];
                }
                return value;
              }}
              labelFormatter={(label) => `Ativo: ${label}`}
            />
            <Legend />
            <Bar dataKey="contribution" name="Contribuição" fill="#ef4444">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {expanded && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-primary" />
            <h4 className="font-semibold">Como interpretar:</h4>
          </div>
          <div className="bg-secondary rounded-lg p-4 mb-4 text-sm space-y-2">
            <p>
              <strong>Contribuição de Risco:</strong> Percentual do risco total do portfólio que cada ativo adiciona.
              Quanto maior, mais esse ativo aumenta o risco geral.
            </p>
            <p>
              <strong>CVaR Individual:</strong> O Conditional Value at Risk (95%) do ativo isoladamente.
            </p>
            <p>
              <strong>Diferença entre Contribuição e Peso:</strong> Um ativo pode ter peso pequeno mas alta contribuição de risco
              devido à sua correlação com outros ativos ou alta volatilidade individual.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-sm font-semibold">Ativo</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold">Peso</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold">Contribuição</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold">CVaR Ind.</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold">Explicação</th>
                </tr>
              </thead>
              <tbody>
                {data.assets
                  .sort((a, b) => b.contribution_pct - a.contribution_pct)
                  .map((asset) => {
                    const contributionVsWeight = asset.contribution_pct - asset.weight;
                    const isHighContribution = contributionVsWeight > 5; // Mais de 5% acima do peso
                    return (
                      <tr key={asset.ticker} className="border-b border-border hover:bg-secondary/50">
                        <td className="py-2 px-3 font-medium">{asset.ticker}</td>
                        <td className="py-2 px-3 text-right">{asset.weight.toFixed(2)}%</td>
                        <td className={`py-2 px-3 text-right font-semibold ${isHighContribution ? 'text-destructive' : ''}`}>
                          {asset.contribution_pct.toFixed(2)}%
                          {isHighContribution && (
                            <span className="ml-1 text-xs">⚠</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">{asset.component_cvar.toFixed(2)}%</td>
                        <td className="py-2 px-3 text-sm text-muted-foreground">
                          {asset.explanation}
                          {isHighContribution && (
                            <span className="block text-xs text-destructive mt-1">
                              ⚠ Contribuição de risco {contributionVsWeight.toFixed(2)}% acima do peso
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
};

