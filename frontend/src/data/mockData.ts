import { Portfolio, Asset } from "@/types/portfolio";

export const mockAssets: Asset[] = [
  { id: "1", ticker: "PETR4", sector: "Petróleo e Gás", weight: 25, expectedReturn: 15.2, cvar: 8.5 },
  { id: "2", ticker: "VALE3", sector: "Mineração", weight: 20, expectedReturn: 12.8, cvar: 7.2 },
  { id: "3", ticker: "ITUB4", sector: "Bancos", weight: 15, expectedReturn: 10.5, cvar: 5.8 },
  { id: "4", ticker: "BBDC4", sector: "Bancos", weight: 15, expectedReturn: 9.8, cvar: 5.5 },
  { id: "5", ticker: "WEGE3", sector: "Indústria", weight: 25, expectedReturn: 18.5, cvar: 9.2 },
];

export const mockPortfolios: Portfolio[] = [
  {
    id: "1",
    name: "Portfólio Conservador",
    createdAt: new Date("2024-01-15"),
    assets: mockAssets.slice(2, 4),
    totalReturn: 10.15,
    totalRisk: 5.65,
  },
  {
    id: "2",
    name: "Portfólio Agressivo",
    createdAt: new Date("2024-02-20"),
    assets: mockAssets.slice(0, 2),
    totalReturn: 14.0,
    totalRisk: 7.85,
  },
  {
    id: "3",
    name: "Portfólio Diversificado",
    createdAt: new Date("2024-03-10"),
    assets: mockAssets,
    totalReturn: 13.36,
    totalRisk: 7.24,
  },
];

export const generatePerformanceData = (portfolioReturn: number) => {
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const selicRate = 11.75;
  
  return months.map((month, index) => {
    const variance = Math.random() * 4 - 2;
    const portfolioValue = portfolioReturn + variance + (index * 0.5);
    const selicValue = selicRate + (Math.random() * 0.5 - 0.25);
    
    return {
      month,
      portfolio: Number(portfolioValue.toFixed(2)),
      selic: Number(selicValue.toFixed(2)),
    };
  });
};

export const generateOptimizationData = (originalReturn: number, originalRisk: number) => {
  const generations = 50;
  const data = [];
  
  for (let i = 0; i <= generations; i++) {
    const progress = i / generations;
    const returnImprovement = progress * 3.5;
    const riskReduction = progress * 2.2;
    
    data.push({
      generation: i,
      return: Number((originalReturn + returnImprovement).toFixed(2)),
      risk: Number((originalRisk - riskReduction).toFixed(2)),
    });
  }
  
  return data;
};
