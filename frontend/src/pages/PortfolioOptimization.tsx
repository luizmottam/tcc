import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Portfolio, Asset, OptimizationResult } from "@/types/portfolio";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Zap, TrendingUp, ArrowUpRight, ArrowDownRight, AlertTriangle, Star, Target, BarChart3 } from "lucide-react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { toast } from "sonner";
import { BacktestComparisonCard } from "@/components/BacktestComparisonCard";
import { OptimizationRiskContribution } from "@/components/OptimizationRiskContribution";

const API_BASE = ((import.meta as any).env?.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

interface PortfolioMetrics {
  return: number;
  risk: number;
  cvar: number;
  sharpe: number;
}

interface EfficientFrontierPoint {
  risk: number;
  return: number;
  sharpe: number;
  weights: number[];
}

interface OptimizationData {
  original: PortfolioMetrics;
  optimized: PortfolioMetrics;
  efficientFrontier: EfficientFrontierPoint[];
  bestSharpe: EfficientFrontierPoint | null;
  minRisk: EfficientFrontierPoint | null;
  cvarFrontier: EfficientFrontierPoint[];
  bestCvarSharpe: EfficientFrontierPoint | null;
}

// ============================================================================
// FUNÇÕES DE CÁLCULO FINANCEIRO
// ============================================================================

/**
 * Calcula retornos logarítmicos a partir de preços
 */
function calculateLogReturns(prices: number[][]): number[][] {
  const returns: number[][] = [];
  for (let i = 1; i < prices.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < prices[i].length; j++) {
      if (prices[i - 1][j] > 0 && prices[i][j] > 0) {
        row.push(Math.log(prices[i][j] / prices[i - 1][j]));
      } else {
        row.push(0);
      }
    }
    returns.push(row);
  }
  return returns;
}

/**
 * Calcula média anualizada dos retornos
 */
function calculateAnnualizedMean(returns: number[], tradingDays: number = 252): number {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  return mean * tradingDays;
}

/**
 * Calcula matriz de covariância anualizada
 */
function calculateCovarianceMatrix(returns: number[][]): number[][] {
  const n = returns.length;
  const m = returns[0]?.length || 0;
  if (n === 0 || m === 0) return [];

  const tradingDays = 252;
  const covMatrix: number[][] = [];

  // Calcular médias
  const means: number[] = [];
  for (let j = 0; j < m; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += returns[i][j];
    }
    means.push(sum / n);
  }

  // Calcular covariâncias
  for (let i = 0; i < m; i++) {
    const row: number[] = [];
    for (let j = 0; j < m; j++) {
      let cov = 0;
      for (let k = 0; k < n; k++) {
        cov += (returns[k][i] - means[i]) * (returns[k][j] - means[j]);
      }
      cov = (cov / (n - 1)) * tradingDays;
      row.push(cov);
    }
    covMatrix.push(row);
  }

  return covMatrix;
}

/**
 * Calcula retorno do portfólio
 */
function calculatePortfolioReturn(weights: number[], meanReturns: number[]): number {
  if (weights.length !== meanReturns.length) return 0;
  return weights.reduce((sum, w, i) => sum + w * meanReturns[i], 0);
}

/**
 * Calcula risco (desvio padrão) do portfólio
 */
function calculatePortfolioRisk(weights: number[], covMatrix: number[][]): number {
  if (weights.length !== covMatrix.length) return 0;
  
  let variance = 0;
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      variance += weights[i] * weights[j] * covMatrix[i][j];
    }
  }
  
  return Math.sqrt(Math.max(0, variance));
}

/**
 * Calcula CVaR (Conditional Value at Risk) histórico
 */
function calculateCVaR(returns: number[], alpha: number = 0.95): number {
  if (returns.length === 0) return 0;
  
  const sorted = [...returns].sort((a, b) => a - b);
  const varIndex = Math.floor((1 - alpha) * sorted.length);
  const varThreshold = sorted[varIndex] || sorted[0];
  
  const tailLosses = sorted.filter(r => r <= varThreshold);
  if (tailLosses.length === 0) return 0;
  
  const cvar = tailLosses.reduce((sum, r) => sum + r, 0) / tailLosses.length;
  return Math.abs(cvar) * Math.sqrt(252); // Anualizar
}

/**
 * Calcula CVaR do portfólio usando simulação
 */
function calculatePortfolioCVaR(
  portfolioReturns: number[],
  alpha: number = 0.95
): number {
  return calculateCVaR(portfolioReturns, alpha);
}

/**
 * Calcula Sharpe Ratio
 */
function calculateSharpeRatio(returnValue: number, risk: number, riskFreeRate: number = 0): number {
  if (risk === 0) return 0;
  return (returnValue - riskFreeRate) / risk;
}

/**
 * Gera pesos aleatórios normalizados
 */
