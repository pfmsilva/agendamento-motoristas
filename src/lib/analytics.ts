import { effectiveEnd, effectiveStart, hasAdjustment } from "./scheduling";
import { occupiedHoursIn } from "./schedule-releases";
import type { Activity, ActivityType, Driver, TimeOff, Unavailability } from "./scheduling";

/** Assumed contracted working time used as the denominator for utilisation. */
export const WORK_HOURS_PER_DAY = 8;

export const MS_HOUR = 1000 * 60 * 60;

export type Range = { from: Date; to: Date };

export function clampHours(start: string, end: string, range: Range) {
  const s = Math.max(new Date(start).getTime(), range.from.getTime());
  const e = Math.min(new Date(end).getTime(), range.to.getTime());
  return e > s ? (e - s) / MS_HOUR : 0;
}

export function businessDays({ from, to }: Range) {
  let n = 0;
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (d <= to) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

export function leaveDaysInRange(t: TimeOff, { from, to }: Range) {
  const s = new Date(t.start_date + "T00:00:00");
  const e = new Date(t.end_date + "T00:00:00");
  let n = 0;
  const d = new Date(Math.max(s.getTime(), from.getTime()));
  d.setHours(0, 0, 0, 0);
  const end = new Date(Math.min(e.getTime(), to.getTime()));
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

export function inRange(a: Activity, range: Range) {
  return new Date(a.start_datetime) < range.to && new Date(a.end_datetime) > range.from;
}

export type DriverStats = {
  driverId: string;
  name: string;
  activities: number;
  hours: number;
  serviceHours: number;
  travelHours: number;
  occupationHours: number;
  adjustments: number;
  avgHours: number;
  daysWorked: number;
  cancelled: number;
  overrides: number;
  leaveDays: number;
  unavailableHours: number;
  availableHours: number;
  utilisation: number;
};

export function driverStats(
  drivers: Driver[],
  activities: Activity[],
  timeOff: TimeOff[],
  unavailability: Unavailability[],
  range: Range,
): DriverStats[] {
  const baseDays = businessDays(range);

  return drivers.map((d) => {
    const acts = activities.filter((a) => a.driver_id === d.id && inRange(a, range));
    const done = acts.filter((a) => a.status !== "cancelled");
    // Horários libertados são excluídos de todas as horas contabilizadas.
    const hours = done.reduce(
      (s, a) => s + occupiedHoursIn(a, new Date(a.start_datetime), new Date(a.end_datetime), range),
      0,
    );
    const occupationHours = done.reduce(
      (s, a) => s + occupiedHoursIn(a, effectiveStart(a), effectiveEnd(a), range),
      0,
    );
    const travelHours = Math.max(0, occupationHours - hours);
    const adjustments = done.filter((a) => hasAdjustment(a)).length;
    const days = new Set(done.map((a) => new Date(a.start_datetime).toDateString())).size;
    const leaveDays = timeOff
      .filter((t) => t.driver_id === d.id && t.status === "approved")
      .reduce((s, t) => s + leaveDaysInRange(t, range), 0);
    const unavailableHours = unavailability
      .filter((u) => u.driver_id === d.id && u.status === "active")
      .reduce((s, u) => s + clampHours(u.start_datetime, u.end_datetime, range), 0);

    const availableHours = Math.max(
      0,
      baseDays * WORK_HOURS_PER_DAY - leaveDays * WORK_HOURS_PER_DAY - unavailableHours,
    );

    return {
      driverId: d.id,
      name: d.name,
      activities: acts.length,
      hours,
      serviceHours: hours,
      travelHours,
      occupationHours,
      adjustments,
      avgHours: done.length ? hours / done.length : 0,
      daysWorked: days,
      cancelled: acts.filter((a) => a.status === "cancelled").length,
      overrides: acts.filter((a) => a.override_conflict).length,
      leaveDays,
      unavailableHours,
      availableHours,
      utilisation: availableHours > 0 ? (occupationHours / availableHours) * 100 : 0,
    };
  });
}

export type Totals = {
  activities: number;
  hours: number;
  serviceHours: number;
  travelHours: number;
  occupationHours: number;
  adjustments: number;
  drivers: number;
  avgHoursPerDriver: number;
  utilisation: number;
  cancelled: number;
  cancelledRate: number;
  overrides: number;
  leaveDays: number;
  unavailableHours: number;
};

export function totals(stats: DriverStats[]): Totals {
  const activities = stats.reduce((s, r) => s + r.activities, 0);
  const hours = stats.reduce((s, r) => s + r.hours, 0);
  const occupationHours = stats.reduce((s, r) => s + r.occupationHours, 0);
  const available = stats.reduce((s, r) => s + r.availableHours, 0);
  const cancelled = stats.reduce((s, r) => s + r.cancelled, 0);
  return {
    activities,
    hours,
    serviceHours: hours,
    travelHours: stats.reduce((s, r) => s + r.travelHours, 0),
    occupationHours,
    adjustments: stats.reduce((s, r) => s + r.adjustments, 0),
    drivers: stats.length,
    avgHoursPerDriver: stats.length ? hours / stats.length : 0,
    utilisation: available > 0 ? (occupationHours / available) * 100 : 0,
    cancelled,
    cancelledRate: activities ? (cancelled / activities) * 100 : 0,
    overrides: stats.reduce((s, r) => s + r.overrides, 0),
    leaveDays: stats.reduce((s, r) => s + r.leaveDays, 0),
    unavailableHours: stats.reduce((s, r) => s + r.unavailableHours, 0),
  };
}

export function mixByType(activities: Activity[], range: Range) {
  const map = new Map<ActivityType, { type: ActivityType; count: number; hours: number }>();
  for (const a of activities) {
    if (a.status === "cancelled" || !inRange(a, range)) continue;
    const cur = map.get(a.type) ?? { type: a.type, count: 0, hours: 0 };
    cur.count += 1;
    cur.hours += occupiedHoursIn(a, new Date(a.start_datetime), new Date(a.end_datetime), range);
    map.set(a.type, cur);
  }
  return [...map.values()].sort((a, b) => b.hours - a.hours);
}

function bucketKey(d: Date, grain: "day" | "week" | "month") {
  if (grain === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  if (grain === "week") {
    const s = new Date(d);
    s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
    return s.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

export function timeSeries(activities: Activity[], range: Range, grain: "day" | "week" | "month") {
  const map = new Map<string, { bucket: string; activities: number; hours: number }>();
  for (const a of activities) {
    if (a.status === "cancelled" || !inRange(a, range)) continue;
    const key = bucketKey(new Date(a.start_datetime), grain);
    const cur = map.get(key) ?? { bucket: key, activities: 0, hours: 0 };
    cur.activities += 1;
    cur.hours += occupiedHoursIn(a, new Date(a.start_datetime), new Date(a.end_datetime), range);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export function presetRange(preset: string): Range {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  start.setHours(0, 0, 0, 0);

  switch (preset) {
    case "week": {
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      const e = new Date(start);
      e.setDate(e.getDate() + 6);
      e.setHours(23, 59, 59, 999);
      return { from: start, to: e };
    }
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return { from: new Date(now.getFullYear(), q * 3, 1), to: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59) };
    }
    case "year":
      return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31, 23, 59, 59) };
    case "last90": {
      const s = new Date(now);
      s.setDate(s.getDate() - 90);
      s.setHours(0, 0, 0, 0);
      return { from: s, to: end };
    }
    default:
      return { from: start, to: end };
  }
}

export function toCsv(rows: Record<string, string | number>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h] ?? "")).join(","))].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function toDateInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Same-length window immediately before `range`, used for period-over-period deltas. */
export function previousRange({ from, to }: Range): Range {
  const span = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - span), to: new Date(from.getTime()) };
}

