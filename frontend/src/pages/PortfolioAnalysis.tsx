import { useParams, useNavigate } from "react-router-dom";
import { mockPortfolios, generatePerformanceData } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, TrendingUp, Activity, Shield } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const PortfolioAnalysis = () => {
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

  const performanceData = generatePerformanceData(portfolio.totalReturn || 10);
  const avgReturn = portfolio.totalReturn || 10.5;
  const cvar = portfolio.totalRisk || 6.2;
  const stdDev = 8.4;

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
              <Activity className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Análise de Desempenho</h1>
              <p className="text-muted-foreground">{portfolio.name}</p>
            </div>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="p-6 shadow-card animate-fade-in">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-success-light rounded-lg">
                <TrendingUp className="w-5 h-5 text-success" />
              </div>
              <h3 className="font-semibold text-sm text-muted-foreground">Retorno Médio</h3>
            </div>
            <p className="text-3xl font-bold text-success">{avgReturn.toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground mt-1">Anualizado</p>
          </Card>

          <Card className="p-6 shadow-card animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <Shield className="w-5 h-5 text-destructive" />
              </div>
              <h3 className="font-semibold text-sm text-muted-foreground">CVaR (95%)</h3>
            </div>
            <p className="text-3xl font-bold text-foreground">{cvar.toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground mt-1">Conditional Value at Risk</p>
          </Card>

          <Card className="p-6 shadow-card animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-secondary rounded-lg">
                <Activity className="w-5 h-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-sm text-muted-foreground">Desvio Padrão</h3>
            </div>
            <p className="text-3xl font-bold text-foreground">{stdDev.toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground mt-1">Volatilidade</p>
          </Card>
        </div>

        {/* Performance Chart */}
        <Card className="p-6 shadow-card animate-fade-in">
          <h2 className="text-xl font-semibold mb-6">Desempenho vs Taxa Selic</h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="month"
                stroke="hsl(var(--muted-foreground))"
                style={{ fontSize: "12px" }}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                style={{ fontSize: "12px" }}
                label={{ value: "Retorno (%)", angle: -90, position: "insideLeft" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="portfolio"
                stroke="hsl(var(--success))"
                strokeWidth={3}
                name="Portfólio"
                dot={{ fill: "hsl(var(--success))", r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="selic"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={2}
                strokeDasharray="5 5"
                name="Taxa Selic"
                dot={{ fill: "hsl(var(--muted-foreground))", r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 p-4 bg-success-light rounded-lg">
            <p className="text-sm">
              <span className="font-semibold text-success">Desempenho superior:</span> Seu
              portfólio está apresentando retorno médio de{" "}
              <span className="font-bold">{avgReturn.toFixed(2)}%</span>, superando a Taxa Selic em{" "}
              <span className="font-bold">{(avgReturn - 11.75).toFixed(2)}%</span>.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PortfolioAnalysis;