function generateRandomWeights(n: number): number[] {
  const weights: number[] = [];
  let sum = 0;
  
  for (let i = 0; i < n; i++) {
    const w = Math.random();
    weights.push(w);
    sum += w;
  }
  
  return weights.map(w => w / sum);
}

/**
 * Simula fronteira eficiente de Markowitz
 */
function simulateEfficientFrontier(
  meanReturns: number[],
  covMatrix: number[][],
  numSimulations: number = 10000
): EfficientFrontierPoint[] {
  const frontier: EfficientFrontierPoint[] = [];
  const n = meanReturns.length;
  
  for (let i = 0; i < numSimulations; i++) {
    const weights = generateRandomWeights(n);
    const portfolioReturn = calculatePortfolioReturn(weights, meanReturns);
    const portfolioRisk = calculatePortfolioRisk(weights, covMatrix);
    const sharpe = calculateSharpeRatio(portfolioReturn, portfolioRisk);
    
    frontier.push({
      risk: portfolioRisk * 100, // Converter para %
      return: portfolioReturn * 100, // Converter para %
      sharpe,
      weights: [...weights],
    });
  }
  
  return frontier;
}

/**
 * Otimiza portfólio por Sharpe Ratio
 */
function optimizeBySharpe(
  meanReturns: number[],
  covMatrix: number[][],
  frontier: EfficientFrontierPoint[]
): EfficientFrontierPoint | null {
  if (frontier.length === 0) return null;
  
  let best = frontier[0];
  for (const point of frontier) {
    if (point.sharpe > best.sharpe) {
      best = point;
    }
  }
  
  return best;
}

/**
 * Encontra portfólio de menor risco
 */
function findMinRisk(frontier: EfficientFrontierPoint[]): EfficientFrontierPoint | null {
  if (frontier.length === 0) return null;
  
  let min = frontier[0];
  for (const point of frontier) {
    if (point.risk < min.risk) {
      min = point;
    }
  }
  
  return min;
}

/**
 * Simula fronteira eficiente com CVaR
 */
