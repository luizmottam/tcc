import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Portfolio, Asset, OptimizationResult } from "@/types/portfolio";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Zap, TrendingUp, ArrowUpRight, ArrowDownRight, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ScatterChart, Scatter } from "recharts";
import { toast } from "sonner";

const COLORS = ["#10b981", "#059669", "#047857", "#ef4444", "#facc15"];

const PortfolioOptimization = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const API_BASE = ((import.meta as any).env?.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationProgress, setOptimizationProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [optimized, setOptimized] = useState<OptimizationResult | null>(null);
  const [gaHistory, setGaHistory] = useState<Array<{ generation: number; ret: number; cvar: number; fitness: number }>>([]);
  const [performanceData, setPerformanceData] = useState<Array<{ date: string; portfolio: number; ibovespa: number; selic: number }>>([]);
  const [originalPerformanceData, setOriginalPerformanceData] = useState<Array<{ date: string; portfolio: number; ibovespa: number; selic: number }>>([]);
  const [sectorAllocation, setSectorAllocation] = useState<Record<string, number>>({});
  const [optimizedMetrics, setOptimizedMetrics] = useState<any>(null);
  const [originalMetrics, setOriginalMetrics] = useState<any>(null);
  const [applySaving, setApplySaving] = useState(false);
  const [applySaved, setApplySaved] = useState(false);

  // --- Função para executar otimização ---
  const runOptimization = async (portfolioId: number, currentPortfolio: Portfolio) => {
    setOptimizing(true);
    setOptimizationProgress(0);
    setError(null);

    const jobId = `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let progressInterval: NodeJS.Timeout | null = null;

    try {
      // Iniciar polling de progresso
      const startProgressPolling = () => {
        progressInterval = setInterval(async () => {
          try {
            const progressRes = await fetch(`${API_BASE}/otimizar/progresso/${jobId}`);
            if (progressRes.ok) {
              const progressData = await progressRes.json();
              setOptimizationProgress(progressData.progress || 0);

              if (progressData.status === "error") {
                throw new Error(progressData.message || "Erro na otimização");
              }

              if (progressData.status === "completed") {
                if (progressInterval) clearInterval(progressInterval);
              }
            }
          } catch (err) {
            console.error("Erro ao buscar progresso:", err);
          }
        }, 500); // Polling a cada 500ms
      };

      startProgressPolling();

      // Iniciar otimização
      const optRes = await fetch(`${API_BASE}/otimizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolio_id: portfolioId,
          populacao: 100,
          geracoes: 50,
          risco_peso: 1.0,
          cvar_alpha: 0.95,
          job_id: jobId
        }),
      });

      if (progressInterval) clearInterval(progressInterval);

      if (!optRes.ok) {
        const errorData = await optRes.json().catch(() => ({}));
        throw new Error(errorData.detail || "Erro ao otimizar portfólio");
      }

      const optData = await optRes.json();
      console.log("Dados recebidos do backend:", optData);
      setOptimizationProgress(100);

      // O backend retorna diretamente um OptimizationResultOut
      const optimizedResult = {
        originalReturn: Number(optData.originalReturn ?? currentPortfolio.totalReturn ?? 0),
        originalRisk: Number(optData.originalRisk ?? currentPortfolio.totalRisk ?? 0),
        optimizedReturn: Number(optData.optimizedReturn ?? 0),
        optimizedRisk: Number(optData.optimizedRisk ?? 0),
        improvement: Number(optData.improvement ?? 0),
        convergenceGeneration: Number(optData.convergenceGeneration ?? 0),
        optimizedWeights: Array.isArray(optData.optimizedWeights) ? optData.optimizedWeights : [],
      };

      console.log("Resultado otimizado processado:", optimizedResult);
      setOptimized(optimizedResult);

      // Configurar histórico de convergência
      if (optData.history && Array.isArray(optData.history)) {
        setGaHistory(optData.history);
      }

      // Configurar séries temporais
      if (optData.performanceSeries && Array.isArray(optData.performanceSeries)) {
        setPerformanceData(optData.performanceSeries);
      }
      if (optData.originalPerformanceSeries && Array.isArray(optData.originalPerformanceSeries)) {
        setOriginalPerformanceData(optData.originalPerformanceSeries);
      }

      // Configurar métricas quantitativas
      if (optData.optimizedMetrics) {
        setOptimizedMetrics(optData.optimizedMetrics);
      }
      if (optData.originalMetrics) {
        setOriginalMetrics(optData.originalMetrics);
      }

      // Configurar alocação setorial
      if (optData.sectorAllocation) {
        console.log("Alocação setorial recebida:", optData.sectorAllocation);
        setSectorAllocation(optData.sectorAllocation);
      } else {
        console.warn("Alocação setorial não recebida do backend");
        // Tentar calcular a partir dos pesos otimizados
        const calculatedAllocation: Record<string, number> = {};
        if (optimizedResult.optimizedWeights && portfolio) {
          optimizedResult.optimizedWeights.forEach((ow: any) => {
            const asset = portfolio.assets.find(a => {
              const assetTicker = a.ticker.replace(".SA", "").toUpperCase();
              const optTicker = ow.ticker.replace(".SA", "").toUpperCase();
              return assetTicker === optTicker;
            });
            if (asset && asset.sector) {
              const sector = asset.sector || "Outros";
              calculatedAllocation[sector] = (calculatedAllocation[sector] || 0) + Number(ow.weight || 0);
            }
          });
          if (Object.keys(calculatedAllocation).length > 0) {
            console.log("Alocação setorial calculada no frontend:", calculatedAllocation);
            setSectorAllocation(calculatedAllocation);
          }
        }
      }

      toast.success("Otimização concluída com sucesso!");
    } catch (err) {
      console.error("Erro na otimização:", err);
      setError(String(err));
      toast.error(`Erro na otimização: ${err}`);
      if (progressInterval) clearInterval(progressInterval);
    } finally {
      setOptimizing(false);
      // Limpar intervalo se ainda estiver rodando
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    }
  };

  // --- Função para aplicar otimização ---
  const handleApplyOptimization = async () => {
    if (!optimized || !portfolio || !id) return;
    setApplySaving(true);
    try {
      console.log("Aplicando otimização. Pesos otimizados:", optimized.optimizedWeights);
      console.log("Ativos do portfólio:", portfolio.assets);

      let updatedCount = 0;
      for (const ow of optimized.optimizedWeights) {
        // Normalizar ticker para comparação (remover .SA se presente)
        const normalizedTicker = ow.ticker.replace(".SA", "").toUpperCase();
        const asset = portfolio.assets.find(a => {
          const assetTicker = a.ticker.replace(".SA", "").toUpperCase();
          return assetTicker === normalizedTicker;
        });

        if (!asset) {
          console.warn(`Ativo não encontrado no portfólio: ${ow.ticker}`);
          continue;
        }

        console.log(`Atualizando ${ow.ticker} (ID: ${asset.id}) com peso ${ow.weight}%`);

        const res = await fetch(`${API_BASE}/portfolio/${id}/ativos/${asset.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weight: Number(ow.weight) }), // peso já está em porcentagem (0-100)
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error(`Erro ao atualizar ${ow.ticker}:`, errorText);
          throw new Error(`Falha ao atualizar ${ow.ticker}: ${errorText}`);
        }

        updatedCount++;
      }

      if (updatedCount === 0) {
        throw new Error("Nenhum ativo foi atualizado. Verifique se os tickers correspondem.");
      }

      setApplySaved(true);
      setTimeout(() => setApplySaved(false), 3000);
      toast.success(`Distribuição otimizada aplicada! ${updatedCount} ativo(s) atualizado(s).`);

      // Aguardar um pouco antes de recarregar para garantir que o backend processou
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Limpar estado de otimização para forçar recálculo
      setOptimized(null);
      setSectorAllocation({});
      setOptimizedMetrics(null);
      setOriginalMetrics(null);
      setPerformanceData([]);
      setOriginalPerformanceData([]);
      setGaHistory([]);

      // atualizar portfólio
      await loadPortfolio();

      // Navegar de volta para os detalhes para ver as mudanças
      setTimeout(() => {
        navigate(`/portfolio/${id}`);
      }, 500);
    } catch (err) {
      console.error("Erro ao aplicar otimização:", err);
      setError(`Erro ao aplicar mudanças: ${err}`);
      toast.error(`Erro ao aplicar mudanças: ${err}`);
    } finally {
      setApplySaving(false);
    }
  };

  // --- Carregar portfólio (sem otimização automática) ---
  const loadPortfolio = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/portfolio/${id}`);
      if (!res.ok) throw new Error("Portfólio não encontrado");
      const data = await res.json();
      const p: Portfolio = {
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
      setPortfolio(p);

      // Não executar otimização automaticamente - usuário deve clicar no botão
      // A otimização será executada apenas quando o usuário clicar em "Otimizar" ou "Reotimizar"

    } catch (err) {
      console.error("Erro ao carregar portfólio:", err);
      setError(String(err));
      toast.error(`Erro ao carregar portfólio: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPortfolio(); }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-subtle">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando portfólio...</p>
        </div>
      </div>
    );
  }

  if (error && !portfolio) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-subtle">
        <div className="text-center">
          <p className="text-destructive text-lg mb-2">Erro</p>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-subtle">
        <p className="text-muted-foreground">Portfólio não encontrado</p>
      </div>
    );
  }

  const totalWeight = portfolio.assets.reduce((sum, a) => sum + a.weight, 0);

  // Preparar dados do gráfico de pizza
  const pieData = optimized && optimized.optimizedWeights && optimized.optimizedWeights.length > 0
    ? optimized.optimizedWeights
      .filter(w => w && w.ticker && w.weight > 0)
      .map((w, i) => ({
        name: (w.ticker || "").replace(".SA", ""),
        value: Number(w.weight || 0),
        color: COLORS[i % COLORS.length]
      }))
    : portfolio.assets
      .filter(a => a.weight > 0)
      .map((a, i) => ({
        name: a.ticker.replace(".SA", ""),
        value: a.weight,
        color: COLORS[i % COLORS.length]
      }));

  // Preparar dados da fronteira eficiente
  const frontierData = optimized && optimized.optimizedReturn > 0 && optimized.optimizedRisk > 0
    ? [
      {
        risk: Number(portfolio.totalRisk ?? 0),
        return: Number(portfolio.totalReturn ?? 0),
        type: "Original"
      },
      {
        risk: Number(optimized.optimizedRisk ?? 0),
        return: Number(optimized.optimizedReturn ?? 0),
        type: "Otimizado"
      },
    ]
    : [
      {
        risk: Number(portfolio.totalRisk ?? 0),
        return: Number(portfolio.totalReturn ?? 0),
        type: "Original"
      },
    ];

  return (
    <div className="min-h-screen gradient-subtle">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate(`/portfolio/${id}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />Voltar
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Otimização por Algoritmo Genético</h1>
              <p className="text-muted-foreground text-sm mt-1">{portfolio.name}</p>
            </div>
          </div>
          {!optimizing && portfolio.assets.length >= 2 && !optimized && (
            <Button
              onClick={() => runOptimization(Number(id), portfolio)}
              disabled={optimizing}
            >
              <Zap className="w-4 h-4 mr-2" />
              Otimizar Portfólio
            </Button>
          )}
          {!optimizing && portfolio.assets.length >= 2 && optimized && (
            <Button
              onClick={() => runOptimization(Number(id), portfolio)}
              disabled={optimizing}
              variant="outline"
            >
              <Zap className="w-4 h-4 mr-2" />
              Reotimizar
            </Button>
          )}
        </div>

        {/* Loading State durante otimização */}
        {optimizing && (
          <Card className="p-6 mb-6 shadow-card animate-fade-in">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Otimizando portfólio...</h3>
                  <p className="text-sm text-muted-foreground">
                    {optimizationProgress < 15 && "Carregando dados do portfólio..."}
                    {optimizationProgress >= 15 && optimizationProgress < 40 && "Buscando dados históricos dos ativos..."}
                    {optimizationProgress >= 40 && optimizationProgress < 50 && "Calculando métricas dos ativos..."}
                    {optimizationProgress >= 50 && optimizationProgress < 90 && "Executando algoritmo genético..."}
                    {optimizationProgress >= 90 && "Processando resultados..."}
                    {" "}({optimizationProgress}%)
                  </p>
                </div>
              </div>
              <Progress value={optimizationProgress} className="h-3" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className={`p-2 rounded ${optimizationProgress >= 5 ? 'bg-primary/10' : 'bg-secondary'}`}>
                  ✓ Carregando portfólio
                </div>
                <div className={`p-2 rounded ${optimizationProgress >= 15 ? 'bg-primary/10' : 'bg-secondary'}`}>
                  {optimizationProgress >= 15 ? '✓' : '○'} Buscando preços históricos
                </div>
                <div className={`p-2 rounded ${optimizationProgress >= 40 ? 'bg-primary/10' : 'bg-secondary'}`}>
                  {optimizationProgress >= 40 ? '✓' : '○'} Calculando métricas
                </div>
                <div className={`p-2 rounded ${optimizationProgress >= 50 ? 'bg-primary/10' : 'bg-secondary'}`}>
                  {optimizationProgress >= 50 ? '✓' : '○'} Executando GA
                </div>
                <div className={`p-2 rounded ${optimizationProgress >= 90 ? 'bg-primary/10' : 'bg-secondary'}`}>
                  {optimizationProgress >= 90 ? '✓' : '○'} Processando resultados
                </div>
                <div className={`p-2 rounded ${optimizationProgress >= 100 ? 'bg-success/20 text-success' : 'bg-secondary'}`}>
                  {optimizationProgress >= 100 ? '✓' : '○'} Concluído
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Mensagem quando não há otimização */}
        {!optimized && !optimizing && portfolio.assets.length >= 2 && (
          <Card className="p-8 mb-6 shadow-card text-center">
            <div className="max-w-md mx-auto">
              <Zap className="w-16 h-16 text-primary mx-auto mb-4 opacity-50" />
              <h2 className="text-2xl font-bold mb-2">Otimização não executada</h2>
              <p className="text-muted-foreground mb-6">
                Clique no botão "Otimizar Portfólio" acima para iniciar a otimização usando algoritmo genético.
              </p>
              <Button
                onClick={() => runOptimization(Number(id), portfolio)}
                size="lg"
              >
                <Zap className="w-5 h-5 mr-2" />
                Iniciar Otimização
              </Button>
            </div>
          </Card>
        )}

        {!optimized && !optimizing && portfolio.assets.length < 2 && (
          <Card className="p-8 mb-6 shadow-card text-center">
            <div className="max-w-md mx-auto">
              <AlertTriangle className="w-16 h-16 text-destructive mx-auto mb-4 opacity-50" />
              <h2 className="text-2xl font-bold mb-2">Portfólio insuficiente</h2>
              <p className="text-muted-foreground mb-6">
                É necessário ter pelo menos 2 ativos no portfólio para realizar a otimização.
              </p>
              <Button
                onClick={() => navigate(`/portfolio/${id}`)}
                variant="outline"
                size="lg"
              >
                Adicionar Ativos
              </Button>
            </div>
          </Card>
        )}

        {/* Cards Comparativos */}
        {optimized && !optimizing && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card className="p-6 shadow-card">
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">Portfólio Original</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Retorno Esperado</span>
                  <span className="font-bold text-lg text-foreground">
                    {optimized.originalReturn.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Risco (CVaR)</span>
                  <span className="font-bold text-lg text-foreground">
                    {optimized.originalRisk.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm font-semibold">Sharpe Ratio</span>
                  <span className="font-bold text-lg">
                    {optimized.originalReturn > 0
                      ? (optimized.originalReturn / (optimized.originalRisk || 1)).toFixed(2)
                      : "0.00"
                    }
                  </span>
                </div>
              </div>
            </Card>

            <Card className="p-6 shadow-card border-primary/20 bg-primary/5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm text-muted-foreground">Portfólio Otimizado</h3>
                {optimized.improvement > 0 && (
                  <span className="text-xs bg-success/20 text-success px-2 py-1 rounded-full">
                    +{optimized.improvement.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Retorno Esperado</span>
                  <span className="font-bold text-lg text-success">
                    {optimized.optimizedReturn.toFixed(2)}%
                    {optimized.optimizedReturn > optimized.originalReturn && (
                      <ArrowUpRight className="w-4 h-4 inline ml-1" />
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Risco (CVaR)</span>
                  <span className="font-bold text-lg text-foreground">
                    {optimized.optimizedRisk.toFixed(2)}%
                    {optimized.optimizedRisk < optimized.originalRisk && (
                      <ArrowDownRight className="w-4 h-4 inline ml-1 text-success" />
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm font-semibold">Sharpe Ratio</span>
                  <span className="font-bold text-lg text-success">
                    {optimized.optimizedReturn > 0
                      ? (optimized.optimizedReturn / (optimized.optimizedRisk || 1)).toFixed(2)
                      : "0.00"
                    }
                  </span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <Card className="p-4 mb-6 border-destructive/50 bg-destructive/10">
            <p className="text-destructive font-semibold mb-1">Erro na otimização</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setError(null);
                if (portfolio) runOptimization(Number(id), portfolio);
              }}
            >
              Tentar novamente
            </Button>
          </Card>
        )}

        {/* Gráfico de Evolução Temporal */}
        {optimized && !optimizing && performanceData.length > 0 && (
          <Card className="p-6 mb-6 shadow-card">
            <h3 className="text-xl font-bold mb-4">Evolução Temporal - Retorno Acumulado</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Comparação do desempenho do portfólio otimizado frente à carteira base, Ibovespa e Selic
            </p>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  label={{ value: 'Retorno Acumulado (%)', angle: -90, position: 'insideLeft' }}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value: any) => `${Number(value).toFixed(2)}%`}
                  labelFormatter={(label) => `Data: ${label}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="portfolio"
                  name="Portfólio Otimizado"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  data={performanceData}
                />
                {originalPerformanceData.length > 0 && (
                  <Line
                    type="monotone"
                    dataKey="portfolio"
                    name="Carteira Base"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    data={originalPerformanceData}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="ibovespa"
                  name="Ibovespa"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  data={performanceData}
                />
                <Line
                  type="monotone"
                  dataKey="selic"
                  name="Selic"
                  stroke="#facc15"
                  strokeWidth={2}
                  dot={false}
                  data={performanceData}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Gráfico de Alocação Setorial */}
          {optimized && !optimizing && (
            <Card className="p-6 mb-6 shadow-card">
              <h3 className="text-xl font-bold mb-4">Alocação Setorial</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Distribuição automática promovida pelo algoritmo genético entre setores
              </p>
              {Object.keys(sectorAllocation).length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <PieChart>
                    <Pie
                      data={Object.entries(sectorAllocation)
                        .map(([name, value]) => ({ name, value: Number(value) }))
                        .filter(item => item.value > 0)
                        .sort((a, b) => b.value - a.value)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {Object.entries(sectorAllocation)
                        .filter(([_, value]) => Number(value) > 0)
                        .map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => `${Number(value).toFixed(2)}%`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Alocação setorial não disponível</p>
                  <p className="text-sm mt-2">Os setores serão calculados após a otimização</p>
                </div>
              )}
            </Card>
          )}
          {/* Pie Chart Distribuição */}
          {optimized && !optimizing && (
            <Card className="p-6 mb-6 shadow-card">
              <div className="mb-4">
                <h2 className="font-semibold mb-1">Distribuição de Pesos Otimizada</h2>
                <p className="text-sm text-muted-foreground">
                  Nova alocação sugerida pelo algoritmo genético
                </p>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, value }) => `${name} ${value.toFixed(1)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(val: any) => `${Number(val).toFixed(2)}%`}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                {pieData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
                    <span className="text-muted-foreground">{entry.name}:</span>
                    <span className="font-semibold">{entry.value.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>


        {/* Indicadores Quantitativos */}
        {optimized && !optimizing && optimizedMetrics && originalMetrics && (
          <Card className="p-6 mb-6 shadow-card">
            <h3 className="text-xl font-bold mb-4">Indicadores Quantitativos</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Métricas comparativas entre portfólio original e otimizado
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3 text-muted-foreground">Portfólio Original</h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">Retorno Médio</span>
                    <span className="font-bold">{originalMetrics.retorno_medio?.toFixed(2) ?? "N/A"}%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">CVaR</span>
                    <span className="font-bold">{originalMetrics.cvar?.toFixed(2) ?? "N/A"}%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">Volatilidade</span>
                    <span className="font-bold">{originalMetrics.volatilidade?.toFixed(2) ?? "N/A"}%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">Sharpe Ratio</span>
                    <span className="font-bold">{originalMetrics.sharpe?.toFixed(2) ?? "N/A"}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">Desvio Padrão</span>
                    <span className="font-bold">{originalMetrics.desvio_padrao?.toFixed(2) ?? "N/A"}%</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-3 text-primary">Portfólio Otimizado</h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
                    <span className="text-sm">Retorno Médio</span>
                    <span className="font-bold text-primary">
                      {optimizedMetrics.retorno_medio?.toFixed(2) ?? "N/A"}%
                      {optimizedMetrics.retorno_medio > originalMetrics.retorno_medio && (
                        <ArrowUpRight className="w-4 h-4 inline ml-1" />
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
                    <span className="text-sm">CVaR</span>
                    <span className="font-bold text-primary">
                      {optimizedMetrics.cvar?.toFixed(2) ?? "N/A"}%
                      {optimizedMetrics.cvar < originalMetrics.cvar && (
                        <ArrowDownRight className="w-4 h-4 inline ml-1" />
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
                    <span className="text-sm">Volatilidade</span>
                    <span className="font-bold text-primary">
                      {optimizedMetrics.volatilidade?.toFixed(2) ?? "N/A"}%
                      {optimizedMetrics.volatilidade < originalMetrics.volatilidade && (
                        <ArrowDownRight className="w-4 h-4 inline ml-1" />
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
                    <span className="text-sm">Sharpe Ratio</span>
                    <span className="font-bold text-primary">
                      {optimizedMetrics.sharpe?.toFixed(2) ?? "N/A"}
                      {optimizedMetrics.sharpe > originalMetrics.sharpe && (
                        <ArrowUpRight className="w-4 h-4 inline ml-1" />
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
                    <span className="text-sm">Desvio Padrão</span>
                    <span className="font-bold text-primary">
                      {optimizedMetrics.desvio_padrao?.toFixed(2) ?? "N/A"}%
                      {optimizedMetrics.desvio_padrao < originalMetrics.desvio_padrao && (
                        <ArrowDownRight className="w-4 h-4 inline ml-1" />
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Gráfico de Convergência GA */}
        {gaHistory.length > 0 && (
          <Card className="p-6 mb-6 shadow-card">
            <div className="mb-4">
              <h2 className="font-semibold mb-1">Convergência do Algoritmo Genético</h2>
              <p className="text-sm text-muted-foreground">
                Evolução do melhor indivíduo ao longo de {gaHistory.length} gerações
              </p>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={gaHistory} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="generation"
                  label={{ value: "Geração", position: "insideBottom", offset: -5 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  label={{ value: "Valor (%)", angle: -90, position: "insideLeft" }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(val: any) => `${Number(val).toFixed(2)}%`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="ret"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Retorno Esperado (%)"
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="cvar"
                  stroke="#ef4444"
                  strokeWidth={2}
                  name="CVaR (%)"
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="fitness"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Fitness"
                  dot={false}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-4 p-3 bg-secondary rounded-lg">
              <p className="text-xs text-muted-foreground">
                <strong>Última geração:</strong> Retorno: {gaHistory[gaHistory.length - 1]?.ret.toFixed(2)}% |
                CVaR: {gaHistory[gaHistory.length - 1]?.cvar.toFixed(2)}% |
                Fitness: {gaHistory[gaHistory.length - 1]?.fitness.toFixed(2)}%
              </p>
            </div>
          </Card>
        )}

        {/* Pie Chart Distribuição */}
        {optimized && !optimizing && (
          <Card className="p-6 mb-6 shadow-card">
            <div className="mb-4">
              <h2 className="font-semibold mb-1">Distribuição de Pesos Otimizada</h2>
              <p className="text-sm text-muted-foreground">
                Nova alocação sugerida pelo algoritmo genético
              </p>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, value }) => `${name} ${value.toFixed(1)}%`}
                  labelLine={false}
                >
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(val: any) => `${Number(val).toFixed(2)}%`}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
              {pieData.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
                  <span className="text-muted-foreground">{entry.name}:</span>
                  <span className="font-semibold">{entry.value.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Fronteira Eficiente */}
        {optimized && !optimizing && frontierData.length > 0 && (
          <Card className="p-6 mb-6 shadow-card">
            <div className="mb-4">
              <h2 className="font-semibold mb-1">Fronteira Eficiente</h2>
              <p className="text-sm text-muted-foreground">
                Comparação entre portfólio original e otimizado no espaço risco-retorno
              </p>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  dataKey="risk"
                  name="Risco (CVaR)"
                  label={{ value: "Risco (CVaR) %", position: "insideBottom", offset: -5 }}
                  stroke="hsl(var(--muted-foreground))"
                  domain={['auto', 'auto']}
                />
                <YAxis
                  type="number"
                  dataKey="return"
                  name="Retorno"
                  label={{ value: "Retorno Esperado %", angle: -90, position: "insideLeft" }}
                  stroke="hsl(var(--muted-foreground))"
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(val: any, name: string) => [`${Number(val).toFixed(2)}%`, name]}
                />
                <Legend />
                <Scatter
                  name="Portfólio Original"
                  data={[frontierData[0]]}
                  fill="#9ca3af"
                  shape="circle"
                />
                {frontierData.length > 1 && (
                  <Scatter
                    name="Portfólio Otimizado"
                    data={[frontierData[1]]}
                    fill="#10b981"
                    shape="star"
                  />
                )}
              </ScatterChart>
            </ResponsiveContainer>
            {optimized && (
              <div className="mt-4 p-3 bg-secondary rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">Melhoria no Retorno</p>
                    <p className="font-semibold text-lg text-success">
                      +{optimized.improvement.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Redução no Risco</p>
                    <p className="font-semibold text-lg text-success">
                      {optimized.originalRisk > optimized.optimizedRisk
                        ? `-${(optimized.originalRisk - optimized.optimizedRisk).toFixed(2)}%`
                        : "0.00%"
                      }
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Botão Aplicar Mudanças */}
        {optimized && !optimizing && optimized.optimizedWeights && optimized.optimizedWeights.length > 0 && (
          <Card className="p-6 mb-6 shadow-card">
            <div className="text-center space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Aplicar Distribuição Otimizada</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  A distribuição otimizada será aplicada ao portfólio, atualizando os pesos dos ativos.
                </p>
              </div>
              <Button
                onClick={handleApplyOptimization}
                disabled={applySaving || applySaved}
                size="lg"
                className="min-w-[200px]"
              >
                {applySaving ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Salvando...
                  </>
                ) : applySaved ? (
                  <>
                    <span className="mr-2">✅</span>
                    Aplicado!
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Aplicar Mudanças
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PortfolioOptimization;