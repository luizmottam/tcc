import { Portfolio } from "@/types/portfolio";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Eye, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PortfolioCardProps {
  portfolio: Portfolio;
  onViewDetails: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  cvarThreshold?: number; // CVaR crítico para alerta (em %)
}

export const PortfolioCard = ({
  portfolio,
  onViewDetails,
  onEdit,
  onDelete,
  cvarThreshold = 10, // default: 10%
}: PortfolioCardProps) => {
  const portfolioName = portfolio.name|| "--";
  const createdAt = portfolio.createdAt ? new Date(portfolio.createdAt) : null;

  // Retorno positivo/negativo
  const isPositiveReturn = (portfolio.totalReturn ?? 0) >= 0;
  const returnText = portfolio.totalReturn != null ? `${portfolio.totalReturn.toFixed(2)}%` : "--";

  // CVaR alto / baixo
  const cvar = portfolio.totalRisk ?? 0;
  const cvarText = portfolio.totalRisk != null ? `${cvar.toFixed(2)}%` : "--";
  const isCvarHigh = cvar > cvarThreshold;

  // Classes dinâmicas
  const returnColorClass = isPositiveReturn ? "text-success" : "text-destructive";
  const cvarColorClass = isCvarHigh ? "text-destructive font-bold" : "text-foreground";

  // Fundo do card: destaque se CVaR alto
  const cardBgClass = isCvarHigh ? "bg-red-50" : "bg-white";

  return (
    <Card className={`p-6 card-hover animate-fade-in shadow-card ${cardBgClass}`}>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-1">{portfolioName}</h3>
          <p className="text-sm text-muted-foreground">
            {createdAt
              ? format(createdAt, "dd 'de' MMMM, yyyy", { locale: ptBR })
              : "--"}
          </p>
        </div>

        {isPositiveReturn ? (
          <TrendingUp className="w-5 h-5 text-success" />
        ) : (
          <TrendingDown className="w-5 h-5 text-destructive" />
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-secondary rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Retorno</p>
          <p className={`text-xl font-semibold ${returnColorClass}`}>{returnText}</p>
        </div>

        <div className="bg-secondary rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">
            CVaR (95%)
            {isCvarHigh && (
              <span className="ml-1 text-xs text-red-600 font-bold">⚠ Alto</span>
            )}
          </p>
          <p className={`text-xl ${cvarColorClass}`}>{cvarText}</p>
        </div>
      </div>

      {/* Número de ativos */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {portfolio.assets.length} {portfolio.assets.length === 1 ? "ativo" : "ativos"}
        </p>

        {/* Botões de ação */}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => onEdit(String(portfolio.id))}>
            <Pencil className="w-4 h-4" />
          </Button>

          <Button size="sm" variant="ghost" onClick={() => onDelete(String(portfolio.id))}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>

          <Button size="sm" variant="outline" onClick={() => onViewDetails(String(portfolio.id))}>
            <Eye className="w-4 h-4 mr-2" />
            Ver Detalhes
          </Button>
        </div>
      </div>
    </Card>
  );
};
