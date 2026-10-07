import { useMemo } from "react";
import { CalendarRange, Copy, GripVertical, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { KpiFormulaTooltip } from "./KpiFormulaTooltip";
import { ChartLegend, ChartRenderer } from "./ChartRenderer";
import { HourlyDensityHeatmap } from "./HourlyDensityHeatmap";
import { AvgDurationByTagChart } from "./insights/AvgDurationByTagChart";
import { DriverAvailabilityChart } from "./insights/DriverAvailabilityChart";
import { DriverDetailTable } from "./insights/DriverDetailTable";
import { DriverOccupancyChart } from "./insights/DriverOccupancyChart";
import { OccupancyEvolutionChart } from "./insights/OccupancyEvolutionChart";
import { TimeBreakdownChart } from "./insights/TimeBreakdownChart";
import { TravelAccuracyTable } from "./insights/TravelAccuracyTable";
import { useWidgetDataset } from "./use-widget-dataset";
import { parseFilters, periodLabel, widgetPeriodLabel, type AnalyticsFilters } from "@/lib/analytics-builder";
import { insightInfo } from "@/lib/analytics-insights";
import { measure, parseWidgetConfig } from "@/lib/analytics-query";
import { useAnalyticsOccupancy, type AnalyticsWidget as Widget } from "@/lib/data";
import type { Activity } from "@/lib/scheduling";

type Props = {
  widget: Widget;
  filters: AnalyticsFilters;
  activities: Activity[];
  editable: boolean;
  dragHandleProps?: Record<string, unknown>;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

export function AnalyticsWidget({ widget, filters, activities, editable, dragHandleProps, onEdit, onDuplicate, onDelete }: Props) {
  const config = useMemo(() => parseWidgetConfig(widget), [widget]);
  const effectiveFilters = useMemo(
    () => (widget.follows_global_filters ? filters : parseFilters(widget.filters)),
    [widget.follows_global_filters, widget.filters, filters],
  );
  const { dataset, period } = useWidgetDataset({ config, filters: effectiveFilters, activities });
  const insight = insightInfo(widget.metric_key);
  const definition = insight ?? measure(config.values[0]?.measure);
  const height = Math.max(180, (widget.grid_h ?? 3) * 70);
  /** A densidade horária mantém o mapa dedicado (horas nas colunas, motoristas nas linhas). */
  const isHourlyDensity = widget.metric_key === "hourly_density";
  const { data: occupancyRows = [] } = useAnalyticsOccupancy(effectiveFilters.from, effectiveFilters.to, effectiveFilters);
  /** Período efetivamente analisado por esta análise (global ou próprio). */
  const activePeriod = periodLabel(effectiveFilters);

  return (
    <Card className="h-full overflow-hidden rounded-xl">
      <CardHeader className="flex-row items-start justify-between space-y-0 border-b p-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1">
            {editable && (
              <Button {...dragHandleProps} variant="ghost" size="icon" className="size-7 cursor-grab" aria-label="Mover análise">
                <GripVertical />
              </Button>
            )}
            <CardTitle className="truncate text-sm">{widget.title}</CardTitle>
            <KpiFormulaTooltip definition={definition} filters={effectiveFilters} />
          </div>
          <p className={`flex items-center gap-1 truncate text-xs text-muted-foreground ${editable ? "pl-8" : ""}`}>
            <CalendarRange className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              {widgetPeriodLabel(effectiveFilters)}
              {widget.follows_global_filters ? "" : " · período próprio"}
            </span>
          </p>
        </div>
        {editable && (
          <div className="flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label="Opções da análise"><MoreHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}><Pencil />Editar</DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}><Copy />Duplicar</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={onDelete}><Trash2 />Remover</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-4">
        {isHourlyDensity ? (
          <HourlyDensityHeatmap rows={occupancyRows} from={effectiveFilters.from} to={effectiveFilters.to} />
        ) : widget.metric_key === "driver_occupancy" ? (
          <DriverOccupancyChart filters={effectiveFilters} activities={activities} height={height} period={activePeriod} />
        ) : widget.metric_key === "occupancy_evolution" ? (
          <OccupancyEvolutionChart filters={effectiveFilters} activities={activities} height={height} />
        ) : widget.metric_key === "time_breakdown" ? (
          <TimeBreakdownChart filters={effectiveFilters} activities={activities} height={height} period={activePeriod} />
        ) : widget.metric_key === "avg_duration_by_tag" ? (
          <AvgDurationByTagChart filters={effectiveFilters} activities={activities} height={height} />
        ) : widget.metric_key === "travel_accuracy" ? (
          <TravelAccuracyTable filters={effectiveFilters} activities={activities} />
        ) : widget.metric_key === "driver_availability" ? (
          <DriverAvailabilityChart filters={effectiveFilters} activities={activities} height={height} />
        ) : widget.metric_key === "driver_detail" ? (
          <DriverDetailTable filters={effectiveFilters} activities={activities} />
        ) : (
          <>
            <ChartRenderer dataset={dataset} period={period} height={height} />
            <ChartLegend dataset={dataset} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
