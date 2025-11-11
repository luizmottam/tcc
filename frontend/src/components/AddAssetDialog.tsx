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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PlusCircle, HelpCircle } from "lucide-react";

import { Asset } from "@/types/portfolio";

interface AddAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddAsset: (asset: {
    ticker: string;
    sector: string;
    weight: number;
    expectedReturn: number;
    cvar: number;
  }) => void;
  asset?: Asset;
  onEditAsset?: (asset: Asset) => void;
}

export const AddAssetDialog = ({ open, onOpenChange, onAddAsset, asset, onEditAsset }: AddAssetDialogProps) => {
  const isEditMode = !!asset;
  const [formData, setFormData] = useState({
    ticker: asset?.ticker || "",
    sector: asset?.sector || "",
    weight: asset?.weight.toString() || "",
    expectedReturn: asset?.expectedReturn.toString() || "",
    cvar: asset?.cvar.toString() || "",
  });

  // Update form when asset changes
  useEffect(() => {
    if (asset) {
      setFormData({
        ticker: asset.ticker,
        sector: asset.sector,
        weight: asset.weight.toString(),
        expectedReturn: asset.expectedReturn.toString(),
        cvar: asset.cvar.toString(),
      });
    } else {
      setFormData({
        ticker: "",
        sector: "",
        weight: "",
        expectedReturn: "",
        cvar: "",
      });
    }
  }, [asset]);

  const handleSubmit = () => {
    if (
      formData.ticker &&
      formData.sector &&
      formData.weight &&
      formData.expectedReturn &&
      formData.cvar
    ) {
      const assetData = {
        ticker: formData.ticker.toUpperCase(),
        sector: formData.sector,
        weight: Number(formData.weight),
        expectedReturn: Number(formData.expectedReturn),
        cvar: Number(formData.cvar),
      };

      if (isEditMode && asset && onEditAsset) {
        onEditAsset({ ...asset, ...assetData });
      } else {
        onAddAsset(assetData);
      }
      
      setFormData({ ticker: "", sector: "", weight: "", expectedReturn: "", cvar: "" });
      onOpenChange(false);
    }
  };

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-primary" />
              {isEditMode ? "Editar Ativo" : "Adicionar Ativo"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode 
                ? "Atualize as informações do ativo"
                : "Preencha as informações do ativo que deseja adicionar ao portfólio"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="ticker">Ticker</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Código de negociação do ativo na bolsa. Ex: PETR4, VALE3, ITUB4.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="ticker"
                  placeholder="Ex: PETR4"
                  value={formData.ticker}
                  onChange={(e) => setFormData({ ...formData, ticker: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="sector">Setor</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Categoria ou indústria do ativo. Ex: Energia, Bancos, Mineração.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="sector"
                  placeholder="Ex: Petróleo"
                  value={formData.sector}
                  onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="weight">Peso (%)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Proporção do ativo no portfólio. A soma total deve ser 100%.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="weight"
                  type="number"
                  placeholder="25"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="return">Retorno (%)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Retorno médio esperado do ativo em determinado período.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="return"
                  type="number"
                  step="0.1"
                  placeholder="15.5"
                  value={formData.expectedReturn}
                  onChange={(e) => setFormData({ ...formData, expectedReturn: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="cvar">CVaR (%)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Conditional Value at Risk — representa a perda média esperada nos piores 5% dos cenários.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="cvar"
                  type="number"
                  step="0.1"
                  placeholder="8.2"
                  value={formData.cvar}
                  onChange={(e) => setFormData({ ...formData, cvar: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              {isEditMode ? "Salvar Alterações" : "Adicionar Ativo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};
