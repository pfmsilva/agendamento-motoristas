import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { EmptyInsight, InsightTooltip } from "./InsightTooltip";
import { useInsightData } from "./use-insight-data";
import { labelPercent, outsideLabel } from "../chart-labels";
import { fmtHm, fmtPercent } from "@/lib/analytics-insights";
import type { AnalyticsFilters } from "@/lib/analytics-builder";
import { driverColorVar, type Activity } from "@/lib/scheduling";

/** Ocupação por motorista: % de ocupação com horas ocupadas e disponíveis. */
export function DriverOccupancyChart({ filters, activities, height, period }: { filters: AnalyticsFilters; activities: Activity[]; height: number; period: string }) {
  const data = useInsightData(filters, activities);
  const rows = useMemo(
    () =>
      data.drivers
        .map((driver) => {
          const occupied = data.occupied.get(driver.id) ?? 0;
          const available = data.capacity.get(driver.id) ?? 0;
          return {
            id: driver.id,
            color: driverColorVar(driver.id, data.drivers),
            name: driver.name,
            occupancy: available > 0 ? (occupied / available) * 100 : 0,
            occupied,
            available,
            services: (data.byDriver.get(driver.id) ?? []).length,
          };
        })
        .sort((a, b) => b.occupancy - a.occupancy),
    [data],
  );

  if (!rows.length) return <EmptyInsight />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={54} stroke="var(--muted-foreground)" />
        <YAxis tick={{ fontSize: 11 }} unit="%" stroke="var(--muted-foreground)" />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={({ active, payload }) => {
            const row = active && payload?.length ? (payload[0]!.payload as (typeof rows)[number]) : null;
            if (!row) return null;
            return (
              <InsightTooltip
                title={row.name}
                subtitle={`Período: ${period}`}
                rows={[
                  { label: "Serviços", value: String(row.services) },
                  { label: "Horas ocupadas", value: fmtHm(row.occupied) },
                  { label: "Horas disponíveis", value: fmtHm(row.available) },
                  { label: "Ocupação", value: fmtPercent(row.occupancy) },
                ]}
              />
            );
          }}
        />
        {/* Cada barra usa a cor do perfil do motorista. */}
        <Bar dataKey="occupancy" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {rows.map((row) => <Cell key={row.id} fill={row.color} />)}
          <LabelList dataKey="occupancy" content={outsideLabel(labelPercent)} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
