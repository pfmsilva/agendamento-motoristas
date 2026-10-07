import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AnalyticsOccupancyRow } from "@/lib/data";

type HourDatum = { hour: number; services: number; occupiedDays: number; minutes: number };
const readHours = (value: unknown): HourDatum[] => Array.isArray(value) ? value.filter((item): item is HourDatum => !!item && typeof item === "object" && "hour" in item) : [];
const OCCUPIED_LEVELS = 8;
const LEVEL_MIXES = [12, 23, 34, 45, 56, 67, 79, 94] as const;

const intensityLevel = (minutes: number, positiveValues: number[]) => {
  if (minutes <= 0 || positiveValues.length === 0) return 0;
  if (positiveValues.length === 1) return OCCUPIED_LEVELS;
  const rank = positiveValues.findIndex((value) => value >= minutes);
  const percentile = Math.max(0, rank) / (positiveValues.length - 1);
  return Math.min(OCCUPIED_LEVELS, 1 + Math.floor(percentile * OCCUPIED_LEVELS));
};

const levelColour = (level: number) => level === 0
  ? "var(--muted)"
  : `color-mix(in srgb, var(--primary) ${LEVEL_MIXES[level - 1]}%, var(--muted))`;

export function HourlyDensityHeatmap({ rows, from, to }: { rows: AnalyticsOccupancyRow[]; from: string; to: string }) {
  const positiveValues = useMemo(() => Array.from(new Set(rows.flatMap((row) => readHours(row.hour_data).map((item) => Number(item.minutes))).filter((minutes) => minutes > 0))).sort((a, b) => a - b), [rows]);
  const weekdays = useMemo(() => {
    let count = 0; const cursor = new Date(`${from}T12:00:00`); const end = new Date(`${to}T12:00:00`);
    while (cursor <= end) { const day = cursor.getDay(); if (day > 0 && day < 6) count += 1; cursor.setDate(cursor.getDate() + 1); }
    return count;
  }, [from, to]);
  if (!rows.length) return <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">Sem ocupação para os filtros selecionados.</div>;
  return <TooltipProvider delayDuration={80}><div className="overflow-x-auto pb-2">
    <div className="min-w-[860px]">
      <div className="grid items-end gap-1" style={{ gridTemplateColumns: "minmax(9rem,1fr) repeat(24,minmax(1.4rem,1fr))" }}><span />{Array.from({ length: 24 }, (_, hour) => <span key={hour} className="text-center text-[10px] text-muted-foreground">{String(hour).padStart(2,"0")}</span>)}</div>
      <div className="mt-2 space-y-1.5">{rows.map((row) => <div key={row.driver_id} className="grid items-center gap-1" style={{ gridTemplateColumns: "minmax(9rem,1fr) repeat(24,minmax(1.4rem,1fr))" }}>
        <span className="truncate pr-2 text-xs font-medium">{row.driver_name}</span>
        {readHours(row.hour_data).map((cell) => { const total = Number(cell.minutes); const level = intensityLevel(total, positiveValues); return <Tooltip key={cell.hour}><TooltipTrigger asChild><button type="button" aria-label={`${row.driver_name}, ${cell.hour}:00`} className="h-8 rounded-[3px] border border-primary/10 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ backgroundColor: levelColour(level) }} /></TooltipTrigger><TooltipContent className="min-w-[14rem] max-w-[17rem] p-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold leading-snug">{row.driver_name} · {String(cell.hour).padStart(2,"0")}:00–{String((cell.hour+1)%24).padStart(2,"0")}:00</p>
            <p className="text-xs text-primary-foreground/80">{from} – {to}</p>
          </div>
          <div className="mt-2.5 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 border-t border-primary-foreground/25 pt-2.5 text-xs">
            <span className="text-primary-foreground/80">Serviços</span>
            <span className="text-right font-medium">{cell.services} {cell.services === 1 ? "serviço" : "serviços"}</span>
            <span className="text-primary-foreground/80">Dias úteis ocupados</span>
            <span className="text-right font-medium">{cell.occupiedDays} {cell.occupiedDays === 1 ? "dia" : "dias"}</span>
            <span className="text-primary-foreground/80">Tempo de ocupação</span>
            <span className="text-right font-medium">{Math.floor(total/60)}h {String(total%60).padStart(2,"0")}m</span>
            <span className="text-primary-foreground/80">% dias úteis analisados</span>
            <span className="text-right font-medium">{weekdays ? Math.round(cell.occupiedDays/weekdays*100) : 0}%</span>
          </div>
        </TooltipContent></Tooltip>; })}
      </div>)}</div>
      <div className="mt-4 flex items-center justify-end gap-2 text-[10px] text-muted-foreground"><span>Menor frequência</span>{Array.from({ length: 9 }, (_, level) => <span key={level} className="size-3 rounded-[2px]" style={{ backgroundColor: levelColour(level) }} />)}<span>Maior frequência</span></div>
    </div>
  </div></TooltipProvider>;
}