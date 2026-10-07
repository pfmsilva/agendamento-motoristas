/**
 * Viaturas de Empréstimo — modelo de dados e lógica dedicados.
 *
 * Este módulo é independente dos motoristas: não reutiliza cores, ocupação,
 * disponibilidade nem qualquer regra do calendário de serviços.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type LoanVehicle = Database["public"]["Tables"]["loan_vehicles"]["Row"];
export type LoanEvent = Database["public"]["Tables"]["loan_vehicle_events"]["Row"];
export type LoanEventType = Database["public"]["Tables"]["loan_vehicle_event_types"]["Row"];
export type LoanEventKind = string;
export type LoanColorKey = "blue" | "teal" | "green" | "amber" | "red" | "neutral";

export const LOAN_COLOR_LABEL: Record<LoanColorKey, string> = {
  blue: "Azul",
  teal: "Turquesa",
  green: "Verde",
  amber: "Âmbar",
  red: "Vermelho",
  neutral: "Cinzento",
};

export const LOAN_COLOR_CLASSES: Record<LoanColorKey, string> = {
  blue: "border-blue-strong/40 bg-blue-viz text-primary-foreground",
  teal: "border-chart-5/60 bg-chart-5 text-primary-foreground",
  green: "border-available/60 bg-available text-primary-foreground",
  amber: "border-warning/60 bg-warning text-primary-foreground",
  red: "border-conflict/60 bg-conflict text-primary-foreground",
  neutral: "border-unavailable/60 bg-unavailable text-primary-foreground",
};

export const loanTypeLabel = (event: LoanEvent, types: LoanEventType[]) =>
  event.kind_label_snapshot ?? types.find((type) => type.key === event.kind)?.label ?? event.kind;

export type LoanStatus = "scheduled" | "ongoing" | "done" | "cancelled";

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  scheduled: "Agendada",
  ongoing: "Em curso",
  done: "Concluída",
  cancelled: "Cancelada",
};

/** Estado derivado das datas; só "Cancelada" é guardada explicitamente. */
export function loanStatus(event: LoanEvent, now: Date = new Date()): LoanStatus {
  if (event.cancelled) return "cancelled";
  const start = new Date(event.start_datetime).getTime();
  const end = new Date(event.end_datetime).getTime();
  const t = now.getTime();
  if (t < start) return "scheduled";
  if (t > end) return "done";
  return "ongoing";
}

export const plateSort = (a: LoanVehicle, b: LoanVehicle) =>
  a.plate.localeCompare(b.plate, "pt-PT", { numeric: true, sensitivity: "base" });

/** Minutos de ocupação de um evento dentro de um dia concreto. */
export function minutesOnDay(event: LoanEvent, dayStart: Date): number {
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const s = Math.max(new Date(event.start_datetime).getTime(), dayStart.getTime());
  const e = Math.min(new Date(event.end_datetime).getTime(), dayEnd.getTime());
  return e > s ? Math.round((e - s) / 60000) : 0;
}

export const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart < bEnd && aEnd > bStart;

export type LoanInterval = { start: number; end: number };

/** Intervalo do evento limitado ao dia apresentado no calendário. */
export function loanIntervalOnDay(event: LoanEvent, dayStart: Date): LoanInterval | null {
  const start = Math.max(new Date(event.start_datetime).getTime(), dayStart.getTime());
  const end = Math.min(new Date(event.end_datetime).getTime(), new Date(dayStart).setDate(dayStart.getDate() + 1));
  return end > start ? { start, end } : null;
}

/** Une intervalos sobrepostos/contíguos para evitar dupla contagem. */
export function mergeLoanIntervals(intervals: LoanInterval[]): LoanInterval[] {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
  const merged: LoanInterval[] = [];

  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
  }
  return merged;
}

