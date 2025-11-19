import { Card } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

interface BacktestComparisonCardProps {
  backtestResults: any;
  backtestSeries: any;
}

export const BacktestComparisonCard = ({ backtestResults, backtestSeries }: BacktestComparisonCardProps) => {
  if (!backtestResults || !backtestSeries) {
    return null;
  }

  const original = backtestResults.original || {};
  const optimized = backtestResults.optimized || {};
  const improvement = backtestResults.improvement || {};

  // Preparar dados para o gráfico
  const chartData = backtestSeries.dates.map((date: string, index: number) => ({
    date: new Date(date).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' }),
    original: backtestSeries.original[index]?.cumulative_return || 0,
    optimized: backtestSeries.optimized[index]?.cumulative_return || 0,
  }));

  return (
    <Card className="p-6 mb-6 shadow-card animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h3 className="text-xl font-bold">Performance Real (Backtesting - Últimos 4 Meses)</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Comparação do desempenho real caso você tivesse aplicado a otimização há {backtestResults.test_period_months || 4} meses.
        Baseado em dados históricos reais dos últimos {backtestResults.test_period_months || 4} meses ({backtestResults.period_days || 0} dias úteis).
      </p>

      {/* Cards de Comparação */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Portfólio Original */}
        <Card className="p-4 border-2">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm text-muted-foreground">Sem Otimização</h4>
            <TrendingDown className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm">Retorno Anualizado</span>
              <span className={`font-bold text-lg ${original.return_pct >= 0 ? 'text-success' : 'text-destructive'}`}>
                {original.return_pct?.toFixed(2) || '0.00'}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Retorno Acumulado (6 meses)</span>
              <span className={`font-semibold ${original.cumulative_return_pct >= 0 ? 'text-success' : 'text-destructive'}`}>
                {original.cumulative_return_pct?.toFixed(2) || '0.00'}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">CVaR (95%)</span>
              <span className="font-semibold text-foreground">
                {original.cvar_pct?.toFixed(2) || '0.00'}%
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-semibold">Sharpe Ratio</span>
              <span className="font-semibold">
                {original.sharpe?.toFixed(2) || '0.00'}
              </span>
            </div>
          </div>
        </Card>

        {/* Portfólio Otimizado */}
        <Card className="p-4 border-2 border-primary/50 bg-primary/5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm">Com Otimização</h4>
            {improvement.return_delta > 0 && (
              <div className="flex items-center gap-1">
                <TrendingUp className="w-4 h-4 text-success" />
                <span className="text-xs bg-success/20 text-success px-2 py-1 rounded-full">
                  +{improvement.return_delta?.toFixed(2) || '0.00'}%
                </span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm">Retorno Anualizado</span>
              <span className={`font-bold text-lg ${optimized.return_pct >= 0 ? 'text-success' : 'text-destructive'}`}>
                {optimized.return_pct?.toFixed(2) || '0.00'}%
                {improvement.return_delta > 0 && <span className="text-xs ml-1">↑</span>}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Retorno Acumulado ({backtestResults.test_period_months || 4} meses)</span>
              <span className={`font-semibold ${optimized.cumulative_return_pct >= 0 ? 'text-success' : 'text-destructive'}`}>
                {optimized.cumulative_return_pct?.toFixed(2) || '0.00'}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">CVaR (95%)</span>
              <span className="font-semibold text-foreground">
                {optimized.cvar_pct?.toFixed(2) || '0.00'}%
                {improvement.risk_delta < 0 && <span className="text-xs ml-1 text-success">↓</span>}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-semibold">Sharpe Ratio</span>
              <span className="font-semibold text-success">
                {optimized.sharpe?.toFixed(2) || '0.00'}
                {improvement.sharpe_delta > 0 && <span className="text-xs ml-1">↑</span>}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Gráfico de Comparação */}
      {chartData.length > 0 && (
        <div className="mt-6">
          <h4 className="font-semibold mb-4">Evolução do Retorno Acumulado ({backtestResults.test_period_months || 4} meses)</h4>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
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
                formatter={(value: any, name: string) => {
                  const label = name === 'original' ? 'Sem Otimização' : 'Com Otimização';
                  return [`${Number(value).toFixed(2)}%`, label];
                }}
                labelFormatter={(label) => `Data: ${label}`}
              />
              <Legend 
                formatter={(value) => value === 'original' ? 'Sem Otimização' : 'Com Otimização'}
              />
              <Line
                type="monotone"
                dataKey="original"
                name="original"
                stroke="#6b7280"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="optimized"
                name="optimized"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Resumo das Diferenças */}
      <div className="mt-6 p-4 bg-secondary rounded-lg">
        <h4 className="font-semibold mb-3">Resumo das Diferenças</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Retorno:</span>
            <span className={`ml-2 font-semibold ${improvement.return_delta >= 0 ? 'text-success' : 'text-destructive'}`}>
              {improvement.return_delta >= 0 ? '+' : ''}{improvement.return_delta?.toFixed(2) || '0.00'}% 
              {improvement.return_delta >= 0 ? ' (melhor)' : ' (pior)'}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Risco (CVaR):</span>
            <span className={`ml-2 font-semibold ${improvement.risk_delta <= 0 ? 'text-success' : 'text-destructive'}`}>
              {improvement.risk_delta >= 0 ? '+' : ''}{improvement.risk_delta?.toFixed(2) || '0.00'}%
              {improvement.risk_delta <= 0 ? ' (menor risco)' : ' (maior risco)'}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Sharpe Ratio:</span>
            <span className={`ml-2 font-semibold ${improvement.sharpe_delta >= 0 ? 'text-success' : 'text-destructive'}`}>
              {improvement.sharpe_delta >= 0 ? '+' : ''}{improvement.sharpe_delta?.toFixed(2) || '0.00'}
              {improvement.sharpe_delta >= 0 ? ' (melhor)' : ' (pior)'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};

