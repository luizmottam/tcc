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
  onAddAsset: (asset: { ticker: string; sector: string; weight: number }) => void;
  asset?: Asset;
  onEditAsset?: (asset: Asset) => void;
  currentPortfolioWeights: number[]; // pesos atuais do portfólio em decimal
}

interface FormData {
  ticker: string;
  sector: string;
  weight: string; // string para input livre, convertimos depois
}

export const AddAssetDialog = ({
  open,
  onOpenChange,
  onAddAsset,
  asset,
  onEditAsset,
  currentPortfolioWeights = [],
}: AddAssetDialogProps) => {
  const isEditMode = !!asset;

  const [formData, setFormData] = useState<FormData>({
    ticker: asset?.ticker || "",
    sector: asset?.sector || "",
    weight: asset?.weight?.toString() || "",
  });

  // Estado para validação em tempo real
  const [weightValidation, setWeightValidation] = useState<{
    current: number;
    withNew: number;
    isValid: boolean;
    isWarning: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (asset) {
      setFormData({
        ticker: asset.ticker,
        sector: asset.sector,
        weight: asset.weight?.toString() || "",
      });
    } else {
      setFormData({ ticker: "", sector: "", weight: "" });
    }
    setWeightValidation(null);
  }, [asset, open]);

  // Validar peso em tempo real
  useEffect(() => {
    const weightNum = Number(formData.weight);
    if (isNaN(weightNum) || weightNum <= 0) {
      setWeightValidation(null);
      return;
    }

    // currentPortfolioWeights já vem em decimal (0-1)
    let totalWeight = currentPortfolioWeights.reduce((acc, w) => acc + w, 0);
    
    if (isEditMode && asset?.weight !== undefined) {
      // asset.weight está em porcentagem (0-100), converter para decimal
      const oldWeightDecimal = asset.weight / 100;
      totalWeight -= oldWeightDecimal;
    }

    const newWeightDecimal = weightNum / 100;
    const totalWithNew = totalWeight + newWeightDecimal;
    const totalWithNewPct = totalWithNew * 100;
    
    // Usar tolerância de 0.01% para comparações de ponto flutuante
    const isValid = totalWithNew <= 1.0001;
    const isWarning = totalWithNewPct >= 80 && totalWithNewPct <= 100.1;
    
    setWeightValidation({
      current: totalWeight * 100,
      withNew: totalWithNewPct,
      isValid,
      isWarning,
      message: isValid 
        ? `Peso total: ${totalWithNewPct.toFixed(2)}%`
        : `Peso total excede 100%: ${totalWithNewPct.toFixed(2)}%`
    });
  }, [formData.weight, currentPortfolioWeights, isEditMode, asset]);

  const handleSubmit = () => {
    const weightNum = Number(formData.weight);

    // Validação básica de campos
    if (!formData.ticker.trim() || !formData.sector.trim() || isNaN(weightNum) || weightNum <= 0) {
      alert("Preencha todos os campos corretamente. Peso deve ser maior que 0.");
      return;
    }

    // Validação de peso usando estado de validação
    if (weightValidation && !weightValidation.isValid) {
      alert(
        `Não é possível ${isEditMode ? 'atualizar' : 'adicionar'} o ativo. ${weightValidation.message}`
      );
      return;
    }

    const assetData = {
      ticker: formData.ticker.toUpperCase(),
      sector: formData.sector,
      weight: weightNum / 100, // converte % para decimal
    };

    // ==========================
    // Chamada do backend
    // ==========================
    if (isEditMode && asset && onEditAsset) {
      onEditAsset({ ...asset, ...assetData });
    } else {
      onAddAsset(assetData);
    }

    // Reset apenas no modo criação
    if (!isEditMode) {
      setFormData({ ticker: "", sector: "", weight: "" });
    }

    onOpenChange(false);
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
              {/* Ticker */}
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="ticker">Ticker</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Código do ativo. Ex: PETR4, VALE3, ITUB4.</p>
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

              {/* Setor */}
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="sector">Setor</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Indústria do ativo. Ex: Energia, Bancos, Mineração.</p>
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

            {/* Peso */}
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="weight">Peso (%)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Proporção do portfólio destinada ao ativo. Deve ser maior que 0 e não exceder 100% cumulativo.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="weight"
                  type="number"
                step="0.01"
                min="0.01"
                max="100"
                  placeholder="25"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                className={weightValidation && !weightValidation.isValid ? "border-destructive" : ""}
              />
              {weightValidation && (
                <div className={`text-xs mt-1 ${
                  !weightValidation.isValid ? "text-destructive font-semibold" :
                  weightValidation.isWarning ? "text-warning" :
                  "text-muted-foreground"
                }`}>
                  {weightValidation.isValid ? (
                    <>
                      {weightValidation.message}
                      {weightValidation.isWarning && " ⚠️ Próximo do limite"}
                    </>
                  ) : (
                    <>❌ {weightValidation.message}</>
                  )}
              </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formData.ticker.trim() || !formData.sector.trim() || !formData.weight || 
                       (weightValidation && !weightValidation.isValid)}
            >
              {isEditMode ? "Salvar Alterações" : "Adicionar Ativo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};
