import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AnalyticsFilters } from "@/lib/analytics-builder";

/** Documentação apresentada no ícone "i": reflete o cálculo implementado. */
export type FormulaDefinition = {
  label: string;
  description: string;
  formula: string;
  included: string;
  excluded: string;
  assumptions: string;
};

export function KpiFormulaTooltip({ definition, filters }: { definition: FormulaDefinition; filters: AnalyticsFilters }) {
  const period = `${new Date(`${filters.from}T00:00:00`).toLocaleDateString("pt-PT")} – ${new Date(`${filters.to}T00:00:00`).toLocaleDateString("pt-PT")}`;
  const filterCount = filters.driverIds.length + filters.administratorIds.length + filters.assistantIds.length + filters.tagIds.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label={`Ver fórmula de ${definition.label}`}>
          <Info className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] space-y-3 text-xs">
        <div><p className="font-semibold">Fórmula</p><p className="mt-1 rounded-md bg-muted p-2 font-mono text-[11px]">{definition.formula}</p></div>
        <div><p className="font-semibold">O que representa</p><p className="text-muted-foreground">{definition.description}</p></div>
        <div><p className="font-semibold">Inclui</p><p className="text-muted-foreground">{definition.included}</p></div>
        <div><p className="font-semibold">Exclui</p><p className="text-muted-foreground">{definition.excluded}</p></div>
        <div><p className="font-semibold">Pressupostos</p><p className="text-muted-foreground">{definition.assumptions}</p></div>
        <div className="border-t pt-2 text-muted-foreground"><p><strong className="text-foreground">Período:</strong> {period}</p><p><strong className="text-foreground">Filtros específicos:</strong> {filterCount || "Nenhum"}</p></div>
      </PopoverContent>
    </Popover>
  );
}