export function delta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

export type CityStats = {
  cityId: string | null;
  name: string;
  activities: number;
  hours: number;
  travelHours: number;
  avgTravelMinutes: number;
};

export function cityStats(
  activities: Activity[],
  cities: { id: string; name: string }[],
  range: Range,
): CityStats[] {
  const map = new Map<string, CityStats>();
  for (const a of activities) {
    if (a.status === "cancelled" || !inRange(a, range)) continue;
    const key = a.city_id ?? "none";
    const city = cities.find((c) => c.id === a.city_id);
    const cur =
      map.get(key) ??
      ({
        cityId: a.city_id ?? null,
        name: city?.name ?? a.destination ?? "Sem cidade",
        activities: 0,
        hours: 0,
        travelHours: 0,
        avgTravelMinutes: 0,
      } satisfies CityStats);
    cur.activities += 1;
    const svc = occupiedHoursIn(a, new Date(a.start_datetime), new Date(a.end_datetime), range);
    cur.hours += svc;
    cur.travelHours += Math.max(0, occupiedHoursIn(a, effectiveStart(a), effectiveEnd(a), range) - svc);
    map.set(key, cur);
  }
  // A deslocação média resulta da ocupação real de cada serviço (rota origem ↔ destino).
  for (const stat of map.values()) {
    stat.avgTravelMinutes = stat.activities ? Math.round((stat.travelHours * 60) / stat.activities) : 0;
  }
  return [...map.values()].sort((a, b) => b.hours - a.hours);
}
