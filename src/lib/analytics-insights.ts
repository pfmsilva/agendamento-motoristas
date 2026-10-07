import {
  effectiveEnd,
  effectiveStart,
  occupationEnd,
  occupationStart,
  type Activity,
  type TimeOff,
  type Unavailability,
} from "./scheduling";
import { occupiedIntervals, cachedReleases } from "./schedule-releases";

/* ------------------------------------------------------------------ *
 * Motor comum das análises pré-definidas.
 * Usa exatamente os mesmos eventos operacionais do calendário e a
 * ocupação efetiva final (ajuste manual > ocupação calculada > horário).
 * ------------------------------------------------------------------ */

/** Carga padrão assumida: 35 horas por semana completa = 7 horas por dia útil. */
export const MINUTES_PER_WORKING_DAY = 420;
export const HOURS_PER_WORKING_WEEK = 35;
export const MS_MINUTE = 60_000;

export type Interval = { start: number; end: number };

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].filter((item) => item.end > item.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const item of sorted) {
    const last = out[out.length - 1];
    if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
    else out.push({ ...item });
  }
  return out;
}

export function clipIntervals(list: Interval[], from: number, to: number): Interval[] {
  return list
    .map((item) => ({ start: Math.max(item.start, from), end: Math.min(item.end, to) }))
    .filter((item) => item.end > item.start);
}

export const totalMinutes = (list: Interval[]) =>
  list.reduce((sum, item) => sum + (item.end - item.start) / MS_MINUTE, 0);

/** Minutos únicos (sobreposições unidas uma única vez) dentro de uma janela. */
export const uniqueMinutes = (list: Interval[], from: number, to: number) =>
  totalMinutes(clipIntervals(mergeIntervals(list), from, to));

export const serviceInterval = (a: Activity): Interval => ({
  start: new Date(a.start_datetime).getTime(),
  end: new Date(a.end_datetime).getTime(),
});
export const calculatedInterval = (a: Activity): Interval => ({
  start: occupationStart(a).getTime(),
  end: occupationEnd(a).getTime(),
});
export const effectiveInterval = (a: Activity): Interval => ({
  start: effectiveStart(a).getTime(),
  end: effectiveEnd(a).getTime(),
});

/** Troços efetivamente ocupados (libertações subtraídas). */
export const occupiedIntervalsOf = (a: Activity, pick: (a: Activity) => Interval = effectiveInterval): Interval[] => {
  const base = pick(a);
  if (!a.driver_id) return [base];
  return occupiedIntervals(cachedReleases(), a, new Date(base.start), new Date(base.end)).map((i) => ({
    start: i.start.getTime(),
    end: i.end.getTime(),
  }));
};

/* Dias úteis ------------------------------------------------------- */

export function workingDays(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day > 0 && day < 6) out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export const dayBounds = (day: Date): Interval => ({
  start: new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime(),
  end: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime(),
});

const isoDay = (day: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
};

/** Dias úteis cobertos por férias aprovadas do motorista. */
export function holidayDays(days: Date[], timeOff: TimeOff[]): Set<string> {
  const out = new Set<string>();
  for (const day of days) {
    const key = isoDay(day);
    if (timeOff.some((item) => item.status === "approved" && item.start_date <= key && item.end_date >= key)) out.add(key);
  }
  return out;
}

export const unavailabilityIntervals = (rows: Unavailability[]): Interval[] =>
  mergeIntervals(
    rows
      .filter((row) => row.status === "active")
      .map((row) => ({ start: new Date(row.start_datetime).getTime(), end: new Date(row.end_datetime).getTime() })),
  );

/**
 * Capacidade disponível em minutos: 420 min por dia útil, menos os dias de
 * férias aprovadas e menos as indisponibilidades ativas (máximo de um dia).
 */
