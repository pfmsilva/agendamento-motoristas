import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EmptyInsight } from "./InsightTooltip";
import { useInsightData } from "./use-insight-data";
import { occupiedIntervalsOf, fmtHm, fmtPercent, kindOf, KIND_COLOR, MS_MINUTE } from "@/lib/analytics-insights";
import type { AnalyticsFilters } from "@/lib/analytics-builder";
import type { Activity } from "@/lib/scheduling";

type SortKey = "name" | "services" | "occupied" | "occupancy";

/** Tabela detalhada por motorista, expansível para o detalhe por TAG. */
export function DriverDetailTable({ filters, activities }: { filters: AnalyticsFilters; activities: Activity[] }) {
  const data = useInsightData(filters, activities);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "occupancy", desc: true });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => {
    const out = data.drivers.map((driver) => {
      const items = data.byDriver.get(driver.id) ?? [];
      const occupied = data.occupied.get(driver.id) ?? 0;
      const available = data.capacity.get(driver.id) ?? 0;
      const tagMap = new Map<string, { label: string; color: string; services: number; minutes: number }>();
      for (const item of items) {
        const key = item.tag_id ?? "__sem_tag";
        const current =
          tagMap.get(key) ??
          {
            label: item.tag_id ? (data.tagLabels.get(item.tag_id) ?? "TAG") : "Sem TAG",
            color: item.tag_id ? (data.semanticTagColors.get(item.tag_id) ?? data.tagColors.get(item.tag_id) ?? "var(--chart-1)") : "var(--chart-11)",
            services: 0,
            minutes: 0,
          };
        current.services += 1;
        current.minutes += occupiedIntervalsOf(item).reduce((sum, i) => sum + (i.end - i.start) / MS_MINUTE, 0);
        tagMap.set(key, current);
      }
      return {
        id: driver.id,
        name: driver.name,
        services: items.length,
        occupied,
        available,
        occupancy: available > 0 ? (occupied / available) * 100 : 0,
        admin: items.filter((item) => kindOf(item) === "administration").length,
        garage: items.filter((item) => kindOf(item) === "garage").length,
        tags: [...tagMap.values()].sort((a, b) => b.minutes - a.minutes),
      };
    });
    const factor = sort.desc ? -1 : 1;
    return out.sort((a, b) =>
      sort.key === "name" ? a.name.localeCompare(b.name, "pt-PT") * factor : (a[sort.key] - b[sort.key]) * factor,
    );
  }, [data, sort]);

  if (!rows.length) return <EmptyInsight />;

  const header = (key: SortKey, label: string, align = "text-right") => (
    <th className={`py-2 font-medium ${align}`}>
      <button
        type="button"
        className="hover:text-foreground"
        onClick={() => setSort((prev) => ({ key, desc: prev.key === key ? !prev.desc : true }))}
      >
        {label}
        {sort.key === key ? (sort.desc ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr className="border-b">
            {header("name", "Motorista", "text-left")}
            {header("services", "Serviços")}
            {header("occupied", "Horas ocupadas")}
            <th className="py-2 text-right font-medium">Horas disponíveis</th>
            {header("occupancy", "Ocupação")}
            <th className="py-2 text-right font-medium"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: KIND_COLOR.administration }} />ADMIN</span></th>
            <th className="py-2 text-right font-medium"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: KIND_COLOR.garage }} />Garagem</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <tr className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-left hover:underline"
                    onClick={() => setOpen((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
                    aria-expanded={!!open[row.id]}
                  >
                    {open[row.id] ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    {row.name}
                  </button>
                </td>
                <td className="py-2 text-right tabular-nums">{row.services}</td>
                <td className="py-2 text-right tabular-nums">{fmtHm(row.occupied)}</td>
                <td className="py-2 text-right tabular-nums">{fmtHm(row.available)}</td>
                <td className="py-2 text-right tabular-nums">{fmtPercent(row.occupancy)}</td>
                <td className="py-2 text-right tabular-nums">{row.admin}</td>
                <td className="py-2 text-right tabular-nums">{row.garage}</td>
              </tr>
              {open[row.id] && (
                <tr className="border-b bg-muted/40 last:border-0">
                  <td colSpan={7} className="px-3 py-2">
                    {row.tags.length ? (
                      <ul className="space-y-1 text-xs">
                        {row.tags.map((tag) => (
                          <li key={tag.label} className="flex items-center gap-3">
                            <span className="size-2 rounded-[2px]" style={{ background: tag.color }} />
                            <span className="w-40 truncate">{tag.label}</span>
                            <span className="tabular-nums text-muted-foreground">{tag.services} serviços</span>
                            <span className="tabular-nums text-muted-foreground">{fmtHm(tag.minutes)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sem serviços no período.</p>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
