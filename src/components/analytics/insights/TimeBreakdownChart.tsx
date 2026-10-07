import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { EmptyInsight, InsightTooltip } from "./InsightTooltip";
import { useInsightData } from "./use-insight-data";
import { labelHours, segmentLabel, stackTotalLabel } from "../chart-labels";
import {
  calculatedInterval,
  effectiveInterval,
  occupiedIntervalsOf,
  fmtHm,
  kindSegmentColor,
  kindOf,
  serviceInterval,
  uniqueMinutes,
  KIND_LABEL,
  KIND_ORDER,
  SEGMENT_LABEL,
  type EventKind,
  type TimeSegment,
} from "@/lib/analytics-insights";
import type { AnalyticsFilters } from "@/lib/analytics-builder";
import type { Activity } from "@/lib/scheduling";

type BreakRow = { name: string; driverId: string; driverName: string; kind: EventKind; service: number; travel: number; adjust: number; total: number; count: number };

/** Serviço vs. deslocação vs. ajustes, com barras separadas para ADMIN e Garagem. */
export function TimeBreakdownChart({ filters, activities, height, period }: { filters: AnalyticsFilters; activities: Activity[]; height: number; period?: string }) {
  const data = useInsightData(filters, activities);
  const rows = useMemo(() => {
    const from = data.range.from.getTime();
    const to = data.range.to.getTime();
    const out: BreakRow[] = [];
    for (const driver of data.drivers) {
      const items = data.byDriver.get(driver.id) ?? [];
      for (const kind of KIND_ORDER) {
        const scoped = items.filter((item) => kindOf(item) === kind);
        if (!scoped.length) continue;
        const service = uniqueMinutes(scoped.flatMap((i) => occupiedIntervalsOf(i, serviceInterval)), from, to);
        const calculated = uniqueMinutes(scoped.flatMap((i) => occupiedIntervalsOf(i, calculatedInterval)), from, to);
        const effective = uniqueMinutes(scoped.flatMap((i) => occupiedIntervalsOf(i, effectiveInterval)), from, to);
        const travel = Math.max(0, calculated - service);
        const adjust = Math.max(0, effective - calculated);
        out.push({
          name: `${driver.name} · ${KIND_LABEL[kind]}`,
          driverId: driver.id,
          driverName: driver.name,
          kind,
          service: service / 60,
          travel: travel / 60,
          adjust: adjust / 60,
          total: (service + travel + adjust) / 60,
          // Número de serviços do motorista nesta categoria, no mesmo período e filtros das horas.
          count: scoped.length,
        });
      }
    }
    return out.sort((a, b) => b.total - a.total);
  }, [data]);

  /** Resumo por motorista para o detalhe: horas e nº de serviços por categoria, mais o total. */
  const byDriver = useMemo(() => {
    const map = new Map<string, BreakRow[]>();
    for (const row of rows) map.set(row.driverId, [...(map.get(row.driverId) ?? []), row]);
    return map;
  }, [rows]);

  if (!rows.length) return <EmptyInsight />;

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={Math.max(height, rows.length * 30 + 40)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 64, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} unit="h" stroke="var(--muted-foreground)" />
          <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={({ active, payload }) => {
              const first = active && payload?.length ? payload[0] : undefined;
              const row = first ? (first.payload as BreakRow) : null;
              if (!row) return null;
              const group = byDriver.get(row.driverId) ?? [row];
              const totalHours = group.reduce((sum, item) => sum + item.total, 0);
              const totalCount = group.reduce((sum, item) => sum + item.count, 0);
              return (
                <InsightTooltip
                  title={row.driverName}
                  {...(period ? { subtitle: `Período: ${period}` } : {})}
                  rows={[
                    ...KIND_ORDER.flatMap((kind) => {
                      const item = group.find((candidate) => candidate.kind === kind);
                      const count = item?.count ?? 0;
                      return [
                        { label: KIND_LABEL[kind], value: fmtHm((item?.total ?? 0) * 60), color: kindSegmentColor(kind, "service") },
                        { label: `${KIND_LABEL[kind]} · serviços`, value: `${count} ${count === 1 ? "serviço" : "serviços"}` },
                      ];
                    }),
                    /* Detalhe da barra sobre a qual o rato está. */
                    { label: `${KIND_LABEL[row.kind]} · ${SEGMENT_LABEL.service}`, value: fmtHm(row.service * 60), color: kindSegmentColor(row.kind, "service") },
                    { label: `${KIND_LABEL[row.kind]} · ${SEGMENT_LABEL.travel}`, value: fmtHm(row.travel * 60), color: kindSegmentColor(row.kind, "travel") },
                    { label: `${KIND_LABEL[row.kind]} · ${SEGMENT_LABEL.adjust}`, value: fmtHm(row.adjust * 60), color: kindSegmentColor(row.kind, "adjust") },
                    { label: "Total", value: fmtHm(totalHours * 60) },
                    { label: "Total de serviços", value: `${totalCount} ${totalCount === 1 ? "serviço" : "serviços"}` },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="service" stackId="stack">
            {rows.map((row) => <Cell key={`${row.name}-service`} fill={kindSegmentColor(row.kind, "service")} />)}
            <LabelList dataKey="service" content={segmentLabel(labelHours, (payload) => kindSegmentColor(payload?.["kind"] === "garage" ? "garage" : "administration", "service"))} />
          </Bar>
          <Bar dataKey="travel" stackId="stack">
            {rows.map((row) => <Cell key={`${row.name}-travel`} fill={kindSegmentColor(row.kind, "travel")} />)}
            <LabelList dataKey="travel" content={segmentLabel(labelHours, (payload) => kindSegmentColor(payload?.["kind"] === "garage" ? "garage" : "administration", "travel"))} />
          </Bar>
          <Bar dataKey="adjust" stackId="stack" radius={[0, 4, 4, 0]}>
            {rows.map((row) => <Cell key={`${row.name}-adjust`} fill={kindSegmentColor(row.kind, "adjust")} />)}
            <LabelList dataKey="adjust" content={segmentLabel(labelHours, (payload) => kindSegmentColor(payload?.["kind"] === "garage" ? "garage" : "administration", "adjust"))} />
            <LabelList dataKey="total" content={stackTotalLabel(labelHours, true)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {KIND_ORDER.flatMap((kind) => (["service", "travel", "adjust"] as TimeSegment[]).map((segment) => (
          <li key={`${kind}-${segment}`} className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ background: kindSegmentColor(kind, segment) }} />
            {KIND_LABEL[kind]} · {SEGMENT_LABEL[segment]}
          </li>
        )))}
      </ul>
    </div>
  );
}
