import { useMemo } from "react";
import { filterRange, shiftPeriod, tagColorMap, type AnalyticsFilters } from "@/lib/analytics-builder";
import { applyFilters, buildDataset, type LookupContext, type WidgetConfig } from "@/lib/analytics-query";
import { useAdministrators, useAnalyticsOccupancy, useAssistants, useCities, useDrivers, useEventKindTags, useEventTags } from "@/lib/data";
import { semanticTagColorMap } from "@/lib/analytics-insights";
import { useReleasesVersion } from "@/lib/schedule-releases";
import { driverColorVar, type Activity } from "@/lib/scheduling";

/** Nomes e cores usados para etiquetar as dimensões das Análises. */
export function useAnalyticsLookups(): LookupContext {
  const { data: drivers = [] } = useDrivers();
  const { data: administrators = [] } = useAdministrators();
  const { data: assistants = [] } = useAssistants();
  const { data: tags = [] } = useEventTags();
  const { data: eventKindTags = [] } = useEventKindTags();
  const { data: cities = [] } = useCities();
  return useMemo(() => ({
    driverNames: new Map(drivers.map((item) => [item.id, item.name])),
    administratorNames: new Map(administrators.map((item) => [item.id, item.name])),
    assistantNames: new Map(assistants.map((item) => [item.id, item.name])),
    tagLabels: new Map(tags.map((item) => [item.id, item.label])),
    tagColors: tagColorMap(tags.map((item) => ({ id: item.id, sort_order: item.sort_order }))),
    semanticTagColors: semanticTagColorMap(eventKindTags, tags),
    driverColors: new Map(drivers.map((item) => [item.id, driverColorVar(item.id, drivers)])),
    cityNames: new Map(cities.map((item) => [item.id, item.name])),
  }), [drivers, administrators, assistants, tags, eventKindTags, cities]);
}

const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });

/** Calcula o conjunto de dados de um widget a partir da sua configuração e filtros efetivos. */
export function useWidgetDataset({ config, filters, activities }: { config: WidgetConfig; filters: AnalyticsFilters; activities: Activity[] }) {
  const ctx = useAnalyticsLookups();
  const { data: occupancy = [], isFetching } = useAnalyticsOccupancy(filters.from, filters.to, filters);
  const releasesVersion = useReleasesVersion();
  const scoped = useMemo(() => applyFilters(activities, filters), [activities, filters]);
  const previousActivities = useMemo(() => {
    if (!config.comparePrevious || filters.period === "custom") return [];
    const previous = shiftPeriod(filters, -1);
    return applyFilters(activities, previous, filterRange(previous));
  }, [activities, filters, config.comparePrevious]);
  const dataset = useMemo(() => buildDataset({ config, activities: scoped, previousActivities, occupancy, filters, ctx }), [config, scoped, previousActivities, occupancy, filters, ctx, releasesVersion]);
  const period = `${dateLabel(filters.from)} a ${dateLabel(filters.to)}`;
  return { dataset, period, isFetching };
}
