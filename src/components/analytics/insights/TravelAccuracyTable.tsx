import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyInsight } from "./InsightTooltip";
import { useInsightData } from "./use-insight-data";
import { calculatedInterval, effectiveInterval, serviceInterval, MS_MINUTE } from "@/lib/analytics-insights";
import type { AnalyticsFilters } from "@/lib/analytics-builder";
import type { Activity } from "@/lib/scheduling";

type GroupBy = "route" | "driver" | "city";

const GROUP_LABEL: Record<GroupBy, string> = { route: "Rota (origem → destino)", driver: "Motorista", city: "Cidade de destino" };

/** Compara a deslocação configurada com a deslocação final ajustada. */
export function TravelAccuracyTable({ filters, activities }: { filters: AnalyticsFilters; activities: Activity[] }) {
  const data = useInsightData(filters, activities);
  const [groupBy, setGroupBy] = useState<GroupBy>("route");

  const rows = useMemo(() => {
    const driverNames = new Map(data.drivers.map((driver) => [driver.id, driver.name]));
    const groups = new Map<string, { label: string; calculated: number; adjusted: number; trips: number }>();
    for (const item of data.scoped) {
      const service = serviceInterval(item);
      const serviceMinutes = Math.max(0, (service.end - service.start) / MS_MINUTE);
      const calculatedTotal = Math.max(0, (calculatedInterval(item).end - calculatedInterval(item).start) / MS_MINUTE);
      const effectiveTotal = Math.max(0, (effectiveInterval(item).end - effectiveInterval(item).start) / MS_MINUTE);
      const calculated = Math.max(0, calculatedTotal - serviceMinutes);
      const adjusted = Math.max(0, effectiveTotal - serviceMinutes);
      if (!calculated && !adjusted) continue;

      const origin = item.origin_city_id ? data.cityNames.get(item.origin_city_id) : null;
      const destination = item.city_id ? data.cityNames.get(item.city_id) : null;
      const label =
        groupBy === "driver"
          ? (item.driver_id ? (driverNames.get(item.driver_id) ?? "Motorista") : "Sem motorista")
          : groupBy === "city"
            ? (destination ?? item.destination ?? "Sem cidade")
            : `${origin ?? item.origin ?? "Origem"} → ${destination ?? item.destination ?? "Destino"}`;
      const current = groups.get(label) ?? { label, calculated: 0, adjusted: 0, trips: 0 };
      current.calculated += calculated;
      current.adjusted += adjusted;
      current.trips += 1;
      groups.set(label, current);
    }
    return [...groups.values()]
      .map((group) => {
        const avgCalculated = group.calculated / group.trips;
        const avgAdjusted = group.adjusted / group.trips;
        const diff = avgAdjusted - avgCalculated;
        return {
          ...group,
          avgCalculated,
          avgAdjusted,
          diff,
          diffPercent: avgCalculated > 0 ? (diff / avgCalculated) * 100 : null,
        };
      })
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [data, groupBy]);

  const signed = (value: number, unit: string) => `${value > 0 ? "+" : ""}${Math.round(value)} ${unit}`;

  return (
    <div className="space-y-3">
      <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupBy)}>
        <SelectTrigger className="h-8 w-60 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(GROUP_LABEL) as GroupBy[]).map((key) => (
            <SelectItem key={key} value={key}>{GROUP_LABEL[key]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!rows.length ? (
        <EmptyInsight message="Sem deslocações no período selecionado." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 text-left font-medium">{GROUP_LABEL[groupBy]}</th>
                <th className="py-2 text-right font-medium">Viagens</th>
                <th className="py-2 text-right font-medium">Calculada (média)</th>
                <th className="py-2 text-right font-medium">Ajustada (média)</th>
                <th className="py-2 text-right font-medium">Diferença</th>
                <th className="py-2 text-right font-medium">Diferença %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <td className="py-2 pr-3">{row.label}</td>
                  <td className="py-2 text-right tabular-nums">{row.trips}</td>
                  <td className="py-2 text-right tabular-nums">{Math.round(row.avgCalculated)} min</td>
                  <td className="py-2 text-right tabular-nums">{Math.round(row.avgAdjusted)} min</td>
                  <td className={`py-2 text-right tabular-nums ${row.diff > 0 ? "text-destructive" : ""}`}>{signed(row.diff, "min")}</td>
                  <td className="py-2 text-right tabular-nums">{row.diffPercent === null ? "—" : signed(row.diffPercent, "%")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