export function capacityMinutes(days: Date[], timeOff: TimeOff[], unavailability: Unavailability[]): number {
  const holidays = holidayDays(days, timeOff);
  const blocks = unavailabilityIntervals(unavailability);
  let total = 0;
  for (const day of days) {
    if (holidays.has(isoDay(day))) continue;
    const bounds = dayBounds(day);
    const blocked = Math.min(MINUTES_PER_WORKING_DAY, totalMinutes(clipIntervals(blocks, bounds.start, bounds.end)));
    total += Math.max(0, MINUTES_PER_WORKING_DAY - blocked);
  }
  return total;
}

/* Formatação -------------------------------------------------------- */

export function fmtHm(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, "0")}m`;
}
export const fmtHours = (minutes: number) => `${(minutes / 60).toFixed(1)}h`;
export const fmtPercent = (value: number) => `${value.toFixed(1)}%`;
export const fmtDate = (value: Date) =>
  value.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
export const fmtMinutes = (minutes: number) => `${Math.round(minutes)} min`;

/* Tipo de evento: cores consistentes em todas as análises ------------ */

export type EventKind = "administration" | "garage";
export const KIND_ORDER: EventKind[] = ["administration", "garage"];
export const KIND_LABEL: Record<EventKind, string> = { administration: "ADMIN", garage: "Garagem" };
/** Convenção semântica fixa: Administração = #4F6D7A; Garagem = #AD6F5A. */
export const KIND_COLOR: Record<EventKind, string> = { administration: "var(--kind-administration)", garage: "var(--kind-garage)" };
export const kindOf = (a: Activity): EventKind => (a.event_kind === "garage" ? "garage" : "administration");

/**
 * As TAGs associadas aos tipos semânticos herdam sempre a respetiva cor fixa.
 * Além do mapeamento configurado, as TAGs de sistema (admin/garagem) também
 * herdam a cor, para que nenhuma análise volte a usar a paleta genérica.
 */
export function semanticTagColorMap(
  mappings: { kind: string; tag_id: string }[],
  tags: { id: string; system_key?: string | null; label?: string }[] = [],
) {
  const colors = new Map<string, string>();
  for (const tag of tags) {
    const key = (tag.system_key ?? "").toLowerCase();
    const label = (tag.label ?? "").toLowerCase();
    if (key === "garage" || label === "garagem") colors.set(tag.id, KIND_COLOR.garage);
    else if (key === "admin" || key === "administration" || label === "administração" || label === "admin") colors.set(tag.id, KIND_COLOR.administration);
  }
  for (const mapping of mappings) {
    if (mapping.kind === "administration" || mapping.kind === "garage") colors.set(mapping.tag_id, KIND_COLOR[mapping.kind]);
  }
  return colors;
}

/* Segmentos de tempo ------------------------------------------------ */

export const SEGMENT_LABEL = { service: "Tempo de serviço", travel: "Deslocação calculada", adjust: "Ajuste do motorista" } as const;
export type TimeSegment = keyof typeof SEGMENT_LABEL;
/** Variações derivadas da cor semântica do tipo, sem mudar o significado da categoria. */
export const kindSegmentColor = (kind: EventKind, segment: TimeSegment) => {
  const base = KIND_COLOR[kind];
  if (segment === "travel") return `color-mix(in srgb, ${base} 78%, var(--surface))`;
  if (segment === "adjust") return `color-mix(in srgb, ${base} 58%, var(--surface))`;
  return base;
};

/* Períodos de agregação --------------------------------------------- */

export type Grain = "day" | "week" | "month" | "semester" | "year";
export const GRAIN_LABEL: Record<Grain, string> = {
  day: "Dia",
  week: "Semana",
  month: "Mês",
  semester: "Semestre",
  year: "Ano",
};

export type Bucket = { id: string; label: string; from: number; to: number; days: Date[] };

const MONTHS = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
const pad = (value: number) => String(value).padStart(2, "0");

function bucketOf(day: Date, grain: Grain): { id: string; label: string } {
  if (grain === "day") return { id: isoDay(day), label: `${pad(day.getDate())}/${pad(day.getMonth() + 1)}` };
  if (grain === "week") {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7));
    return { id: `w-${isoDay(start)}`, label: `Semana de ${pad(start.getDate())}/${pad(start.getMonth() + 1)}` };
  }
  if (grain === "month") return { id: `m-${day.getFullYear()}-${pad(day.getMonth() + 1)}`, label: `${MONTHS[day.getMonth()]} ${day.getFullYear()}` };
  if (grain === "semester") {
    const semester = day.getMonth() < 6 ? 1 : 2;
    return { id: `s-${day.getFullYear()}-${semester}`, label: `${semester}.º semestre ${day.getFullYear()}` };
  }
  return { id: `y-${day.getFullYear()}`, label: String(day.getFullYear()) };
}

/** Divide o período em intervalos de agregação, guardando os dias úteis de cada um. */
export function buildBuckets(from: Date, to: Date, grain: Grain): Bucket[] {
  const map = new Map<string, Bucket>();
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= end) {
    const { id, label } = bucketOf(cursor, grain);
    const bounds = dayBounds(cursor);
    const current = map.get(id) ?? { id, label, from: bounds.start, to: bounds.end, days: [] };
    current.from = Math.min(current.from, bounds.start);
    current.to = Math.max(current.to, bounds.end);
    const weekday = cursor.getDay();
    if (weekday > 0 && weekday < 6) current.days.push(new Date(cursor));
    map.set(id, current);
    cursor.setDate(cursor.getDate() + 1);
  }
  return [...map.values()].sort((a, b) => a.from - b.from);
}

export const defaultGrain = (period: string): Grain =>
  period === "week" ? "day" : period === "month" ? "week" : period === "semester" ? "month" : period === "year" ? "month" : "week";

/* ------------------------------------------------------------------ *
 * Catálogo das análises pré-definidas e respetiva documentação.
 * O texto do ícone "i" descreve o cálculo realmente implementado.
 * ------------------------------------------------------------------ */

export type InsightInfo = {
  label: string;
  description: string;
  formula: string;
  included: string;
  excluded: string;
  assumptions: string;
};

const CAPACITY_NOTE =
  "Capacidade disponível = 7 horas por dia útil (35 horas por semana completa, proporcional em semanas parciais), menos dias de férias aprovadas e menos indisponibilidades ativas (nunca abaixo de zero).";
const OVERLAP_NOTE =
  "Os intervalos de cada motorista são unidos antes de somar, por isso períodos sobrepostos contam uma única vez.";

export const INSIGHTS: Record<string, InsightInfo> = {
  driver_occupancy: {
    label: "Ocupação por motorista",
    description:
      "Percentagem da capacidade de trabalho de cada motorista que está ocupada, com as horas ocupadas e as horas disponíveis no mesmo gráfico.",
    formula: "Ocupação % = Horas ocupadas ÷ Horas disponíveis × 100",
    included:
      "Ocupação efetiva final de cada evento (tempo de serviço + deslocação calculada + ajuste manual do motorista), limitada ao período filtrado.",
    excluded: "Eventos cancelados, eventos fora do período e minutos sobrepostos já contados.",
    assumptions: `${CAPACITY_NOTE} Usam-se dias úteis (segunda a sexta), não dias de calendário. ${OVERLAP_NOTE}`,
  },
  occupancy_evolution: {
    label: "Evolução da ocupação",
    description: "Evolução da ocupação de cada motorista ao longo do tempo, com uma linha por motorista.",
    formula: "Ocupação % do intervalo = Horas ocupadas no intervalo ÷ Horas disponíveis no intervalo × 100",
    included: "Ocupação efetiva final recortada a cada intervalo de agregação (dia, semana, mês, semestre ou ano).",
    excluded: "Eventos cancelados, intervalos sem dias úteis e minutos sobrepostos já contados.",
    assumptions: `${CAPACITY_NOTE} A capacidade é recalculada em cada intervalo com os dias úteis desse intervalo. ${OVERLAP_NOTE} A medida apresentada pode ser alternada entre ocupação (%) e horas ocupadas.`,
  },
  time_breakdown: {
    label: "Serviço, deslocação e ajustes",
    description:
      "Composição do tempo de cada motorista, separada em duas barras por motorista: ADMIN e Garagem.",
    formula:
      "Serviço = minutos únicos do horário agendado · Deslocação = minutos únicos da ocupação calculada − serviço · Ajuste = minutos únicos da ocupação efetiva − ocupação calculada",
    included:
      "Tempo de serviço (início a fim agendados), deslocação calculada a partir dos tempos configurados por cidade e tempo acrescentado por ajuste manual do motorista.",
    excluded: "Eventos cancelados, tempo fora do período e reduções de ajuste abaixo da ocupação calculada (não são negativas).",
    assumptions: `Cada componente é unido separadamente por motorista e tipo de evento antes de somar, por isso eventos sobrepostos não são contados duas vezes. ${"ADMIN e Garagem nunca são misturados na mesma barra."}`,
  },
  avg_duration_by_tag: {
    label: "Duração média por motorista e TAG",
    description: "Duração média de um serviço, por motorista, repartida por TAG.",
    formula: "Duração média = Duração total dos serviços do motorista nessa TAG ÷ Número desses serviços",
    included: "Serviços com motorista atribuído e horário agendado (início a fim), por TAG.",
    excluded:
      "Eventos cancelados, blocos de disponibilidade, férias e indisponibilidades — não são serviços e não contribuem para a duração média.",
    assumptions:
      "Usa o horário agendado do serviço (sem deslocação nem ajustes). A média mostra sempre o número de serviços analisados. Cada TAG mantém a sua cor em todas as análises.",
  },
  travel_accuracy: {
    label: "Deslocação calculada vs. ajustada",
    description:
      "Compara o tempo de deslocação configurado com o tempo efetivamente ajustado, para identificar rotas em que os tempos configurados divergem sistematicamente da realidade.",
    formula:
      "Diferença (min) = Deslocação ajustada − Deslocação calculada · Diferença % = (ajustada − calculada) ÷ calculada × 100 (não calculada quando a deslocação calculada é 0)",
    included:
      "Eventos com deslocação: calculada = ocupação calculada − horário do serviço; ajustada = ocupação efetiva final − horário do serviço.",
    excluded: "Eventos cancelados e eventos sem deslocação calculada nem ajustada.",
    assumptions:
      "Quando o agrupamento reúne várias viagens, mostram-se médias por viagem. Agrupamento disponível por rota (origem → destino), motorista ou cidade de destino.",
  },
  driver_availability: {
    label: "Disponibilidade ao longo do dia",
    description:
      "Número médio de motoristas realmente disponíveis para receber um novo serviço em cada hora do dia.",
    formula:
      "Média = Soma dos motoristas disponíveis nessa hora em todos os dias úteis analisados ÷ Número de dias úteis analisados",
    included:
      "Todos os motoristas ativos abrangidos pelos filtros. Um motorista conta como disponível numa hora se não tiver qualquer bloqueio nessa hora.",
    excluded:
      "Horas bloqueadas por serviços, deslocação, ajustes, férias aprovadas e indisponibilidades ativas. Fins de semana não entram na média.",
    assumptions:
      "Uma hora conta como ocupada sempre que existe alguma sobreposição, mesmo parcial. Os bloqueios de cada motorista são unidos antes de avaliar a hora.",
  },
  driver_detail: {
    label: "Detalhe por motorista",
    description:
      "Tabela analítica por motorista com totais de serviços, ocupação e capacidade, expansível para o detalhe por TAG.",
    formula: "Ocupação % = Horas ocupadas ÷ Horas disponíveis × 100",
    included:
      "Serviços visíveis não cancelados no período, ocupação efetiva final e capacidade de trabalho do motorista. O detalhe por TAG mostra o número de serviços e as horas de ocupação de cada TAG.",
    excluded: "Eventos cancelados e dados que o perfil atual não pode consultar.",
    assumptions: `${CAPACITY_NOTE} O total de horas do motorista une as sobreposições; as horas por TAG somam cada evento individualmente, pelo que a soma das TAGs pode ultrapassar o total.`,
  },
};

export const insightInfo = (key: string): InsightInfo | null => INSIGHTS[key] ?? null;
export const isInsight = (key: string) => key in INSIGHTS;
