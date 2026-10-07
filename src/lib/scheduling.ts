import { occupiedIntervals, type ScheduleRelease } from "@/lib/schedule-releases";
import type { CSSProperties } from "react";
import type { Database } from "@/integrations/supabase/types";

export type Driver = Database["public"]["Tables"]["drivers"]["Row"];
export type Activity = Database["public"]["Tables"]["activities"]["Row"];
export type TimeOff = Database["public"]["Tables"]["time_off"]["Row"];
export type Unavailability = Database["public"]["Tables"]["unavailability"]["Row"];
export type Assistant = Database["public"]["Tables"]["assistants"]["Row"];
export type City = Database["public"]["Tables"]["cities"]["Row"];
export type TravelRoute = Database["public"]["Tables"]["travel_routes"]["Row"];
export type ActivityType = Database["public"]["Enums"]["activity_type"];
export type ActivityStatus = Database["public"]["Enums"]["activity_status"];
export type AssignmentStatus = Database["public"]["Enums"]["assignment_status"];

export const ASSIGNMENT_LABEL: Record<AssignmentStatus, string> = {
  automatic: "Automática",
  manual: "Manual",
  pending_manual: "Por atribuir",
};

/** Texto mostrado nos calendários para serviços ainda sem motorista. */
export const PENDING_DRIVER_LABEL = "Por atribuir";

/**
 * Identificador de uma faixa virtual no calendário para serviços sem motorista.
 * Não existe na base de dados; só serve para o calendário da assistente.
 */
export const PENDING_DRIVER_ID = "__pending__";

export const isPendingAssignment = (a: Activity) =>
  a.assignment_status === "pending_manual" || !a.driver_id;

/**
 * Só Gestor e Proprietário resolvem atribuições manuais pendentes,
 * por isso só estes perfis veem contadores, avisos e listas de serviços por atribuir.
 */
export const canSeePendingAssignments = (role?: string | null) => role === "manager" || role === "owner";

/** Motivo de cada motorista tentado na atribuição automática (guardado no serviço). */
export type AssignmentAttempt = { driver_id: string; name: string; priority: number; reason: string };

export function assignmentAttempts(a: Activity): AssignmentAttempt[] {
  return Array.isArray(a.assignment_attempts) ? (a.assignment_attempts as AssignmentAttempt[]) : [];
}

export const ACTIVITY_TYPES: ActivityType[] = [
  "trip",
  "airport",
  "meeting",
  "event",
  "service",
  "availability",
  "other",
];

export const ACTIVITY_STATUSES: ActivityStatus[] = ["draft", "confirmed", "cancelled"];

/** Legacy per-cell state used by the resource grid. */
export type AvailabilityState = "AVAILABLE" | "BUSY" | "ON_LEAVE" | "UNAVAILABLE" | "CONFLICT";

/** Three-state availability answer used by search / conflict UI. */
export type AvailabilityStatus = "AVAILABLE" | "CONDITIONAL" | "UNAVAILABLE";

export const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  AVAILABLE: "Disponível",
  CONDITIONAL: "A confirmar",
  UNAVAILABLE: "Indisponível",
};

export const AVAILABILITY_CLASS: Record<AvailabilityStatus, string> = {
  AVAILABLE: "bg-available-soft text-available border-available/30",
  CONDITIONAL: "bg-warning-soft text-warning border-warning/40",
  UNAVAILABLE: "bg-conflict-soft text-conflict border-conflict/40",
};

export const STATE_LABEL: Record<AvailabilityState, string> = {
  AVAILABLE: "Disponível",
  BUSY: "Ocupado",
  ON_LEAVE: "Ausente",
  UNAVAILABLE: "Indisponível",
  CONFLICT: "Conflito",
};

export const TYPE_LABEL: Record<ActivityType, string> = {
  trip: "Viagem",
  airport: "Aeroporto",
  meeting: "Reunião",
  event: "Evento",
  service: "Serviço",
  availability: "Disponibilidade",
  other: "Outro",
};

export const STATUS_LABEL: Record<ActivityStatus, string> = {
  draft: "Rascunho",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
};