function simulateCvarFrontier(
  returns: number[][],
  meanReturns: number[],
  covMatrix: number[][],
  numSimulations: number = 10000
): EfficientFrontierPoint[] {
  const frontier: EfficientFrontierPoint[] = [];
  const n = meanReturns.length;
  
  for (let i = 0; i < numSimulations; i++) {
    const weights = generateRandomWeights(n);
    const portfolioReturn = calculatePortfolioReturn(weights, meanReturns);
    
    // Calcular retornos do portfólio
    const portfolioReturns: number[] = [];
    for (let j = 0; j < returns.length; j++) {
      let portfolioReturnDaily = 0;
      for (let k = 0; k < n; k++) {
        portfolioReturnDaily += weights[k] * returns[j][k];
      }
      portfolioReturns.push(portfolioReturnDaily);
    }
    
    const cvar = calculatePortfolioCVaR(portfolioReturns);
    const portfolioRisk = calculatePortfolioRisk(weights, covMatrix);
    const sharpe = calculateSharpeRatio(portfolioReturn, cvar);
    
    frontier.push({
      risk: cvar, // CVaR em decimal
      return: portfolioReturn * 100, // Retorno em %
      sharpe,
      weights: [...weights],
    });
  }
  
  return frontier;
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

const PortfolioOptimization = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationProgress, setOptimizationProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [optimized, setOptimized] = useState<OptimizationResult | null>(null);
  const [optimizationData, setOptimizationData] = useState<OptimizationData | null>(null);
  const [backtestResults, setBacktestResults] = useState<any>(null);
  const [backtestSeries, setBacktestSeries] = useState<any>(null);
  const [riskContribution, setRiskContribution] = useState<any>(null);
  const [fronteiraTable, setFronteiraTable] = useState<any[]>([]);
  const [applySaving, setApplySaving] = useState(false);

  // Carregar portfólio
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
          expectedReturn: (a?.expectedReturn != null && isFinite(a.expectedReturn)) 
            ? Math.max(-100, Math.min(500, Number(a.expectedReturn))) 
            : 0,
          variance: (a?.variance != null && isFinite(a.variance)) 
            ? Math.max(0, Math.min(200, Number(a.variance))) 
            : 0,
          cvar: (a?.cvar != null && isFinite(a.cvar)) 
            ? Math.max(0, Math.min(200, Number(a.cvar))) 
            : 0,
        })),
        totalReturn: data.totalReturn ?? 0,
        totalRisk: data.totalRisk ?? 0,
        totalCvar: data.totalCvar ?? undefined,
      };
      setPortfolio(p);
    } catch (err) {
      console.error("Erro ao carregar portfólio:", err);
      setError(String(err));
      toast.error(`Erro ao carregar portfólio: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Buscar dados históricos de preços
  const fetchHistoricalPrices = async (tickers: string[]): Promise<number[][]> => {
    // Simular dados históricos (em produção, buscar da API)
    const days = 252; // 1 ano de dados
    const prices: number[][] = [];
    
    for (let day = 0; day < days; day++) {
      const row: number[] = [];
      for (const ticker of tickers) {
        // Simular preço com random walk
        const basePrice = 100;
        const randomChange = (Math.random() - 0.5) * 0.02;
        const price = basePrice * Math.pow(1 + randomChange, day);
        row.push(price);
      }
      prices.push(row);
    }
    
    return prices;
  };

  // Executar otimização
  const runOptimization = async () => {
    if (!portfolio || portfolio.assets.length < 2) {
      toast.error("Portfólio precisa ter pelo menos 2 ativos");
      return;
    }

    setOptimizing(true);
    setOptimizationProgress(0);
    setError(null);

    const jobId = `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let progressInterval: NodeJS.Timeout | null = null;

    try {
      // Polling de progresso
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
        }, 500);
      };

      startProgressPolling();

      // Iniciar otimização no backend
      const optRes = await fetch(`${API_BASE}/otimizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolio_id: Number(id),
          populacao: 100,
          geracoes: 50,
          risco_peso: 1.0,
          cvar_alpha: 0.95,
          job_id: jobId,
        }),
      });

      if (progressInterval) clearInterval(progressInterval);

      if (!optRes.ok) {
        const errorData = await optRes.json().catch(() => ({}));
        throw new Error(errorData.detail || "Erro ao otimizar portfólio");
      }

      const optData = await optRes.json();
      setOptimizationProgress(100);

      // Processar resultado do backend
      const optimizedResult: OptimizationResult = {
        originalReturn: Number(optData.originalReturn ?? portfolio.totalReturn ?? 0),
        originalRisk: Number(optData.originalRisk ?? portfolio.totalRisk ?? 0),
        optimizedReturn: Number(optData.optimizedReturn ?? 0),
        optimizedRisk: Number(optData.optimizedRisk ?? 0),
        improvement: Number(optData.improvement ?? 0),
        convergenceGeneration: Number(optData.convergenceGeneration ?? 0),
        optimizedWeights: Array.isArray(optData.optimizedWeights) ? optData.optimizedWeights : [],
      };

      setOptimized(optimizedResult);
      setBacktestResults(optData.backtestResults || null);
      setBacktestSeries(optData.backtestSeries || null);
      setRiskContribution(optData.riskContribution || null);
      setFronteiraTable(Array.isArray(optData.fronteiraTable) ? optData.fronteiraTable : []);

      // Calcular fronteira eficiente localmente
      setOptimizationProgress(50);
      await calculateLocalOptimization(portfolio, optimizedResult);

      toast.success("Otimização concluída com sucesso!");
    } catch (err) {
      console.error("Erro na otimização:", err);
      setError(String(err));
      toast.error(`Erro na otimização: ${err}`);
      if (progressInterval) clearInterval(progressInterval);
    } finally {
      setOptimizing(false);
      if (progressInterval) clearInterval(progressInterval);
    }
  };

  // Calcular otimização local (fronteira eficiente)
  const calculateLocalOptimization = async (
    currentPortfolio: Portfolio,
    optimizedResult: OptimizationResult
  ) => {
    try {
      const tickers = currentPortfolio.assets.map(a => a.ticker);
      
      // Buscar preços históricos
      const prices = await fetchHistoricalPrices(tickers);
      if (prices.length === 0) return;

      // Calcular retornos logarítmicos
      const returns = calculateLogReturns(prices);
      if (returns.length === 0) return;

      // Calcular médias e covariância
      const meanReturns: number[] = [];
      for (let j = 0; j < tickers.length; j++) {
        const assetReturns = returns.map(r => r[j]);
        meanReturns.push(calculateAnnualizedMean(assetReturns));
      }

      const covMatrix = calculateCovarianceMatrix(returns);
      if (covMatrix.length === 0) return;

      // Calcular métricas do portfólio original
      const originalWeights = currentPortfolio.assets.map(a => a.weight / 100);
      const originalReturn = calculatePortfolioReturn(originalWeights, meanReturns);
      const originalRisk = calculatePortfolioRisk(originalWeights, covMatrix);
      const originalPortfolioReturns = returns.map(r =>
        originalWeights.reduce((sum, w, i) => sum + w * r[i], 0)
      );
      const originalCvar = calculatePortfolioCVaR(originalPortfolioReturns);
      const originalSharpe = calculateSharpeRatio(originalReturn, originalRisk);

      // Calcular métricas do portfólio otimizado
      const optimizedWeights = optimizedResult.optimizedWeights.map(ow => {
        const asset = currentPortfolio.assets.find(a => 
          a.ticker.replace(".SA", "").toUpperCase() === ow.ticker.replace(".SA", "").toUpperCase()
        );
        return asset ? ow.weight / 100 : 0;
      });
      
      // Normalizar pesos
      const sum = optimizedWeights.reduce((s, w) => s + w, 0);
      const normalizedOptimizedWeights = sum > 0 ? optimizedWeights.map(w => w / sum) : optimizedWeights;
      
      const optimizedReturn = calculatePortfolioReturn(normalizedOptimizedWeights, meanReturns);
      const optimizedRisk = calculatePortfolioRisk(normalizedOptimizedWeights, covMatrix);
      const optimizedPortfolioReturns = returns.map(r =>
        normalizedOptimizedWeights.reduce((sum, w, i) => sum + w * r[i], 0)
      );
      const optimizedCvar = calculatePortfolioCVaR(optimizedPortfolioReturns);
      const optimizedSharpe = calculateSharpeRatio(optimizedReturn, optimizedRisk);

      // Simular fronteira eficiente
      setOptimizationProgress(70);
      const efficientFrontier = simulateEfficientFrontier(meanReturns, covMatrix, 5000);
      const bestSharpe = optimizeBySharpe(meanReturns, covMatrix, efficientFrontier);
      const minRisk = findMinRisk(efficientFrontier);

      // Simular fronteira com CVaR
      setOptimizationProgress(85);
      const cvarFrontier = simulateCvarFrontier(returns, meanReturns, covMatrix, 5000);
      const bestCvarSharpe = optimizeBySharpe(meanReturns, covMatrix, cvarFrontier);

      setOptimizationData({
        original: {
          return: originalReturn * 100,
          risk: originalRisk * 100,
          cvar: originalCvar,
          sharpe: originalSharpe,
        },
        optimized: {
          return: optimizedReturn * 100,
          risk: optimizedRisk * 100,
          cvar: optimizedCvar,
          sharpe: optimizedSharpe,
        },
        efficientFrontier: efficientFrontier.slice(0, 1000), // Limitar para performance
        bestSharpe,
        minRisk,
        cvarFrontier: cvarFrontier.slice(0, 1000),
        bestCvarSharpe,
      });

      setOptimizationProgress(100);
    } catch (err) {
      console.error("Erro ao calcular otimização local:", err);
    }
  };

  // Aplicar otimização
  const handleApplyOptimization = async () => {
    if (!optimized || !portfolio || !id) return;
    setApplySaving(true);
    
    try {
      let updatedCount = 0;
      for (const ow of optimized.optimizedWeights) {
        const normalizedTicker = ow.ticker.replace(".SA", "").toUpperCase();
        const asset = portfolio.assets.find(a => {
          const assetTicker = a.ticker.replace(".SA", "").toUpperCase();
          return assetTicker === normalizedTicker;
        });

        if (!asset) continue;

        const res = await fetch(`${API_BASE}/portfolio/${id}/ativos/${asset.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weight: Number(ow.weight) }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Falha ao atualizar ${ow.ticker}: ${errorText}`);
        }

        updatedCount++;
      }

      if (updatedCount === 0) {
        throw new Error("Nenhum ativo foi atualizado");
      }

      toast.success(`Distribuição otimizada aplicada! ${updatedCount} ativo(s) atualizado(s).`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await loadPortfolio();
      setTimeout(() => navigate(`/portfolio/${id}`), 500);
    } catch (err) {
      console.error("Erro ao aplicar otimização:", err);
      toast.error(`Erro ao aplicar mudanças: ${err}`);
    } finally {
      setApplySaving(false);
    }
  };

  useEffect(() => {
    loadPortfolio();
  }, [id]);

  // Preparar dados para gráficos
  const markowitzChartData = useMemo(() => {
    if (!optimizationData) return [];
    
    const data = optimizationData.efficientFrontier.map(point => ({
      risk: point.risk,
      return: point.return,
      sharpe: point.sharpe,
      type: "Simulação",
    }));

    // Adicionar pontos especiais
    if (optimizationData.bestSharpe) {
      data.push({
        risk: optimizationData.bestSharpe.risk,
        return: optimizationData.bestSharpe.return,
        sharpe: optimizationData.bestSharpe.sharpe,
        type: "Melhor Sharpe",
      });
    }

    if (optimizationData.minRisk) {
      data.push({
        risk: optimizationData.minRisk.risk,
        return: optimizationData.minRisk.return,
        sharpe: optimizationData.minRisk.sharpe,
        type: "Menor Risco",
      });
    }

    // Portfólio original
    data.push({
      risk: optimizationData.original.risk,
      return: optimizationData.original.return,
      sharpe: optimizationData.original.sharpe,
      type: "Original",
    });

    // Portfólio otimizado
    data.push({
      risk: optimizationData.optimized.risk,
      return: optimizationData.optimized.return,
      sharpe: optimizationData.optimized.sharpe,
      type: "Otimizado",
    });

    return data;
  }, [optimizationData]);

  const cvarChartData = useMemo(() => {
    if (!optimizationData) return [];
    
    const data = optimizationData.cvarFrontier.map(point => ({
      risk: point.risk,
      return: point.return,
      sharpe: point.sharpe,
      type: "Simulação CVaR",
    }));

    if (optimizationData.bestCvarSharpe) {
      data.push({
        risk: optimizationData.bestCvarSharpe.risk,
        return: optimizationData.bestCvarSharpe.return,
        sharpe: optimizationData.bestCvarSharpe.sharpe,
        type: "Melhor Sharpe CVaR",
      });
    }

    data.push({
      risk: optimizationData.original.cvar,
      return: optimizationData.original.return,
      sharpe: optimizationData.original.sharpe,
      type: "Original",
    });

    data.push({
      risk: optimizationData.optimized.cvar,
      return: optimizationData.optimized.return,
      sharpe: optimizationData.optimized.sharpe,
      type: "Otimizado",
    });

    return data;
  }, [optimizationData]);

  // Função para colorir pontos pelo Sharpe
  const getSharpeColor = (sharpe: number): string => {
    if (sharpe > 1.5) return "#10b981"; // Verde - Excelente
    if (sharpe > 1.0) return "#059669"; // Verde claro - Bom
    if (sharpe > 0.5) return "#facc15"; // Amarelo - Médio
    if (sharpe > 0) return "#f97316"; // Laranja - Baixo
    return "#ef4444"; // Vermelho - Negativo
  };

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

  return (
    <div className="min-h-screen gradient-subtle">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate(`/portfolio/${id}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />Voltar
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Otimização de Portfólio</h1>
              <p className="text-muted-foreground text-sm mt-1">{portfolio.name}</p>
            </div>
          </div>
          {!optimizing && portfolio.assets.length >= 2 && (
            <Button onClick={runOptimization} disabled={optimizing}>
              <Zap className="w-4 h-4 mr-2" />
              {optimized ? "Reotimizar" : "Otimizar Portfólio"}
            </Button>
          )}
        </div>

        {/* Loading State */}
        {optimizing && (
          <Card className="p-6 mb-6 shadow-card">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Otimizando portfólio...</h3>
                  <p className="text-sm text-muted-foreground">
                    {optimizationProgress < 50 && "Executando algoritmo genético..."}
                    {optimizationProgress >= 50 && optimizationProgress < 100 && "Calculando fronteira eficiente..."}
                    {optimizationProgress >= 100 && "Concluído!"}
                    {" "}({optimizationProgress}%)
                  </p>
                </div>
              </div>
              <Progress value={optimizationProgress} className="h-3" />
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
                Clique no botão "Otimizar Portfólio" acima para iniciar a otimização.
              </p>
              <Button onClick={runOptimization} size="lg">
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
              <Button onClick={() => navigate(`/portfolio/${id}`)} variant="outline" size="lg">
                Adicionar Ativos
              </Button>
            </div>
          </Card>
        )}

        {/* Sessão 1: Comparativo Original vs Otimizado */}
        {optimized && optimizationData && !optimizing && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card className="p-6 shadow-card">
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">Portfólio Original</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Retorno Anualizado</span>
                  <span className="font-bold text-lg">
                    {optimizationData.original.return.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Risco (Desvio Padrão)</span>
                  <span className="font-bold text-lg">
                    {optimizationData.original.risk.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">CVaR (95%)</span>
                  <span className="font-bold text-lg">
                    {optimizationData.original.cvar.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm font-semibold">Sharpe Ratio</span>
                  <span className="font-bold text-lg">
                    {optimizationData.original.sharpe.toFixed(2)}
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
                  <span className="text-sm">Retorno Anualizado</span>
                  <span className="font-bold text-lg text-success">
                    {optimizationData.optimized.return.toFixed(2)}%
                    {optimizationData.optimized.return > optimizationData.original.return && (
                      <ArrowUpRight className="w-4 h-4 inline ml-1" />
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Risco (Desvio Padrão)</span>
                  <span className="font-bold text-lg">
                    {optimizationData.optimized.risk.toFixed(2)}%
                    {optimizationData.optimized.risk < optimizationData.original.risk && (
                      <ArrowDownRight className="w-4 h-4 inline ml-1 text-success" />
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">CVaR (95%)</span>
                  <span className="font-bold text-lg">
                    {optimizationData.optimized.cvar.toFixed(2)}%
                    {optimizationData.optimized.cvar < optimizationData.original.cvar && (
                      <ArrowDownRight className="w-4 h-4 inline ml-1 text-success" />
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm font-semibold">Sharpe Ratio</span>
                  <span className="font-bold text-lg text-success">
                    {optimizationData.optimized.sharpe.toFixed(2)}
                    {optimizationData.optimized.sharpe > optimizationData.original.sharpe && (
                      <ArrowUpRight className="w-4 h-4 inline ml-1" />
                    )}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Sessão 2: Gráfico Fronteira Eficiente Markowitz */}
        {optimizationData && markowitzChartData.length > 0 && !optimizing && (
          <Card className="p-6 mb-6 shadow-card">
            <div className="mb-4">
              <h2 className="font-semibold mb-1 flex items-center gap-2">
                <Target className="w-5 h-5" />
                Fronteira Eficiente de Markowitz
              </h2>
              <p className="text-sm text-muted-foreground">
                Simulação de {optimizationData.efficientFrontier.length} portfólios. 
                Pontos coloridos pelo Sharpe Ratio.
              </p>
            </div>
            <ResponsiveContainer width="100%" height={500}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  dataKey="risk"
                  name="Risco (%)"
                  label={{ value: "Risco (Desvio Padrão) %", position: "insideBottom", offset: -5 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  type="number"
                  dataKey="return"
                  name="Retorno (%)"
                  label={{ value: "Retorno Esperado %", angle: -90, position: "insideLeft" }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(val: any, name: string, props: any) => {
                    if (name === "return") return [`${Number(val).toFixed(2)}%`, "Retorno"];
                    if (name === "risk") return [`${Number(val).toFixed(2)}%`, "Risco"];
                    return [val, name];
                  }}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0]) {
                      const data = payload[0].payload;
                      return `${data.type || "Ponto"} - Sharpe: ${data.sharpe?.toFixed(2) || "N/A"}`;
                    }
                    return label;
                  }}
                />
                <Legend />
                <Scatter
                  name="Simulações"
                  data={markowitzChartData.filter(d => d.type === "Simulação")}
                  fill="#8884d8"
                  shape="circle"
                >
                  {markowitzChartData
                    .filter(d => d.type === "Simulação")
                    .map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getSharpeColor(entry.sharpe)} />
                    ))}
                </Scatter>
                <Scatter
                  name="Melhor Sharpe"
                  data={markowitzChartData.filter(d => d.type === "Melhor Sharpe")}
                  fill="#10b981"
                  shape="star"
                />
                <Scatter
                  name="Menor Risco"
                  data={markowitzChartData.filter(d => d.type === "Menor Risco")}
                  fill="#3b82f6"
                  shape="triangle"
                />
                <Scatter
                  name="Portfólio Original"
                  data={markowitzChartData.filter(d => d.type === "Original")}
                  fill="#6b7280"
                  shape="square"
                />
                <Scatter
                  name="Portfólio Otimizado"
                  data={markowitzChartData.filter(d => d.type === "Otimizado")}
                  fill="#ef4444"
                  shape="diamond"
                />
              </ScatterChart>
            </ResponsiveContainer>
            <div className="mt-4 p-3 bg-secondary rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-success"></div>
                  <span>Melhor Sharpe</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span>Menor Risco</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                  <span>Original</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span>Otimizado</span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Sessão 3: Gráfico Otimização CVaR */}
        {optimizationData && cvarChartData.length > 0 && !optimizing && (
          <Card className="p-6 mb-6 shadow-card">
            <div className="mb-4">
              <h2 className="font-semibold mb-1 flex items-center gap-2">
                <Star className="w-5 h-5" />
                Otimização usando CVaR
              </h2>
              <p className="text-sm text-muted-foreground">
                Fronteira eficiente considerando Conditional Value at Risk (CVaR).
              </p>
            </div>
            <ResponsiveContainer width="100%" height={500}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  dataKey="risk"
                  name="CVaR (%)"
                  label={{ value: "CVaR (95%) %", position: "insideBottom", offset: -5 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  type="number"
                  dataKey="return"
                  name="Retorno (%)"
                  label={{ value: "Retorno Esperado %", angle: -90, position: "insideLeft" }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(val: any, name: string) => {
                    if (name === "return") return [`${Number(val).toFixed(2)}%`, "Retorno"];
                    if (name === "risk") return [`${Number(val).toFixed(2)}%`, "CVaR"];
                    return [val, name];
                  }}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0]) {
                      const data = payload[0].payload;
                      return `${data.type || "Ponto"} - Sharpe: ${data.sharpe?.toFixed(2) || "N/A"}`;
                    }
                    return label;
                  }}
                />
                <Legend />
                <Scatter
                  name="Simulações CVaR"
                  data={cvarChartData.filter(d => d.type === "Simulação CVaR")}
                  fill="#8884d8"
                  shape="circle"
                >
                  {cvarChartData
                    .filter(d => d.type === "Simulação CVaR")
                    .map((entry, index) => (
                      <Cell key={`cell-cvar-${index}`} fill={getSharpeColor(entry.sharpe)} />
                    ))}
                </Scatter>
                <Scatter
                  name="Melhor Sharpe CVaR"
                  data={cvarChartData.filter(d => d.type === "Melhor Sharpe CVaR")}
                  fill="#10b981"
                  shape="star"
                />
                <Scatter
                  name="Portfólio Original"
                  data={cvarChartData.filter(d => d.type === "Original")}
                  fill="#6b7280"
                  shape="square"
                />
                <Scatter
                  name="Portfólio Otimizado"
                  data={cvarChartData.filter(d => d.type === "Otimizado")}
                  fill="#ef4444"
                  shape="diamond"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Backtesting */}
        {optimized && !optimizing && backtestResults && (
          <BacktestComparisonCard 
            backtestResults={backtestResults} 
            backtestSeries={backtestSeries} 
          />
        )}

        {/* Contribuição de Risco */}
        {optimized && !optimizing && riskContribution && (
          <OptimizationRiskContribution riskContribution={riskContribution} />
        )}

        {/* Tabela de Resultados do Algoritmo Genético */}
        {optimized && !optimizing && fronteiraTable.length > 0 && (
          <Card className="p-6 mb-6 shadow-card">
            <div className="mb-4">
              <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Resultados do Algoritmo Genético - Fronteira de Pareto
              </h2>
              <p className="text-sm text-muted-foreground">
                Mostrando as {fronteiraTable.length} melhores soluções encontradas pelo algoritmo genético.
                Cada linha representa uma solução não-dominada da fronteira de Pareto.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left py-3 px-4 font-semibold text-sm">#</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Retorno (%)</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Risco (%)</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">CVaR</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Sharpe</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Fitness</th>
                    {portfolio?.assets.map((asset) => (
                      <th key={asset.id} className="text-right py-3 px-4 font-semibold text-sm">
                        {asset.ticker.replace(".SA", "")} (%)
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fronteiraTable.map((sol: any, idx: number) => {
                    const isValidRet = sol?.retorno != null && isFinite(sol.retorno) && sol.retorno >= -100 && sol.retorno <= 500;
                    const isValidRisk = sol?.risco != null && isFinite(sol.risco) && sol.risco >= 0 && sol.risco <= 200;
                    const isValidCvar = sol?.cvar != null && isFinite(sol.cvar) && sol.cvar >= 0 && sol.cvar <= 200;
                    const isValidSharpe = sol?.sharpe != null && isFinite(sol.sharpe);
                    const isBest = idx === 0; // Primeira solução é a melhor
                    
                    return (
                      <tr
                        key={sol.id || idx}
                        className={`border-b border-border hover:bg-secondary/30 transition-colors ${
                          isBest ? "bg-primary/10 font-semibold" : ""
                        }`}
                      >
                        <td className="py-3 px-4 align-middle">
                          {isBest && <Star className="w-4 h-4 inline mr-1 text-primary" />}
                          {sol.id || idx + 1}
                        </td>
                        <td className={`py-3 px-4 text-right align-middle ${
                          isValidRet && sol.retorno >= 0 ? "text-success" : isValidRet ? "text-destructive" : "text-muted-foreground"
                        }`}>
                          {isValidRet ? `${sol.retorno.toFixed(2)}%` : "-"}
                        </td>
                        <td className="py-3 px-4 text-right align-middle">
                          {isValidRisk ? `${sol.risco.toFixed(2)}%` : "-"}
                        </td>
                        <td className="py-3 px-4 text-right align-middle">
                          {isValidCvar ? `${(sol.cvar * 100).toFixed(2)}%` : "-"}
                        </td>
                        <td className={`py-3 px-4 text-right align-middle ${
                          isValidSharpe && sol.sharpe > 0 ? "text-success" : "text-foreground"
                        }`}>
                          {isValidSharpe ? sol.sharpe.toFixed(3) : "-"}
                        </td>
                        <td className="py-3 px-4 text-right align-middle">
                          {sol?.fitness != null && isFinite(sol.fitness) 
                            ? sol.fitness.toFixed(4) 
                            : "-"}
                        </td>
                        {portfolio?.assets.map((asset) => {
                          // Tentar diferentes formas de buscar o peso
                          const weight = sol?.weights?.[asset.ticker] 
                            ?? sol?.weights?.[asset.ticker.replace(".SA", "")]
                            ?? sol?.weights?.[asset.ticker.toUpperCase()]
                            ?? sol?.weights?.[asset.ticker.replace(".SA", "").toUpperCase()]
                            ?? 0;
                          const isValidWeight = weight != null && isFinite(weight) && weight >= 0 && weight <= 100;
                          return (
                            <td key={asset.id} className="py-3 px-4 text-right align-middle text-sm">
                              {isValidWeight ? `${weight.toFixed(2)}%` : "0.00%"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 bg-secondary/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <Star className="w-3 h-3 inline mr-1" />
                <strong>Solução Selecionada:</strong> A primeira linha (marcada com ⭐) representa a melhor solução encontrada,
                selecionada pela heurística de menor soma normalizada dos objetivos.
              </p>
            </div>
          </Card>
        )}

        {/* Tabela de Comparação de Pesos */}
        {optimized && !optimizing && optimized.optimizedWeights.length > 0 && portfolio && (
          <Card className="p-6 mb-6 shadow-card">
            <div className="mb-4">
              <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Comparação de Distribuição de Pesos
              </h2>
              <p className="text-sm text-muted-foreground">
                Comparação entre os pesos atuais do portfólio e os pesos sugeridos pelo algoritmo genético.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left py-3 px-4 font-semibold text-sm">Ativo</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Peso Original (%)</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Peso Otimizado (%)</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Diferença (%)</th>
                    <th className="text-center py-3 px-4 font-semibold text-sm">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.assets.map((asset) => {
                    // Encontrar peso otimizado para este ativo
                    const optimizedWeight = optimized.optimizedWeights.find(
                      (ow: any) => 
                        ow.ticker?.replace(".SA", "").toUpperCase() === asset.ticker.replace(".SA", "").toUpperCase() ||
                        ow.ticker === asset.ticker
                    );
                    
                    const originalWeight = asset.weight || 0;
                    const newWeight = optimizedWeight?.weight || 0;
                    const difference = newWeight - originalWeight;
                    const isValidDiff = difference != null && isFinite(difference);
                    const isIncrease = difference > 0;
                    const isDecrease = difference < 0;
                    
                    return (
                      <tr
                        key={asset.id}
                        className="border-b border-border hover:bg-secondary/30 transition-colors"
                      >
                        <td className="py-3 px-4 align-middle">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-primary">
                                {asset.ticker.replace(".SA", "").slice(0, 2)}
                              </span>
                            </div>
                            <span className="font-medium">{asset.ticker.replace(".SA", "")}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right align-middle">
                          <span className="font-semibold">
                            {originalWeight != null && isFinite(originalWeight) 
                              ? `${Math.max(0, Math.min(100, originalWeight)).toFixed(2)}%` 
                              : "0.00%"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right align-middle">
                          <span className={`font-semibold ${
                            isIncrease ? "text-success" : isDecrease ? "text-primary" : "text-foreground"
                          }`}>
                            {newWeight != null && isFinite(newWeight) 
                              ? `${Math.max(0, Math.min(100, newWeight)).toFixed(2)}%` 
                              : "0.00%"}
                          </span>
                        </td>
                        <td className={`py-3 px-4 text-right align-middle font-semibold ${
                          isIncrease ? "text-success" : isDecrease ? "text-destructive" : "text-foreground"
                        }`}>
                          {isValidDiff ? (
                            <>
                              {isIncrease ? "+" : ""}
                              {difference.toFixed(2)}%
                            </>
                          ) : (
                            "0.00%"
                          )}
                        </td>
                        <td className="py-3 px-4 text-center align-middle">
                          {isValidDiff && Math.abs(difference) > 0.01 ? (
                            <div className="flex items-center justify-center gap-1">
                              {isIncrease ? (
                                <>
                                  <ArrowUpRight className="w-4 h-4 text-success" />
                                  <span className="text-xs text-success font-semibold">Aumentar</span>
                                </>
                              ) : isDecrease ? (
                                <>
                                  <ArrowDownRight className="w-4 h-4 text-destructive" />
                                  <span className="text-xs text-destructive font-semibold">Reduzir</span>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">Sem mudança</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem mudança</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-secondary/30 font-semibold">
                    <td className="py-3 px-4 align-middle">Total</td>
                    <td className="py-3 px-4 text-right align-middle">
                      {portfolio.assets.reduce((sum, a) => sum + (a.weight || 0), 0).toFixed(2)}%
                    </td>
                    <td className="py-3 px-4 text-right align-middle">
                      {optimized.optimizedWeights.reduce((sum: number, ow: any) => sum + (ow.weight || 0), 0).toFixed(2)}%
                    </td>
                    <td className="py-3 px-4 text-right align-middle">-</td>
                    <td className="py-3 px-4 text-center align-middle">-</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-4 p-3 bg-secondary/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <strong>Legenda:</strong> Os pesos otimizados são calculados pelo algoritmo genético para maximizar 
                o retorno esperado enquanto minimiza o risco (CVaR). A diferença mostra quanto cada ativo deve ser 
                ajustado em relação à distribuição atual.
              </p>
            </div>
          </Card>
        )}

        {/* Botão Aplicar Mudanças */}
        {optimized && !optimizing && optimized.optimizedWeights.length > 0 && (
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
                disabled={applySaving}
                size="lg"
                className="min-w-[200px]"
              >
                {applySaving ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Salvando...
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
                if (portfolio) runOptimization();
              }}
            >
              Tentar novamente
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PortfolioOptimization;
