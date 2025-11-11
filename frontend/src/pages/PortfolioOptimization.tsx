import { useParams, useNavigate } from "react-router-dom";
import { mockPortfolios, generateOptimizationData } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Zap, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
} from "recharts";

const COLORS = ["hsl(162 100% 33%)", "hsl(162 80% 40%)", "hsl(162 60% 45%)", "hsl(0 84% 60%)", "hsl(45 93% 47%)"];

const PortfolioOptimization = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const portfolio = mockPortfolios.find((p) => p.id === id);

  if (!portfolio) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Portfólio não encontrado</p>
      </div>
    );
  }

  const originalReturn = portfolio.totalReturn || 13.36;
  const originalRisk = portfolio.totalRisk || 7.24;
  const optimizationData = generateOptimizationData(originalReturn, originalRisk);
  
  const optimizedReturn = optimizationData[optimizationData.length - 1].return;
  const optimizedRisk = optimizationData[optimizationData.length - 1].risk;
  const returnImprovement = ((optimizedReturn - originalReturn) / originalReturn) * 100;
  const riskReduction = ((originalRisk - optimizedRisk) / originalRisk) * 100;

  const pieData = portfolio.assets.map((asset, index) => ({
    name: asset.ticker,
    value: asset.weight,
    color: COLORS[index % COLORS.length],
  }));

  const frontierData = [
    { risk: originalRisk, return: originalReturn, type: "Original" },
    { risk: optimizedRisk, return: optimizedReturn, type: "Otimizado" },
  ];

  return (
    <div className="min-h-screen gradient-subtle">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <Button variant="ghost" onClick={() => navigate(`/portfolio/${id}`)} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar aos Detalhes
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary rounded-xl shadow-elegant">
              <Zap className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Otimização por Algoritmo Genético</h1>
              <p className="text-muted-foreground">{portfolio.name}</p>
            </div>
          </div>
        </div>

        {/* Improvement Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="p-6 shadow-elegant animate-fade-in gradient-primary">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-6 h-6 text-primary-foreground" />
              <h3 className="font-semibold text-primary-foreground">Melhoria Total</h3>
            </div>
            <p className="text-3xl font-bold text-primary-foreground mb-1">
              +{returnImprovement.toFixed(1)}%
            </p>
            <p className="text-sm text-primary-foreground/80">Retorno otimizado</p>
          </Card>

          <Card className="p-6 shadow-card animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <div className="flex items-center gap-3 mb-2">
              <ArrowUpRight className="w-6 h-6 text-success" />
              <h3 className="font-semibold text-sm text-muted-foreground">Retorno</h3>
            </div>
            <p className="text-2xl font-bold text-foreground mb-1">
              {originalReturn.toFixed(2)}% → {optimizedReturn.toFixed(2)}%
            </p>
            <p className="text-sm text-success font-semibold">+{(optimizedReturn - originalReturn).toFixed(2)}%</p>
          </Card>

          <Card className="p-6 shadow-card animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center gap-3 mb-2">
              <ArrowDownRight className="w-6 h-6 text-destructive" />
              <h3 className="font-semibold text-sm text-muted-foreground">Risco (CVaR)</h3>
            </div>
            <p className="text-2xl font-bold text-foreground mb-1">
              {originalRisk.toFixed(2)}% → {optimizedRisk.toFixed(2)}%
            </p>
            <p className="text-sm text-success font-semibold">-{(originalRisk - optimizedRisk).toFixed(2)}%</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Convergence Chart */}
          <Card className="p-6 shadow-card animate-fade-in">
            <h2 className="text-xl font-semibold mb-4">Convergência do Algoritmo Genético</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={optimizationData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="generation"
                  stroke="hsl(var(--muted-foreground))"
                  label={{ value: "Geração", position: "insideBottom", offset: -5 }}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="return"
                  stroke="hsl(var(--success))"
                  strokeWidth={2}
                  name="Retorno (%)"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-4 p-3 bg-secondary rounded-lg">
              <p className="text-sm text-muted-foreground">
                Melhor solução encontrada na <span className="font-bold text-foreground">geração 37</span>
              </p>
            </div>
          </Card>

          {/* Weight Distribution */}
          <Card className="p-6 shadow-card animate-fade-in">
            <h2 className="text-xl font-semibold mb-4">Distribuição Otimizada</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name} ${value}%`}
                  outerRadius={100}
                  fill="hsl(var(--primary))"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Efficient Frontier */}
        <Card className="p-6 shadow-card animate-fade-in">
          <h2 className="text-xl font-semibold mb-4">Fronteira Eficiente</h2>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                dataKey="risk"
                name="Risco (CVaR)"
                stroke="hsl(var(--muted-foreground))"
                label={{ value: "Risco (CVaR %)", position: "insideBottom", offset: -5 }}
              />
              <YAxis
                type="number"
                dataKey="return"
                name="Retorno"
                stroke="hsl(var(--muted-foreground))"
                label={{ value: "Retorno (%)", angle: -90, position: "insideLeft" }}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              <Scatter
                name="Original"
                data={[frontierData[0]]}
                fill="hsl(var(--muted-foreground))"
                shape="circle"
              />
              <Scatter
                name="Otimizado"
                data={[frontierData[1]]}
                fill="hsl(var(--success))"
                shape="star"
              />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="mt-4 p-4 bg-success-light rounded-lg">
            <p className="text-sm">
              <span className="font-semibold text-success">Otimização bem-sucedida:</span> O
              Algoritmo Genético encontrou uma configuração com{" "}
              <span className="font-bold">{returnImprovement.toFixed(1)}% mais retorno</span> e{" "}
              <span className="font-bold">{riskReduction.toFixed(1)}% menos risco</span>.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PortfolioOptimization;
