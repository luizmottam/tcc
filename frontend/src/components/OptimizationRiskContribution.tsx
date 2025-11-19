import { Card } from "@/components/ui/card";
import { AlertTriangle, Info } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from "recharts";

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef'];

interface OptimizationRiskContributionProps {
  riskContribution: any;
}

export const OptimizationRiskContribution = ({ riskContribution }: OptimizationRiskContributionProps) => {
  if (!riskContribution || !riskContribution.assets || riskContribution.assets.length === 0) {
    return null;
  }

  const chartData = riskContribution.assets
    .map((asset: any) => ({
      ticker: asset.ticker,
      contribution: asset.contribution_pct,
      weight: asset.weight,
      componentCvar: asset.component_cvar,
    }))
    .sort((a: any, b: any) => b.contribution - a.contribution);

  return (
    <Card className="p-6 mb-6 shadow-card animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-destructive" />
        <h3 className="text-xl font-bold">Contribuição de Risco por CVaR (Portfólio Otimizado)</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Mostra quanto cada ativo contribui para o risco total do portfólio otimizado (CVaR 95%).
        Ativos com contribuição alta em relação ao peso podem estar aumentando o risco desproporcionalmente.
      </p>

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
                }
                return value;
              }}
              labelFormatter={(label) => `Ativo: ${label}`}
            />
            <Legend />
            <Bar dataKey="contribution" name="Contribuição" fill="#ef4444">
              {chartData.map((entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-secondary rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-primary" />
          <h4 className="font-semibold text-sm">Como interpretar:</h4>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          <strong>Contribuição de Risco:</strong> Percentual do risco total do portfólio que cada ativo adiciona.
        </p>
        <p className="text-xs text-muted-foreground">
          <strong>Diferença entre Contribuição e Peso:</strong> Se um ativo tem peso de 20% mas contribuição de risco de 35%, 
          ele está aumentando o risco mais do que o esperado pelo seu peso. Isso pode ocorrer devido à alta volatilidade ou correlação com outros ativos.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 font-semibold">Ativo</th>
              <th className="text-right py-2 px-3 font-semibold">Peso</th>
              <th className="text-right py-2 px-3 font-semibold">Contribuição</th>
              <th className="text-right py-2 px-3 font-semibold">CVaR Ind.</th>
              <th className="text-left py-2 px-3 font-semibold">Análise</th>
            </tr>
          </thead>
          <tbody>
            {riskContribution.assets
              .sort((a: any, b: any) => b.contribution_pct - a.contribution_pct)
              .map((asset: any) => {
                const contributionVsWeight = asset.contribution_pct - asset.weight;
                const isHighContribution = contributionVsWeight > 5;
                return (
                  <tr key={asset.ticker} className="border-b border-border hover:bg-secondary/50">
                    <td className="py-2 px-3 font-medium">{asset.ticker}</td>
                    <td className="py-2 px-3 text-right">{asset.weight.toFixed(2)}%</td>
                    <td className={`py-2 px-3 text-right font-semibold ${isHighContribution ? 'text-destructive' : ''}`}>
                      {asset.contribution_pct.toFixed(2)}%
                      {isHighContribution && <span className="ml-1 text-xs">⚠</span>}
                    </td>
                    <td className="py-2 px-3 text-right">{asset.component_cvar.toFixed(2)}%</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">
                      {isHighContribution ? (
                        <span className="text-destructive">
                          ⚠ Contribuição {contributionVsWeight.toFixed(2)}% acima do peso
                        </span>
                      ) : (
                        <span className="text-success">✓ Proporcional ao peso</span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