export const TIMEOFF_TYPE_LABEL: Record<string, string> = {
  holiday: "Férias",
  sick: "Baixa médica",
  personal: "Pessoal",
  other: "Outro",
};

export const TIMEOFF_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  approved: "Ativa",
  rejected: "Recusada",
  cancelled: "Cancelada",
};

export const STATE_CLASS: Record<AvailabilityState, string> = {
  AVAILABLE: "bg-available-soft text-available border-available/30",
  BUSY: "bg-conflict-soft text-conflict border-conflict/40",
  ON_LEAVE: "bg-leave-soft text-leave border-leave/30",
  UNAVAILABLE: "bg-unavailable-soft text-unavailable border-unavailable/30",
  CONFLICT: "bg-conflict-soft text-conflict border-conflict/40",
};

export function overlaps(aStart: Date | string, aEnd: Date | string, bStart: Date | string, bEnd: Date | string) {
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return as < be && ae > bs;
}

/**
 * Overlap between a whole-day period ["AAAA-MM-DD".."AAAA-MM-DD", inclusive]
 * and an instant range [from, to). Both bounds are built in local time and the
 * comparison is strict, so a period starting on the 9th never touches a window
 * that merely ends at the 9th's midnight (that would paint the 8th).
 */
export function dateOverlapsRange(start: string, end: string, from: Date, to: Date) {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  e.setDate(e.getDate() + 1); // exclusive end = midnight after the last day
  return s < to && e > from;
}


export type DriverDataset = {
  activities: Activity[];
  timeOff: TimeOff[];
  unavailability: Unavailability[];
  cities?: City[];
  /** «Libertar horário»: intervalos em que o motorista fica livre dentro de uma ocupação. */
  releases?: ScheduleRelease[];
};

/* ------------------------------------------------------------------ */
/* Service vs occupation                                               */
/* ------------------------------------------------------------------ */

/** Driver occupation actually in force: driver adjustment wins over the calculated window. */
export function effectiveStart(a: Activity): Date {
  return new Date(a.driver_adjusted_start ?? a.calculated_occupation_start ?? a.start_datetime);
}

export function effectiveEnd(a: Activity): Date {
  return new Date(a.driver_adjusted_end ?? a.calculated_occupation_end ?? a.end_datetime);
}

export function occupationStart(a: Activity): Date {
  return new Date(a.calculated_occupation_start ?? a.start_datetime);
}

export function occupationEnd(a: Activity): Date {
  return new Date(a.calculated_occupation_end ?? a.end_datetime);
}

export function hasAdjustment(a: Activity) {
  return Boolean(a.driver_adjusted_start || a.driver_adjusted_end);
}

/* ------------------------------------------------------------------ */
/* Tempos de deslocação por rota (origem ↔ destino)                    */
/* ------------------------------------------------------------------ */

/** Zona única que agrupa "Casa" e todos os locais "Lisboa - ...". */
export const LISBON_ZONE_KEY = "LISBOA";
export const LISBON_ZONE_LABEL = "Lisboa / Casa";
/** Dentro da zona de Lisboa a deslocação é sempre 1 hora. */
export const LISBON_LOCAL_MINUTES = 60;

export function isLisbonArea(city: Pick<City, "name">) {
  const name = city.name.trim();
  return name === "Casa" || /^lisboa\s*-/i.test(name);
}

/** Chave usada nas rotas: a zona de Lisboa vale por todos os seus locais. */
export function cityTravelKey(city: Pick<City, "id" | "name">) {
  return isLisbonArea(city) ? LISBON_ZONE_KEY : city.id;
}

export function travelKeyLabel(key: string, cities: Pick<City, "id" | "name">[]) {
  if (key === LISBON_ZONE_KEY) return LISBON_ZONE_LABEL;
  return cities.find((c) => c.id === key)?.name ?? "Local removido";
}

export function orderedRouteKeys(keyA: string, keyB: string): [string, string] {
  return keyA < keyB ? [keyA, keyB] : [keyB, keyA];
}

