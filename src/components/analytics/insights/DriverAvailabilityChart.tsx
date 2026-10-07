import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { EmptyInsight, InsightTooltip } from "./InsightTooltip";
import { useInsightData } from "./use-insight-data";
import { dayBounds, holidayDays, mergeIntervals, unavailabilityIntervals } from "@/lib/analytics-insights";
import type { AnalyticsFilters } from "@/lib/analytics-builder";
import type { Activity } from "@/lib/scheduling";

const pad = (value: number) => String(value).padStart(2, "0");

/** Média de motoristas realmente disponíveis em cada hora dos dias úteis analisados. */
export function DriverAvailabilityChart({ filters, activities, height }: { filters: AnalyticsFilters; activities: Activity[]; height: number }) {
  const data = useInsightData(filters, activities);

  const rows = useMemo(() => {
    const days = data.days;
    if (!days.length || !data.drivers.length) return [];
    const blocks = new Map<string, ReturnType<typeof mergeIntervals>>();
    const holidays = new Map<string, Set<string>>();
    for (const driver of data.drivers) {
      blocks.set(
        driver.id,
        mergeIntervals([...(data.blocking.get(driver.id) ?? []), ...unavailabilityIntervals(data.unavailabilityBy.get(driver.id) ?? [])]),
      );
      holidays.set(driver.id, holidayDays(days, data.timeOffBy.get(driver.id) ?? []));
    }
    const isoDay = (day: Date) => `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;

    return Array.from({ length: 24 }, (_, hour) => {
      let sum = 0;
      let min = Number.POSITIVE_INFINITY;
      let max = 0;
      let zeroDays = 0;
      let oneDay = 0;
      for (const day of days) {
        const bounds = dayBounds(day);
        const start = bounds.start + hour * 3_600_000;
        const end = start + 3_600_000;
        let available = 0;
        for (const driver of data.drivers) {
          if (holidays.get(driver.id)?.has(isoDay(day))) continue;
          const busy = (blocks.get(driver.id) ?? []).some((item) => item.start < end && item.end > start);
          if (!busy) available += 1;
        }
        sum += available;
        min = Math.min(min, available);
        max = Math.max(max, available);
        if (available === 0) zeroDays += 1;
        if (available === 1) oneDay += 1;
      }
      return {
        name: `${pad(hour)}:00`,
        average: sum / days.length,
        min: Number.isFinite(min) ? min : 0,
        max,
        zeroDays,
        oneDay,
        days: days.length,
      };
    });
  }, [data]);

  if (!rows.length) return <EmptyInsight />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={1} stroke="var(--muted-foreground)" />
        <YAxis tick={{ fontSize: 11 }} allowDecimals stroke="var(--muted-foreground)" />
        <ChartTooltip
          content={({ active, payload }) => {
            const row = active && payload?.length ? (payload[0]!.payload as (typeof rows)[number]) : null;
            if (!row) return null;
            return (
              <InsightTooltip
                title={`${row.name} – ${pad((Number(row.name.slice(0, 2)) + 1) % 24)}:00`}
                rows={[
                  { label: "Motoristas disponíveis em média", value: row.average.toFixed(1) },
                  { label: "Mínimo observado", value: String(row.min) },
                  { label: "Máximo observado", value: String(row.max) },
                  { label: "Dias sem nenhum disponível", value: String(row.zeroDays) },
                  { label: "Dias com apenas 1 disponível", value: String(row.oneDay) },
                  { label: "Dias úteis analisados", value: String(row.days) },
                ]}
              />
            );
          }}
        />
        <Area type="monotone" dataKey="average" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.22} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