/** Subtrai ocupações temporárias de uma alocação permanente apenas para apresentação. */
export function subtractLoanIntervals(base: LoanInterval, cuts: LoanInterval[]): LoanInterval[] {
  let segments = [base];
  for (const cut of mergeLoanIntervals(cuts)) {
    segments = segments.flatMap((segment) => {
      if (cut.end <= segment.start || cut.start >= segment.end) return [segment];
      const remaining: LoanInterval[] = [];
      if (cut.start > segment.start) remaining.push({ start: segment.start, end: Math.min(cut.start, segment.end) });
      if (cut.end < segment.end) remaining.push({ start: Math.max(cut.end, segment.start), end: segment.end });
      return remaining;
    });
  }
  return segments;
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!minutes) return "0h";
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export const ptDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export const ptTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", hour12: false });

/* ------------------------------------------------------------------ dados */

const invalidateKeys = ["loan_vehicles", "loan_vehicle_events", "loan_vehicle_event_types", "audit_log"];

function useInvalidateLoan() {
  const qc = useQueryClient();
  return () => {
    for (const key of invalidateKeys) void qc.invalidateQueries({ queryKey: [key] });
  };
}

export function useLoanVehicles() {
  return useQuery({
    queryKey: ["loan_vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("loan_vehicles").select("*");
      if (error) throw new Error(error.message);
      return (data ?? []).sort(plateSort);
    },
  });
}

