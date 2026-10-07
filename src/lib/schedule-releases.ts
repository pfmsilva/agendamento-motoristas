import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * «Libertar horário»: intervalo que o Administrador com sessão iniciada retira
 * do SEU próprio calendário (administrator_id, definido pela base de dados).
 * Corta apenas os serviços desse Administrador; os motoristas desses serviços
 * ficam livres no intervalo. Linhas antigas com activity_id cortam só esse serviço.
 */
export type ScheduleRelease = Database["public"]["Tables"]["schedule_releases"]["Row"];
type ReleasableActivity = { id: string; administrator_id: string | null; driver_id: string | null };

const KEY = ["schedule_releases"];

/** Cópia das libertações para cálculos de horas fora de componentes (análises, exportações). */
let releaseCache: ScheduleRelease[] = [];
export const cachedReleases = () => releaseCache;

export function useScheduleReleases() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("schedule_releases").select("*").order("start_datetime");
      if (error) throw new Error(error.message);
      releaseCache = (data ?? []) as ScheduleRelease[];
      return releaseCache;
    },
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ["driver_monthly_worked_minutes"] });
    void qc.invalidateQueries({ queryKey: ["audit_log"] });
  };
}

function setCache(qc: ReturnType<typeof useQueryClient>, fn: (prev: ScheduleRelease[]) => ScheduleRelease[]) {
  qc.setQueryData<ScheduleRelease[]>(KEY, (prev = []) => (releaseCache = fn(prev)));
}

/**
 * Cria/edita uma libertação. A base de dados impõe o dono: Administrador e Motorista
 * libertam sempre o próprio horário; o Assistente indica um Administrador que assiste.
 */
export function useSaveMyRelease() {
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id?: string; administrator_id?: string | null; start_datetime: string; end_datetime: string; notes: string | null }) => {
      const values = {
        start_datetime: v.start_datetime,
        end_datetime: v.end_datetime,
        notes: v.notes,
        ...(v.administrator_id ? { administrator_id: v.administrator_id } : {}),
      };
      const res = v.id
        ? await supabase.from("schedule_releases").update(values).eq("id", v.id).select("*")
        : await supabase.from("schedule_releases").insert(values).select("*");
      if (res.error) throw new Error(res.error.message);
      if (!res.data?.length) throw new Error("Sem permissão para libertar este horário.");
      return res.data[0] as ScheduleRelease;
    },
    onSuccess: (row) => {
      setCache(qc, (prev) => [...prev.filter((r) => r.id !== row.id), row]);
      refresh();
    },
  });
}

/** Remove uma libertação própria e repõe o horário original nesse intervalo. */
export function useDeleteMyRelease() {
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.from("schedule_releases").delete().eq("id", id).select("id");
      if (res.error) throw new Error(res.error.message);
      if (!res.data?.length) throw new Error("Sem permissão para remover esta libertação.");
      return id;
    },
    onSuccess: (id) => {
      setCache(qc, (prev) => prev.filter((r) => r.id !== id));
      refresh();
    },
  });
}

export type TimeInterval = { start: Date; end: Date };

/** Âmbito: serviço (antigas), Administrador (todos os seus serviços) ou Motorista (todos os seus serviços). */
const appliesTo = (r: ScheduleRelease, a: ReleasableActivity) => {
  if (r.activity_id) return r.activity_id === a.id;
  if (r.administrator_id) return r.administrator_id === a.administrator_id;
  return !!r.driver_id && r.driver_id === a.driver_id;
};

/** Libertações que cortam este serviço, unidas e recortadas a [start, end). */
export function mergedReleaseIntervals(
  releases: ScheduleRelease[] | undefined,
  a: ReleasableActivity,
  start: Date,
  end: Date,
): TimeInterval[] {
  if (!releases?.length || end <= start) return [];
  const clipped = releases
    .filter((r) => appliesTo(r, a))
    .map((r) => ({
      start: new Date(Math.max(start.getTime(), new Date(r.start_datetime).getTime())),
      end: new Date(Math.min(end.getTime(), new Date(r.end_datetime).getTime())),
    }))
    .filter((i) => i.end > i.start)
    .sort((x, y) => x.start.getTime() - y.start.getTime());
  const merged: TimeInterval[] = [];
  for (const i of clipped) {
    const prev = merged[merged.length - 1];
    if (!prev || i.start > prev.end) merged.push(i);
    else if (i.end > prev.end) prev.end = i.end;
  }
  return merged;
}

/** Troços do serviço que continuam ocupados depois das libertações. */
export function occupiedIntervals(
  releases: ScheduleRelease[] | undefined,
  a: ReleasableActivity,
  start: Date,
  end: Date,
): TimeInterval[] {
  const cuts = mergedReleaseIntervals(releases, a, start, end);
  if (!cuts.length) return end > start ? [{ start, end }] : [];
  const out: TimeInterval[] = [];
  let cursor = start;
  for (const cut of cuts) {
    if (cut.start > cursor) out.push({ start: cursor, end: cut.start });
    if (cut.end > cursor) cursor = cut.end;
  }
  if (cursor < end) out.push({ start: cursor, end });
  return out;
}

/** Milissegundos libertados deste serviço dentro de [start, end). */
export function releasedMs(a: ReleasableActivity, start: Date, end: Date, releases = releaseCache) {
  if (!a.driver_id) return 0;
  return mergedReleaseIntervals(releases, a, start, end).reduce((s, i) => s + (i.end.getTime() - i.start.getTime()), 0);
}

/** Horas ocupadas do serviço em [start, end) ∩ range, descontando libertações. */
export function occupiedHoursIn(
  a: ReleasableActivity,
  start: Date,
  end: Date,
  range: { from: Date; to: Date },
  releases = releaseCache,
) {
  const s = new Date(Math.max(start.getTime(), range.from.getTime()));
  const e = new Date(Math.min(end.getTime(), range.to.getTime()));
  if (e <= s) return 0;
  return Math.max(0, e.getTime() - s.getTime() - releasedMs(a, s, e, releases)) / 3_600_000;
}

/** Garante que os cálculos dependentes de libertações recalculam quando estas mudam. */
export function useReleasesVersion() {
  return useScheduleReleases().dataUpdatedAt;
}
