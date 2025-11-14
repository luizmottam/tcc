import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TemporalDataPoint {
  date: string;
  portfolio: number;
  base: number;
  ibovespa: number;
  selic: number;
}

interface SectoralData {
  sector: string;
  weight: number;
}

interface MetricsData {
  retorno_anual: number;
  volatilidade: number;
  cvar: number;
  sharpe: number;
  desvio_padrao: number;
}

interface AnalyticsData {
  temporal_evolution: TemporalDataPoint[];
  sectoral_allocation: SectoralData[];
  metrics: {
    portfolio_otimizado: MetricsData;
    portfolio_base: MetricsData;
    ibovespa: MetricsData;
    selic: MetricsData;
  };
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6'];

export default function PortfolioAnalytics() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'temporal' | 'sectoral' | 'metrics'>('temporal');

  useEffect(() => {
    const API_BASE = ((import.meta as any).env?.VITE_API_URL as string | undefined) ?? "http://localhost:8000";
    
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/portfolio/${id}/analytics`);
        if (!response.ok) {
          throw new Error('Erro ao carregar análises');
        }
        const data = await response.json();
        setAnalytics(data);
      } catch (error) {
        console.error('Erro:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar as análises. Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchAnalytics();
    }
  }, [id, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="text-red-500" />
              Erro ao carregar análises
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Não foi possível carregar os dados de análise do portfólio.
            </p>
            <Button onClick={() => navigate(-1)} className="w-full">
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const performanceMetrics = analytics.metrics;
  const portfolioReturn = performanceMetrics.portfolio_otimizado.retorno_anual;
  const baseReturn = performanceMetrics.portfolio_base.retorno_anual;
  const improvement = portfolioReturn - baseReturn;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="lg"
              onClick={() => navigate(-1)}
              className="h-10 w-10 p-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Análise do Portfólio</h1>
              <p className="text-gray-600">Visualizar desempenho, alocação e métricas</p>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Retorno Portfólio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold">{portfolioReturn.toFixed(2)}%</div>
                {portfolioReturn >= 0 ? (
                  <TrendingUp className="text-green-500" size={20} />
                ) : (
                  <TrendingDown className="text-red-500" size={20} />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Retorno Base</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold">{baseReturn.toFixed(2)}%</div>
                {baseReturn >= 0 ? (
                  <TrendingUp className="text-green-500" size={20} />
                ) : (
                  <TrendingDown className="text-red-500" size={20} />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Melhoria</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className={`text-2xl font-bold ${improvement >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {improvement >= 0 ? '+' : ''}{improvement.toFixed(2)}%
                </div>
                {improvement >= 0 ? (
                  <TrendingUp className="text-green-500" size={20} />
                ) : (
                  <TrendingDown className="text-red-500" size={20} />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Volatilidade</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{performanceMetrics.portfolio_otimizado.volatilidade.toFixed(2)}%</div>
              <p className="text-xs text-gray-500 mt-1">Risco anualizado</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('temporal')}
            className={`px-4 py-3 font-medium text-sm border-b-2 ${
              activeTab === 'temporal'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            📈 Evolução Temporal
          </button>
          <button
            onClick={() => setActiveTab('sectoral')}
            className={`px-4 py-3 font-medium text-sm border-b-2 ${
              activeTab === 'sectoral'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            🎯 Alocação Setorial
          </button>
          <button
            onClick={() => setActiveTab('metrics')}
            className={`px-4 py-3 font-medium text-sm border-b-2 ${
              activeTab === 'metrics'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            📊 Indicadores
          </button>
        </div>

        {/* Content */}
        {activeTab === 'temporal' && (
          <Card>
            <CardHeader>
              <CardTitle>Evolução Temporal</CardTitle>
              <CardDescription>
                Comparação do retorno do portfólio otimizado com base, Ibovespa e SELIC (últimos 2 anos)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={analytics.temporal_evolution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    interval={Math.floor(analytics.temporal_evolution.length / 10)}
                  />
                  <YAxis label={{ value: 'Retorno (%)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip
                    formatter={(value) => `${(value as number).toFixed(2)}%`}
                    labelStyle={{ color: '#000' }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="portfolio"
                    stroke="#3b82f6"
                    dot={false}
                    name="Portfólio Otimizado"
                  />
                  <Line
                    type="monotone"
                    dataKey="base"
                    stroke="#10b981"
                    dot={false}
                    name="Portfólio Base"
                    strokeDasharray="5 5"
                  />
                  <Line
                    type="monotone"
                    dataKey="ibovespa"
                    stroke="#ef4444"
                    dot={false}
                    name="Ibovespa"
                  />
                  <Line
                    type="monotone"
                    dataKey="selic"
                    stroke="#f59e0b"
                    dot={false}
                    name="SELIC"
                    strokeDasharray="3 3"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {activeTab === 'sectoral' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Alocação Setorial</CardTitle>
                <CardDescription>Distribuição de peso por setor</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={analytics.sectoral_allocation}
                      dataKey="weight"
                      nameKey="sector"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label
                    >
                      {analytics.sectoral_allocation.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${(value as number).toFixed(2)}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Detalhes por Setor</CardTitle>
                <CardDescription>Peso alocado em cada setor</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analytics.sectoral_allocation.map((sector, index) => (
                    <div key={sector.sector} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="text-sm font-medium">{sector.sector}</span>
                      </div>
                      <span className="text-sm font-bold">{sector.weight.toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Metrics Table */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Indicadores Quantitativos</CardTitle>
                <CardDescription>Comparação de métricas entre portfólios e benchmarks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Indicador</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">Portfólio Otimizado</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">Portfólio Base</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">Ibovespa</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">SELIC</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-gray-700">Retorno Anual</td>
                        <td className="text-right py-3 px-4 text-blue-600 font-semibold">
                          {performanceMetrics.portfolio_otimizado.retorno_anual.toFixed(2)}%
                        </td>
                        <td className="text-right py-3 px-4 text-green-600 font-semibold">
                          {performanceMetrics.portfolio_base.retorno_anual.toFixed(2)}%
                        </td>
                        <td className="text-right py-3 px-4 text-red-600 font-semibold">
                          {performanceMetrics.ibovespa.retorno_anual.toFixed(2)}%
                        </td>
                        <td className="text-right py-3 px-4 text-amber-600 font-semibold">
                          {performanceMetrics.selic.retorno_anual.toFixed(2)}%
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-gray-700">Volatilidade (ao ano)</td>
                        <td className="text-right py-3 px-4 text-blue-600 font-semibold">
                          {performanceMetrics.portfolio_otimizado.volatilidade.toFixed(2)}%
                        </td>
                        <td className="text-right py-3 px-4 text-green-600 font-semibold">
                          {performanceMetrics.portfolio_base.volatilidade.toFixed(2)}%
                        </td>
                        <td className="text-right py-3 px-4 text-red-600 font-semibold">
                          {performanceMetrics.ibovespa.volatilidade.toFixed(2)}%
                        </td>
                        <td className="text-right py-3 px-4 text-amber-600 font-semibold">
                          {performanceMetrics.selic.volatilidade.toFixed(2)}%
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-gray-700">CVaR (Risco)</td>
                        <td className="text-right py-3 px-4 text-blue-600 font-semibold">
                          {performanceMetrics.portfolio_otimizado.cvar.toFixed(2)}%
                        </td>
                        <td className="text-right py-3 px-4 text-green-600 font-semibold">
                          {performanceMetrics.portfolio_base.cvar.toFixed(2)}%
                        </td>
                        <td className="text-right py-3 px-4 text-red-600 font-semibold">
                          {performanceMetrics.ibovespa.cvar.toFixed(2)}%
                        </td>
                        <td className="text-right py-3 px-4 text-amber-600 font-semibold">
                          {performanceMetrics.selic.cvar.toFixed(2)}%
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-gray-700">Índice de Sharpe</td>
                        <td className="text-right py-3 px-4 text-blue-600 font-semibold">
                          {performanceMetrics.portfolio_otimizado.sharpe.toFixed(3)}
                        </td>
                        <td className="text-right py-3 px-4 text-green-600 font-semibold">
                          {performanceMetrics.portfolio_base.sharpe.toFixed(3)}
                        </td>
                        <td className="text-right py-3 px-4 text-red-600 font-semibold">
                          {performanceMetrics.ibovespa.sharpe.toFixed(3)}
                        </td>
                        <td className="text-right py-3 px-4 text-amber-600 font-semibold">
                          {performanceMetrics.selic.sharpe.toFixed(3)}
                        </td>
                      </tr>
                      <tr className="hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-gray-700">Desvio Padrão</td>
                        <td className="text-right py-3 px-4 text-blue-600 font-semibold">
                          {performanceMetrics.portfolio_otimizado.desvio_padrao.toFixed(2)}%
                        </td>
                        <td className="text-right py-3 px-4 text-green-600 font-semibold">
                          {performanceMetrics.portfolio_base.desvio_padrao.toFixed(2)}%
                        </td>
                        <td className="text-right py-3 px-4 text-red-600 font-semibold">
                          {performanceMetrics.ibovespa.desvio_padrao.toFixed(2)}%
                        </td>
                        <td className="text-right py-3 px-4 text-amber-600 font-semibold">
                          {performanceMetrics.selic.desvio_padrao.toFixed(2)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Insights */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Insights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {improvement > 0 ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800">
                      ✓ O portfólio otimizado superou a base em <strong>{improvement.toFixed(2)}%</strong> de retorno anual.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      ⚠ O portfólio otimizado teve desempenho <strong>{Math.abs(improvement).toFixed(2)}%</strong> inferior à base.
                    </p>
                  </div>
                )}

                {performanceMetrics.portfolio_otimizado.sharpe > performanceMetrics.portfolio_base.sharpe && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      ✓ Melhor índice de Sharpe: {performanceMetrics.portfolio_otimizado.sharpe.toFixed(3)} vs {performanceMetrics.portfolio_base.sharpe.toFixed(3)} (base)
                    </p>
                  </div>
                )}

                {performanceMetrics.portfolio_otimizado.volatilidade < performanceMetrics.portfolio_base.volatilidade && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      ✓ Menor volatilidade: {performanceMetrics.portfolio_otimizado.volatilidade.toFixed(2)}% vs {performanceMetrics.portfolio_base.volatilidade.toFixed(2)}% (base)
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