export function routeLabel(keyA: string, keyB: string, cities: Pick<City, "id" | "name">[]) {
  const [a, b] = orderedRouteKeys(keyA, keyB);
  return `${travelKeyLabel(a, cities)} ↔ ${travelKeyLabel(b, cities)}`;
}

/**
 * Minutos de deslocação de uma rota. `null` significa rota por configurar:
 * nunca se assume o tempo do destino nem zero.
 */
export function routeTravelMinutes(
  origin: Pick<City, "id" | "name"> | null | undefined,
  destination: Pick<City, "id" | "name"> | null | undefined,
  routes: TravelRoute[],
): number | null {
  if (!origin || !destination) return null;
  const ka = cityTravelKey(origin);
  const kb = cityTravelKey(destination);
  if (ka === LISBON_ZONE_KEY && kb === LISBON_ZONE_KEY) return LISBON_LOCAL_MINUTES;
  if (ka === kb) return 0;
  const [a, b] = orderedRouteKeys(ka, kb);
  return routes.find((r) => r.key_a === a && r.key_b === b)?.minutes ?? null;
}

/**
 * Compute the occupation window for a service, given the full route.
 * Com "ida e volta" (por defeito) reserva-se a deslocação antes e depois do serviço;
 * sem ida e volta só se reserva a deslocação de ida.
 */
export function computeOccupation(
  serviceStart: Date,
  serviceEnd: Date,
  origin: City | null | undefined,
  destination: City | null | undefined,
  routes: TravelRoute[],
  roundTrip: boolean = true,
): { start: Date; end: Date; travelUnknown: boolean; travelMinutes: number | null } {
  const travel = routeTravelMinutes(origin, destination, routes);
  if (travel === null) {
    return { start: serviceStart, end: serviceEnd, travelUnknown: true, travelMinutes: null };
  }
  return {
    start: new Date(serviceStart.getTime() - travel * 60000),
    end: new Date(serviceEnd.getTime() + (roundTrip ? travel : 0) * 60000),
    travelUnknown: false,
    travelMinutes: travel,
  };
}

export type SegmentKind = "adjust" | "travel" | "service";

export type Segment = { kind: SegmentKind; start: Date; end: Date };

/** Split an activity into adjustment / travel / service segments (single visual block). */
export function activitySegments(a: Activity): Segment[] {
  const svcS = new Date(a.start_datetime);
  const svcE = new Date(a.end_datetime);
  const occS = occupationStart(a);
  const occE = occupationEnd(a);
  const effS = effectiveStart(a);
  const effE = effectiveEnd(a);
  // Manual adjustments (motorista ou gestão) usam sempre o mesmo padrão às riscas.
  const adjustKind: SegmentKind = "adjust";
  const out: Segment[] = [];
  if (effS < occS) out.push({ kind: adjustKind, start: effS, end: occS });
  if (occS < svcS) out.push({ kind: "travel", start: occS < effS ? effS : occS, end: svcS });
  out.push({ kind: "service", start: svcS, end: svcE });
  if (occE > svcE) out.push({ kind: "travel", start: svcE, end: occE > effE ? effE : occE });
  if (effE > occE) out.push({ kind: adjustKind, start: occE, end: effE });
  return out.filter((s) => s.end > s.start);
}

/** Segmentos visíveis depois de subtrair as libertações deste serviço. */
export function releasedActivitySegments(a: Activity, releases?: ScheduleRelease[]): Segment[] {
  if (!a.driver_id || !releases?.length) return activitySegments(a);
  return activitySegments(a).flatMap((segment) =>
    occupiedIntervals(releases, a, segment.start, segment.end).map((interval) => ({
      ...segment,
      ...interval,
    })),
  );
}

export const SEGMENT_CLASS: Record<SegmentKind, string> = {
  service: "bg-occ-service text-occ-service-foreground",
  travel: "bg-occ-travel text-occ-travel-foreground",
  adjust:
    "bg-occ-adjust text-occ-adjust-foreground bg-[repeating-linear-gradient(135deg,transparent_0_5px,rgb(0_0_0/0.06)_5px_10px)]",
};


export const SEGMENT_LABEL: Record<SegmentKind, string> = {
  service: "Serviço",
  travel: "Deslocação",
  adjust: "Ajuste manual da ocupação",
};

