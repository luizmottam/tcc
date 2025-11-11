import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Briefcase } from "lucide-react";
import { Portfolio } from "@/types/portfolio";

interface CreatePortfolioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreatePortfolio: (name: string) => void;
  portfolio?: Portfolio | null;
}

export const CreatePortfolioDialog = ({
  open,
  onOpenChange,
  onCreatePortfolio,
  portfolio,
}: CreatePortfolioDialogProps) => {
  const isEditMode = !!portfolio;
  const [portfolioName, setPortfolioName] = useState("");

  useEffect(() => {
    if (portfolio) {
      setPortfolioName(portfolio.name);
    } else {
      setPortfolioName("");
    }
  }, [portfolio, open]);

  const handleCreate = () => {
    if (portfolioName.trim()) {
      onCreatePortfolio(portfolioName);
      setPortfolioName("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-primary" />
            {isEditMode ? "Editar Portfólio" : "Criar Novo Portfólio"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Atualize o nome do seu portfólio."
              : "Dê um nome ao seu portfólio. Você poderá adicionar ativos depois."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nome do Portfólio</Label>
            <Input
              id="name"
              placeholder="Ex: Portfólio Conservador"
              value={portfolioName}
              onChange={(e) => setPortfolioName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={!portfolioName.trim()}>
            {isEditMode ? "Salvar" : "Criar Portfólio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
