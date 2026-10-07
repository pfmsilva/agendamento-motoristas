import { useMemo, useState } from "react";
import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyInsight, InsightTooltip } from "./InsightTooltip";
import { useInsightData } from "./use-insight-data";
import { labelHours, labelPercent, pointLabel } from "../chart-labels";
import {
  buildBuckets,
  capacityMinutes,
  defaultGrain,
  fmtHm,
  fmtPercent,
  uniqueMinutes,
  GRAIN_LABEL,
  type Grain,
} from "@/lib/analytics-insights";
import { type AnalyticsFilters } from "@/lib/analytics-builder";
import { driverColorVar, type Activity } from "@/lib/scheduling";

type Metric = "occupancy" | "hours";

/** Evolução da ocupação ao longo do tempo, uma linha por motorista. */
export function OccupancyEvolutionChart({ filters, activities, height }: { filters: AnalyticsFilters; activities: Activity[]; height: number }) {
  const data = useInsightData(filters, activities);
  const [grain, setGrain] = useState<Grain | "auto">("auto");
  const [metric, setMetric] = useState<Metric>("occupancy");
  const effectiveGrain: Grain = grain === "auto" ? defaultGrain(filters.period) : grain;

  const { rows, series } = useMemo(() => {
    const buckets = buildBuckets(data.range.from, data.range.to, effectiveGrain);
    /** Cada motorista usa a cor do seu perfil, igual à do calendário. */
    const lines = data.drivers.map((driver) => ({ id: driver.id, name: driver.name, color: driverColorVar(driver.id, data.drivers) }));
    const out = buckets.map((bucket) => {
      const row: Record<string, string | number> = { name: bucket.label };
      for (const driver of data.drivers) {
        const occupied = uniqueMinutes(data.blocking.get(driver.id) ?? [], bucket.from, bucket.to);
        const available = capacityMinutes(bucket.days, data.timeOffBy.get(driver.id) ?? [], data.unavailabilityBy.get(driver.id) ?? []);
        row[`${driver.id}__occupied`] = occupied;
        row[`${driver.id}__available`] = available;
        row[driver.id] = metric === "hours" ? occupied / 60 : available > 0 ? (occupied / available) * 100 : 0;
      }
      return row;
    });
    return { rows: out, series: lines };
  }, [data, effectiveGrain, metric]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={metric} onValueChange={(value) => setMetric(value as Metric)}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="occupancy">Ocupação (%)</SelectItem>
            <SelectItem value="hours">Horas ocupadas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={grain} onValueChange={(value) => setGrain(value as Grain | "auto")}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Automático ({GRAIN_LABEL[defaultGrain(filters.period)]})</SelectItem>
            {(["day", "week", "month", "semester", "year"] as Grain[]).map((item) => (
              <SelectItem key={item} value={item}>{GRAIN_LABEL[item]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!rows.length || !series.length ? (
        <EmptyInsight />
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 11 }} unit={metric === "hours" ? "h" : "%"} stroke="var(--muted-foreground)" />
            <ChartTooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]!.payload as Record<string, number | string>;
                return (
                  <InsightTooltip
                    title={String(label)}
                    rows={series.flatMap((line) => {
                      const occupied = Number(row[`${line.id}__occupied`] ?? 0);
                      const available = Number(row[`${line.id}__available`] ?? 0);
                      if (!occupied && !available) return [];
                      return [
                        {
                          label: line.name,
                          color: line.color,
                          value:
                            metric === "hours"
                              ? fmtHm(occupied)
                              : `${fmtPercent(available > 0 ? (occupied / available) * 100 : 0)} · ${fmtHm(occupied)} de ${fmtHm(available)}`,
                        },
                      ];
                    })}
                  />
                );
              }}
            />
            {series.map((line) => {
              /* Só rotulamos pontos quando há poucos, para não sobrecarregar o gráfico. */
              const showLabels = rows.length <= 8 && series.length <= 2;
              return (
                <Line key={line.id} type="monotone" dataKey={line.id} name={line.name} stroke={line.color} strokeWidth={2} dot={showLabels}>
                  {showLabels && <LabelList dataKey={line.id} content={pointLabel(metric === "hours" ? labelHours : labelPercent)} />}
                </Line>
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.map((line) => (
          <li key={line.id} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: line.color }} />
            {line.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