/* ------------------------------------------------------------------ */
/* Driver identity colors                                              */
/* ------------------------------------------------------------------ */

export const DRIVER_COLOR_COUNT = 12;

/** Hex values mirror the --driver-N tokens in src/styles.css (needed for swatches in native inputs). */
export const DRIVER_COLOR_HEX = [
  "#023f5a", // azul-marinho profundo
  "#1f8f9e", // turquesa
  "#4664c8", // azul médio
  "#1f7a52", // verde floresta
  "#7a4b9c", // violeta
  "#c2542f", // terracota
  "#9b7d40", // ocre/dourado
  "#6f9bc4", // azul-céu suave
  "#a63d62", // ameixa
  "#b5787f", // rosa envelhecido
  "#6b7a24", // azeitona
  "#46596b", // cinza-ardósia
];


export type DriverColorSource = { id: string; color_index?: number | null };

/** Stable hash → palette index, used only when the driver has no explicit color. */
function hashIndex(driverId: string): number {
  let h = 0;
  for (let i = 0; i < driverId.length; i++) h = (h * 31 + driverId.charCodeAt(i)) >>> 0;
  return h % DRIVER_COLOR_COUNT;
}

export function driverColorIndex(driverId: string, drivers?: DriverColorSource[]): number {
  const explicit = drivers?.find((d) => d.id === driverId)?.color_index;
  if (explicit != null && Number.isFinite(explicit)) {
    return ((explicit % DRIVER_COLOR_COUNT) + DRIVER_COLOR_COUNT) % DRIVER_COLOR_COUNT;
  }
  return hashIndex(driverId);
}

export function driverColorVar(driverId: string, drivers?: DriverColorSource[]): string {
  return `var(--driver-${driverColorIndex(driverId, drivers) + 1})`;
}

/** Segment background styles derived from the driver color (keeps the hierarchy: dark service, medium travel, hatched light adjustment). */
export function segmentStyle(kind: SegmentKind, color: string): CSSProperties {
  switch (kind) {
    case "service":
      return { backgroundColor: color, color: "#ffffff" };
    case "travel":
      return {
        backgroundColor: `color-mix(in srgb, ${color} 68%, white)`,
        color: `color-mix(in srgb, ${color} 25%, black)`,
      };
    case "adjust":
      return {
        backgroundColor: `color-mix(in srgb, ${color} 14%, white)`,
        backgroundImage: `repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in srgb, ${color} 22%, transparent) 5px 10px)`,
        color: `color-mix(in srgb, ${color} 55%, black)`,
      };
  }
}

/**
 * Unavailability: flat translucent grey with a subtle undertone of the driver
 * colour. Deliberately free of stripes so it can never be mistaken for the
 * hatched driver adjustment.
 */
export function unavailableStyle(color: string): CSSProperties {
  const muted = `color-mix(in srgb, ${color} 18%, #6b7280)`;
  return {
    backgroundColor: `color-mix(in srgb, ${muted} 30%, white)`,
    backgroundImage: "none",
    borderColor: `color-mix(in srgb, ${muted} 55%, transparent)`,
    borderStyle: "dashed",
    color: `color-mix(in srgb, ${muted} 75%, black)`,
  };
}
/**
 * Férias: continua a ler-se como cinzento, mas com um subtom bem mais visível
 * da cor do motorista, para ligar o cartão a quem está de férias. O contorno
 * tracejado usa a cor do motorista e o texto mantém contraste elevado.
 */
const VACATION_GREY = "#9aa4ab";

export function vacationStyle(color: string): CSSProperties {
  const tinted = `color-mix(in srgb, ${color} 45%, ${VACATION_GREY})`;
  return {
    backgroundColor: tinted,
    backgroundImage: "none",
    borderColor: `color-mix(in srgb, ${color} 80%, black)`,
    borderStyle: "dashed",
    color: `color-mix(in srgb, ${color} 25%, black)`,
  };
}

/* ------------------------------------------------------------------ */
/* Tipos de evento                                                     */
/* ------------------------------------------------------------------ */