export function useLoanEventTypes() {
  return useQuery({
    queryKey: ["loan_vehicle_event_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("loan_vehicle_event_types").select("*").order("sort_order").order("label");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

const loanTypeKey = (label: string) => {
  const base = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "tipo"}-${crypto.randomUUID().slice(0, 8)}`;
};

export function useSaveLoanEventType() {
  const invalidate = useInvalidateLoan();
  return useMutation({
    mutationFn: async (values: {
      key?: string;
      label: string;
      active: boolean;
      sortOrder: number;
      colorKey: LoanColorKey;
      pattern: string;
      requiresPerson: boolean;
      allowsPermanent: boolean;
      allowsOverlapWithPermanent: boolean;
      defaultStartTime: string;
      defaultEndTime: string;
    }) => {
      const payload = {
        label: values.label.trim(), active: values.active, sort_order: values.sortOrder,
        color_key: values.colorKey, pattern: values.pattern, requires_person: values.requiresPerson,
        allows_permanent: values.allowsPermanent,
        allows_overlap_with_permanent: values.allowsOverlapWithPermanent,
        default_start_time: values.defaultStartTime, default_end_time: values.defaultEndTime,
      };
      const response = values.key
        ? await supabase.from("loan_vehicle_event_types").update(payload).eq("key", values.key).select("key")
        : await supabase.from("loan_vehicle_event_types").insert({ key: loanTypeKey(values.label), ...payload }).select("key");
      if (response.error) throw new Error(response.error.message);
      if (!response.data?.length) throw new Error("O tipo não foi gravado (apenas o Proprietário pode alterá-lo).");
    },
    onSuccess: invalidate,
  });
}

export function useDeleteLoanEventType() {
  const invalidate = useInvalidateLoan();
  return useMutation({
    mutationFn: async (key: string) => {
      const { data, error } = await supabase.from("loan_vehicle_event_types").delete().eq("key", key).select("key");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error("O tipo não foi eliminado (apenas o Proprietário pode eliminá-lo).");
    },
    onSuccess: invalidate,
  });
}

export function useSaveLoanVehicle() {
  const invalidate = useInvalidateLoan();
  return useMutation({
    mutationFn: async (values: { id?: string | undefined; plate: string; brand: string; model: string }) => {
      const payload = {
        plate: values.plate.trim().toUpperCase(),
        brand: values.brand.trim() || null,
        model: values.model.trim() || null,
      };
      const res = values.id
        ? await supabase.from("loan_vehicles").update(payload).eq("id", values.id).select().single()
        : await supabase.from("loan_vehicles").insert(payload).select().single();
      if (res.error) {
        if (res.error.code === "23505")
          throw new Error("Já existe uma viatura com esta matrícula.");
        throw new Error(res.error.message);
      }
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useSetLoanVehicleActive() {
  const invalidate = useInvalidateLoan();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("loan_vehicles").update({ active }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useLoanEvents() {
  return useQuery({
    queryKey: ["loan_vehicle_events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loan_vehicle_events")
        .select("*")
        .order("start_datetime");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export type LoanEventInput = {
  id?: string | undefined;
  vehicle_id: string;
  kind: LoanEventKind;
  person_name: string | null;
  start_datetime: string;
  end_datetime: string;
  permanent: boolean;
  notes: string | null;
};

export function useSaveLoanEvent() {
  const invalidate = useInvalidateLoan();
  return useMutation({
    mutationFn: async (values: LoanEventInput) => {
      const { id, ...payload } = values;
      const res = id
        ? await supabase.from("loan_vehicle_events").update(payload).eq("id", id).select().single()
        : await supabase.from("loan_vehicle_events").insert(payload).select().single();
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useCancelLoanEvent() {
  const invalidate = useInvalidateLoan();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("loan_vehicle_events")
        .update({ cancelled: true })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useEndPermanentAllocation() {
  const invalidate = useInvalidateLoan();
  return useMutation({
    mutationFn: async ({ id, endedAt }: { id: string; endedAt: string }) => {
      const { error } = await supabase
        .from("loan_vehicle_events")
        .update({ permanent: false, end_datetime: endedAt })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/** Eventos que bloqueiam a viatura (alocações e inspeções não canceladas). */
export const blockingEvents = (events: LoanEvent[]) => events.filter((e) => !e.cancelled);

export function conflictFor(
  events: LoanEvent[],
  vehicleId: string,
  start: Date,
  end: Date,
  ignoreId?: string,
  kind: LoanEventKind = "allocation",
  permanent = false,
  wasPermanent = false,
  types: LoanEventType[] = [],
): LoanEvent | null {
  const newType = types.find((type) => type.key === kind);
  const newAllowsPermanentOverlap = newType?.allows_overlap_with_permanent ?? true;
  return (
    blockingEvents(events).find(
      (e) => {
        const existingType = types.find((type) => type.key === e.kind);
        const existingAllowsPermanentOverlap = existingType?.allows_overlap_with_permanent ?? true;
        return e.vehicle_id === vehicleId &&
          e.id !== ignoreId &&
          !(
            ((permanent || wasPermanent) && !e.permanent && existingAllowsPermanentOverlap) ||
            (e.permanent && !permanent && newAllowsPermanentOverlap)
          ) &&
          overlaps(start, end, new Date(e.start_datetime), new Date(e.end_datetime));
      },
    ) ?? null
  );
}

export function allocationConflictReason(event: LoanEvent) {
  const label = event.kind_label_snapshot ?? event.kind;
  if (!event.person_name)
    return `${label.toLocaleLowerCase("pt-PT")} de ${ptDateTime(event.start_datetime)} até ${ptDateTime(event.end_datetime)}`;
  if (event.permanent)
    return `${label.toLocaleLowerCase("pt-PT")} permanente — ${event.person_name}`;
  return `${label.toLocaleLowerCase("pt-PT")} de ${ptDateTime(event.start_datetime)} até ${ptDateTime(event.end_datetime)}`;
}

/** Alocação permanente que se sobrepõe: apenas aviso, nunca bloqueia. */
export function permanentOverlapFor(
  events: LoanEvent[],
  vehicleId: string,
  start: Date,
  end: Date,
  ignoreId?: string,
  permanent = false,
): LoanEvent | null {
  if (permanent) return null;
  return (
    blockingEvents(events).find(
      (e) =>
        e.vehicle_id === vehicleId &&
        e.id !== ignoreId &&
        e.permanent &&
        overlaps(start, end, new Date(e.start_datetime), new Date(e.end_datetime)),
    ) ?? null
  );
}

export const CONFLICT_MESSAGE =
  "Esta viatura já se encontra indisponível durante parte do período selecionado.";

export const PERMANENT_OVERLAP_WARNING =
  "Esta viatura tem uma alocação permanente durante parte ou a totalidade do período selecionado. O novo evento será registado e a alocação permanente ficará visualmente interrompida nesse intervalo.";

