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
}

export const PortfolioCard = ({ portfolio, onViewDetails, onEdit, onDelete }: PortfolioCardProps) => {
  const isPositiveReturn = (portfolio.totalReturn || 0) > 0;

  return (
    <Card className="p-6 card-hover animate-fade-in shadow-card">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-1">{portfolio.name}</h3>
          <p className="text-sm text-muted-foreground">
            {format(portfolio.createdAt, "dd 'de' MMMM, yyyy", { locale: ptBR })}
          </p>
        </div>
        {isPositiveReturn ? (
          <TrendingUp className="w-5 h-5 text-success" />
        ) : (
          <TrendingDown className="w-5 h-5 text-destructive" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-secondary rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Retorno</p>
          <p className={`text-xl font-semibold ${isPositiveReturn ? "text-success" : "text-destructive"}`}>
            {portfolio.totalReturn?.toFixed(2)}%
          </p>
        </div>
        <div className="bg-secondary rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">CVaR (95%)</p>
          <p className="text-xl font-semibold text-foreground">
            {portfolio.totalRisk?.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {portfolio.assets.length} {portfolio.assets.length === 1 ? "ativo" : "ativos"}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(portfolio.id)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(portfolio.id)}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onViewDetails(portfolio.id)}
          >
            <Eye className="w-4 h-4 mr-2" />
            Ver Detalhes
          </Button>
        </div>
      </div>
    </Card>
  );
};
