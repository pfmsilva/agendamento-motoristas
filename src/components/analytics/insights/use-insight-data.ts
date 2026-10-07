import { useMemo } from "react";
import { filterRange, tagColorMap, type AnalyticsFilters } from "@/lib/analytics-builder";
import { applyFilters } from "@/lib/analytics-query";
import {
  capacityMinutes,
  occupiedIntervalsOf,
  uniqueMinutes,
  workingDays,
  semanticTagColorMap,
  type Interval,
} from "@/lib/analytics-insights";
import { useCities, useDrivers, useEventKindTags, useEventTags, useTimeOff, useUnavailability } from "@/lib/data";
import { useReleasesVersion } from "@/lib/schedule-releases";
import type { Activity, Driver, TimeOff, Unavailability } from "@/lib/scheduling";

export type InsightData = {
  range: { from: Date; to: Date };
  days: Date[];
  drivers: Driver[];
  scoped: Activity[];
  byDriver: Map<string, Activity[]>;
  timeOffBy: Map<string, TimeOff[]>;
  unavailabilityBy: Map<string, Unavailability[]>;
  capacity: Map<string, number>;
  occupied: Map<string, number>;
  blocking: Map<string, Interval[]>;
  tagLabels: Map<string, string>;
  tagColors: Map<string, string>;
  semanticTagColors: Map<string, string>;
  tagOrder: string[];
  cityNames: Map<string, string>;
};

/** Base partilhada das análises pré-definidas: mesmos eventos do calendário. */
export function useInsightData(filters: AnalyticsFilters, activities: Activity[]): InsightData {
  const { data: drivers = [] } = useDrivers();
  const { data: timeOff = [] } = useTimeOff();
  const { data: unavailability = [] } = useUnavailability();
  const { data: tags = [] } = useEventTags();
  const { data: eventKindTags = [] } = useEventKindTags();
  const { data: cities = [] } = useCities();
  const releasesVersion = useReleasesVersion();

  return useMemo(() => {
    const range = filterRange(filters);
    const scoped = applyFilters(activities, filters, range);
    const visible = drivers
      .filter((driver) => driver.active && (!filters.driverIds.length || filters.driverIds.includes(driver.id)))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
    const days = workingDays(range.from, range.to);
    const from = range.from.getTime();
    const to = range.to.getTime();

    const byDriver = new Map<string, Activity[]>();
    for (const activity of scoped) {
      if (!activity.driver_id) continue;
      const list = byDriver.get(activity.driver_id) ?? [];
      list.push(activity);
      byDriver.set(activity.driver_id, list);
    }
    const timeOffBy = new Map<string, TimeOff[]>();
    for (const item of timeOff) {
      const list = timeOffBy.get(item.driver_id) ?? [];
      list.push(item);
      timeOffBy.set(item.driver_id, list);
    }
    const unavailabilityBy = new Map<string, Unavailability[]>();
    for (const item of unavailability) {
      const list = unavailabilityBy.get(item.driver_id) ?? [];
      list.push(item);
      unavailabilityBy.set(item.driver_id, list);
    }

    const capacity = new Map<string, number>();
    const occupied = new Map<string, number>();
    const blocking = new Map<string, Interval[]>();
    for (const driver of visible) {
      capacity.set(driver.id, capacityMinutes(days, timeOffBy.get(driver.id) ?? [], unavailabilityBy.get(driver.id) ?? []));
      const intervals = (byDriver.get(driver.id) ?? []).flatMap((a) => occupiedIntervalsOf(a));
      occupied.set(driver.id, uniqueMinutes(intervals, from, to));
      blocking.set(driver.id, intervals);
    }

    const ordered = [...tags].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
    return {
      range,
      days,
      drivers: visible,
      scoped,
      byDriver,
      timeOffBy,
      unavailabilityBy,
      capacity,
      occupied,
      blocking,
      tagLabels: new Map(ordered.map((tag) => [tag.id, tag.label])),
      tagColors: tagColorMap(ordered.map((tag) => ({ id: tag.id, sort_order: tag.sort_order }))),
      semanticTagColors: semanticTagColorMap(eventKindTags, ordered),
      tagOrder: ordered.map((tag) => tag.id),
      cityNames: new Map(cities.map((city) => [city.id, city.name])),
    };
  }, [releasesVersion, activities, cities, drivers, eventKindTags, filters, tags, timeOff, unavailability]);
}
