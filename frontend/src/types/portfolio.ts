export interface Asset {
  id: string;
  ticker: string;
  sector: string;
  weight: number;
  expectedReturn: number;
  variance: number;
  cvar: number;
  currentPrice?: number;
}

export interface Portfolio {
  id: string;
  name: string;
  createdAt: Date;
  assets: Asset[];
  totalReturn?: number;
  totalRisk?: number;
  totalCvar?: number;
}

export interface OptimizationResult {
  originalReturn: number;
  originalRisk: number;
  optimizedReturn: number;
  optimizedRisk: number;
  improvement: number;
  convergenceGeneration: number;
  optimizedWeights: { ticker: string; weight: number }[];
}