export type EventKind = Database["public"]["Enums"]["event_kind"];

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  administration: "Administração",
  garage: "Garagem",
};

/**
 * Rótulos dos tipos de evento configurados pelo Proprietário. O registo é
 * preenchido a partir da configuração (`event_kind_tags`), para que os tipos
 * criados apareçam em filtros, análises e exportações sem serem fixados no código.
 */
let eventKindLabels: Record<string, string> = {
  administration: "Administração",
  garage: "Garagem",
  absence: "Ausência / Indisponibilidade",
};

export function setEventKindLabels(map: Record<string, string>) {
  eventKindLabels = {
    administration: "Administração",
    garage: "Garagem",
    absence: "Ausência / Indisponibilidade",
    ...map,
  };
}

/** Chave do tipo gravada no evento; o histórico mantém o valor original. */
export const eventKindKeyOf = (a: { event_kind_key?: string | null; event_kind?: string | null }) =>
  a.event_kind_key ?? String(a.event_kind ?? "administration");

export const eventKindLabelOf = (key: string, historicalLabel?: string | null) =>
  historicalLabel ?? eventKindLabels[key] ?? key;

/** Etiquetas dos quatro tipos de evento do calendário. */
export const EVENT_TAG = {
  administration: "Administração",
  garage: "Garagem",
  vacation: "Férias",
  personal: "Pessoal",
} as const;

export const isGarage = (a: Activity) => a.event_kind === "garage";

/* ------------------------------------------------------------------ */
/* Confidencialidade dos serviços de Administração                     */
/* ------------------------------------------------------------------ */

/** Título genérico mostrado a quem não pode ver o conteúdo confidencial. */
export const ADMIN_GENERIC_TITLE = "Serviço Administração";

/**
 * Regra única de visibilidade: apenas Gestor e Proprietário ficam sem título e
 * notas dos serviços de Administração. Assistente, Administrador e o motorista
 * atribuído continuam a ver o conteúdo (garantido também pela base de dados).
 */
export const hidesAdminContent = (role?: string | null) => role === "manager" || role === "owner";

/** Título a apresentar tendo em conta o perfil de quem consulta. */
export const activityTitleFor = (a: Activity, role?: string | null) =>
  hidesAdminContent(role) && a.event_kind === "administration" ? ADMIN_GENERIC_TITLE : a.title;

/**
 * Garagem: quarto tratamento visual. Deriva sempre da cor do motorista, com
 * fundo muito claro, contorno sólido e texto neutro escuro. Não usa padrões,
 * deixando as riscas exclusivamente para o ajuste do motorista.
 */
