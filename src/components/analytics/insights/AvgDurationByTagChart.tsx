import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { EmptyInsight, InsightTooltip } from "./InsightTooltip";
import { useInsightData } from "./use-insight-data";
import { labelHours, segmentLabel } from "../chart-labels";
import { fmtHm, serviceInterval, MS_MINUTE } from "@/lib/analytics-insights";
import type { AnalyticsFilters } from "@/lib/analytics-builder";
import type { Activity } from "@/lib/scheduling";

const NO_TAG = "__sem_tag";

/** Duração média de serviço por motorista, repartida por TAG (uma barra por motorista). */
export function AvgDurationByTagChart({ filters, activities, height }: { filters: AnalyticsFilters; activities: Activity[]; height: number }) {
  const data = useInsightData(filters, activities);

  const { rows, tags } = useMemo(() => {
    const used = new Set<string>();
    const out = data.drivers.map((driver) => {
      const row: Record<string, string | number> = { name: driver.name };
      const items = (data.byDriver.get(driver.id) ?? []).filter((item) => item.type !== "availability");
      const groups = new Map<string, { minutes: number; count: number }>();
      for (const item of items) {
        const key = item.tag_id ?? NO_TAG;
        const current = groups.get(key) ?? { minutes: 0, count: 0 };
        const interval = serviceInterval(item);
        current.minutes += Math.max(0, (interval.end - interval.start) / MS_MINUTE);
        current.count += 1;
        groups.set(key, current);
      }
      for (const [key, value] of groups) {
        used.add(key);
        row[key] = value.count ? value.minutes / value.count / 60 : 0;
        row[`${key}__count`] = value.count;
      }
      return row;
    });
    const ordered = [...data.tagOrder.filter((id) => used.has(id)), ...(used.has(NO_TAG) ? [NO_TAG] : [])];
    return {
      rows: out.filter((row) => Object.keys(row).length > 1),
      tags: ordered.map((id) => ({
        id,
        label: id === NO_TAG ? "Sem TAG" : (data.tagLabels.get(id) ?? "TAG"),
        color: id === NO_TAG ? "var(--chart-11)" : (data.semanticTagColors.get(id) ?? data.tagColors.get(id) ?? "var(--chart-1)"),
      })),
    };
  }, [data]);

  if (!rows.length || !tags.length) return <EmptyInsight />;

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={54} stroke="var(--muted-foreground)" />
          <YAxis tick={{ fontSize: 11 }} unit="h" stroke="var(--muted-foreground)" />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]!.payload as Record<string, number | string>;
              return (
                <InsightTooltip
                  title={String(row["name"])}
                  rows={tags.flatMap((tag) => {
                    const hours = Number(row[tag.id] ?? 0);
                    const count = Number(row[`${tag.id}__count`] ?? 0);
                    if (!count) return [];
                    return [{ label: tag.label, color: tag.color, value: `${fmtHm(hours * 60)} · ${count} serviços` }];
                  })}
                />
              );
            }}
          />
          {tags.map((tag) => (
            <Bar key={tag.id} dataKey={tag.id} name={tag.label} stackId="stack" fill={tag.color}>
              <LabelList dataKey={tag.id} content={segmentLabel(labelHours, tag.color)} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {tags.map((tag) => (
          <li key={tag.id} className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ background: tag.color }} />
            {tag.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