export function garageStyle(color: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in srgb, ${color} 16%, var(--surface))`,
    backgroundImage: "none",
    borderColor: color,
    borderStyle: "solid",
    color: "var(--foreground)",
  };
}



/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

export function computeState(
  driverId: string,
  from: Date,
  to: Date,
  data: DriverDataset,
): { state: AvailabilityState; detail?: string } {
  const acts = data.activities.filter(
    (a) =>
      a.driver_id === driverId &&
      a.status !== "cancelled" &&
      occupiedIntervals(data.releases, a, effectiveStart(a), effectiveEnd(a)).some((interval) =>
        overlaps(interval.start, interval.end, from, to),
      ),
  );
  const conflicting = acts.length > 1;

  const leave = data.timeOff.find(
    (t) => t.driver_id === driverId && t.status === "approved" && dateOverlapsRange(t.start_date, t.end_date, from, to),
  );
  const unavail = data.unavailability.find(
    (u) => u.driver_id === driverId && u.status === "active" && overlaps(u.start_datetime, u.end_datetime, from, to),
  );

  if (conflicting) return { state: "CONFLICT", detail: `${acts.length} ocupações sobrepostas` };
  if (leave) return { state: "ON_LEAVE", detail: `${fmtDate(leave.start_date)} → ${fmtDate(leave.end_date)}` };
  if (unavail)
    return {
      state: "UNAVAILABLE",
      detail: `${fmtTime(unavail.start_datetime)}–${fmtTime(unavail.end_datetime)}`,
    };
  if (acts.length === 1)
    return {
      state: "BUSY",
      detail: `${acts[0]!.title} ${fmtTime(effectiveStart(acts[0]!))}–${fmtTime(effectiveEnd(acts[0]!))}`,
    };
  return { state: "AVAILABLE" };
}

/** Type of each detected conflict, so every screen can label it the same way. */
export type ConflictKind = "timeoff" | "unavailability" | "activity" | "conditional";

export type AvailabilityConflict = { kind: ConflictKind; message: string };

export const CONFLICT_LABEL: Record<ConflictKind, string> = {
  timeoff: "Férias / Ausência",
  unavailability: "Indisponibilidade",
  activity: "Serviço sobreposto",
  conditional: "A confirmar",
};

export const CONFLICT_CLASS: Record<ConflictKind, string> = {
  timeoff: "border-leave/40 bg-leave-soft text-leave",
  unavailability: "border-unavailable/40 bg-unavailable-soft text-unavailable",
  activity: "border-conflict/40 bg-conflict-soft text-conflict",
  conditional: "border-warning/50 bg-warning-soft text-warning",
};

/** Human sentence for a time-off period, distinguishing holiday from other absences. */
export function timeOffSentence(t: TimeOff): string {
  const range = `de ${fmtDate(t.start_date)} a ${fmtDate(t.end_date)}`;
  if (t.type === "holiday") return `Este motorista está de férias ${range}.`;
  if (t.type === "sick") return `Este motorista está de baixa médica ${range}.`;
  const label = TIMEOFF_TYPE_LABEL[t.type] ?? "Ausência";
  return `Este motorista está ausente ${range} (${label}).`;
}

export function unavailabilitySentence(u: Unavailability): string {
  return `Este motorista está marcado como indisponível de ${fmtDateTime(u.start_datetime)} a ${fmtDateTime(
    u.end_datetime,
  )}${u.reason ? ` (${u.reason})` : ""}.`;
}

export type AvailabilityResult = {
  status: AvailabilityStatus;
  reasons: string[];
  conflicts: AvailabilityConflict[];
};

export type AvailabilityOptions = {
  /** occupation window being requested (service + travel), not just the service */
  marginMinutes?: number;
  /** true when the requested city has no configured travel time */
  travelUnknown?: boolean;
  cityName?: string | null;
  ignoreActivityId?: string;
};

/**
 * Three-state availability for a requested occupation window.
 * Uses effective occupation (service + travel + driver adjustment).
 */
export function evaluateAvailability(
  driverId: string,
  occStart: Date,
  occEnd: Date,
  data: DriverDataset,
  opts: AvailabilityOptions = {},
): AvailabilityResult {
  const blocking: AvailabilityConflict[] = [];
  const conditional: AvailabilityConflict[] = [];
  const margin = (opts.marginMinutes ?? 60) * 60000;

  for (const t of data.timeOff) {
    if (t.driver_id !== driverId || t.status !== "approved") continue;
    if (dateOverlapsRange(t.start_date, t.end_date, occStart, occEnd)) {
      blocking.push({ kind: "timeoff", message: timeOffSentence(t) });
    }
  }

  for (const u of data.unavailability) {
    if (u.driver_id !== driverId || u.status !== "active") continue;
    if (overlaps(u.start_datetime, u.end_datetime, occStart, occEnd)) {
      blocking.push({ kind: "unavailability", message: unavailabilitySentence(u) });
    }
  }

  for (const a of data.activities) {
    if (a.driver_id !== driverId || a.status === "cancelled" || a.id === opts.ignoreActivityId) continue;
    const s = effectiveStart(a);
    const e = effectiveEnd(a);
    const occupied = occupiedIntervals(data.releases, a, s, e);
    const overlapping = occupied.find((interval) => overlaps(interval.start, interval.end, occStart, occEnd));
    if (overlapping) {
      blocking.push({
        kind: "activity",
        message: `Sobreposição com "${a.title}" (ocupação ${fmtDateTime(overlapping.start)} – ${fmtDateTime(overlapping.end)}${
          hasAdjustment(a) ? ", ajustada pelo motorista" : ""
        })`,
      });
      continue;
    }
    const nearest = occupied
      .map((interval) => ({
        interval,
        gap:
          interval.start.getTime() >= occEnd.getTime()
            ? interval.start.getTime() - occEnd.getTime()
            : occStart.getTime() >= interval.end.getTime()
              ? occStart.getTime() - interval.end.getTime()
              : -1,
      }))
      .filter(({ gap }) => gap >= 0)
      .sort((left, right) => left.gap - right.gap)[0];
    if (nearest && nearest.gap < margin) {
      conditional.push({
        kind: "conditional",
        message: `Apenas ${Math.round(nearest.gap / 60000)} min de intervalo para "${a.title}" (${fmtDateTime(nearest.interval.start)} – ${fmtDateTime(nearest.interval.end)})`,
      });
    }
    // another service with a location on the same calendar day
    if (occupied.some((interval) => isSameCalendarDay(interval.start, occStart)) && a.city_id) {
      conditional.push({ kind: "conditional", message: `Já tem outro serviço com deslocação no mesmo dia ("${a.title}")` });
    }
  }

  if (blocking.length) return { status: "UNAVAILABLE", reasons: messages(blocking), conflicts: dedupeConflicts(blocking) };

  if (opts.travelUnknown) {
    conditional.push({
      kind: "conditional",
      message: opts.cityName
        ? `A cidade "${opts.cityName}" não tem tempo de deslocação definido - ocupação não garantida`
        : "Sem cidade definida - não é possível calcular a deslocação",
    });
  }

  if (conditional.length) {
    const list = dedupeConflicts(conditional);
    return { status: "CONDITIONAL", reasons: messages(list), conflicts: list };
  }
  return { status: "AVAILABLE", reasons: [], conflicts: [] };
}

function messages(xs: AvailabilityConflict[]) {
  return dedupe(xs.map((c) => c.message));
}

function dedupeConflicts(xs: AvailabilityConflict[]) {
  const seen = new Set<string>();
  return xs.filter((c) => (seen.has(c.message) ? false : (seen.add(c.message), true)));
}

/** Compact status of a driver for a requested window - used in driver pickers. */
export type DriverBadge = { label: string; kind: ConflictKind | "available" };

export function driverBadge(
  driverId: string,
  from: Date,
  to: Date,
  data: DriverDataset,
  opts: AvailabilityOptions = {},
): DriverBadge {
  const res = evaluateAvailability(driverId, from, to, data, opts);
  if (res.status === "UNAVAILABLE") {
    const first = res.conflicts[0]!;
    if (first.kind === "timeoff") return { label: "Férias/Ausência", kind: "timeoff" };
    if (first.kind === "unavailability") return { label: "Indisponível", kind: "unavailability" };
    return { label: "Ocupado", kind: "activity" };
  }
  if (res.status === "CONDITIONAL") return { label: "A confirmar", kind: "conditional" };
  return { label: "Disponível", kind: "available" };
}

/**
 * Ordenação das listas de escolha manual de motorista: disponíveis primeiro,
 * indisponíveis a seguir, mantendo dentro de cada grupo a ordem recebida
 * (lista de prioridade). Não afeta a atribuição automática, que continua a
 * percorrer a hierarquia do Administrador por ordem de prioridade.
 */
export function sortByAvailability<T extends { id: string }>(
  list: T[],
  badges: Map<string, DriverBadge | undefined>,
): T[] {
  const rank = (kind?: DriverBadge["kind"]) => (kind === "available" ? 0 : kind === "conditional" ? 1 : 2);
  return list
    .map((item, index) => ({ item, index, busy: rank(badges.get(item.id)?.kind) }))
    .sort((a, b) => a.busy - b.busy || a.index - b.index)
    .map((e) => e.item);
}


export const DRIVER_BADGE_CLASS: Record<DriverBadge["kind"], string> = {
  available: "bg-available-soft text-available border-available/30",
  timeoff: "bg-leave-soft text-leave border-leave/30",
  unavailability: "bg-unavailable-soft text-unavailable border-unavailable/30",
  activity: "bg-conflict-soft text-conflict border-conflict/40",
  conditional: "bg-warning-soft text-warning border-warning/40",
};


function dedupe(xs: string[]) {
  return Array.from(new Set(xs));
}

function isSameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export function fmtTime(d: string | Date) {
  return new Date(d).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Formato português: DD/MM/AAAA. */
export function fmtDate(d: string | Date) {
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : new Date(d);
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}


export function fmtDateTime(d: string | Date) {
  return `${fmtDate(d)} ${fmtTime(d)}`;
}

export function fmtMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}


/* ------------------------------------------------------------------ */
/* Unified availability periods (ausências + indisponibilidades)       */
/* ------------------------------------------------------------------ */

export type AvailabilitySource = "timeoff" | "unavailability";

export type AvailabilityPeriod = {
  id: string;
  source: AvailabilitySource;
  start: Date;
  end: Date;
  allDay: boolean;
  reason: string | null;
  notes: string | null;
  kind: string;
  /** Version of the stored row, used to detect edits by other users. */
  updatedAt: string;
};

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function toDateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Every blocked period of a driver, whatever the underlying table. */
export function availabilityPeriods(driverId: string, data: DriverDataset): AvailabilityPeriod[] {
  const out: AvailabilityPeriod[] = [];
  for (const t of data.timeOff) {
    if (t.driver_id !== driverId || t.status === "cancelled" || t.status === "rejected") continue;
    out.push({
      id: t.id,
      source: "timeoff",
      start: startOfDay(new Date(`${t.start_date}T00:00:00`)),
      end: endOfDay(new Date(`${t.end_date}T00:00:00`)),
      allDay: true,
      reason: t.reason,
      notes: t.notes,
      kind: t.type,
      updatedAt: t.updated_at,
    });
  }
  for (const u of data.unavailability) {
    if (u.driver_id !== driverId || u.status !== "active") continue;
    out.push({
      id: u.id,
      source: "unavailability",
      start: new Date(u.start_datetime),
      end: new Date(u.end_datetime),
      allDay: false,
      reason: u.reason,
      notes: u.notes,
      kind: "other",
      updatedAt: u.updated_at,
    });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Working window used for day-level availability summaries. */
export const DAY_WINDOW_START_HOUR = 6;
export const DAY_WINDOW_END_HOUR = 22;

export function dayWindow(day: Date): [Date, Date] {
  const from = new Date(day);
  from.setHours(DAY_WINDOW_START_HOUR, 0, 0, 0);
  const to = new Date(day);
  to.setHours(DAY_WINDOW_END_HOUR, 0, 0, 0);
  return [from, to];
}

/**
 * Contextual availability for a specific day (or a precise window within it).
 * AVAILABLE  - nothing blocking the whole window
 * CONDITIONAL - partially occupied / tight margins
 * UNAVAILABLE - the whole window is blocked
 */
export function availabilityForWindow(
  driverId: string,
  from: Date,
  to: Date,
  data: DriverDataset,
  opts: AvailabilityOptions = {},
): AvailabilityResult {
  const direct = evaluateAvailability(driverId, from, to, data, opts);
  if (direct.status !== "UNAVAILABLE") return direct;

  // The window is not entirely blocked if a free slot of >= 60 min remains.
  const step = 30 * 60000;
  let freeRun = 0;
  let maxFree = 0;
  for (let t = from.getTime(); t < to.getTime(); t += step) {
    const slot = evaluateAvailability(driverId, new Date(t), new Date(t + step), data, opts);
    if (slot.status === "UNAVAILABLE") freeRun = 0;
    else freeRun += step;
    maxFree = Math.max(maxFree, freeRun);
  }
  if (maxFree >= 60 * 60000) {
    return { status: "CONDITIONAL", reasons: direct.reasons, conflicts: direct.conflicts };
  }
  return direct;
}

export function availabilityForDay(driverId: string, day: Date, data: DriverDataset, opts: AvailabilityOptions = {}) {
  const [from, to] = dayWindow(day);
  return availabilityForWindow(driverId, from, to, data, opts);
}

