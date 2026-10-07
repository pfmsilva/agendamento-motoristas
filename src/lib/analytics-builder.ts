import type { Json } from "@/integrations/supabase/types";
import type { Range } from "./analytics";

export type Visualization = "kpi" | "bar" | "horizontal_bar" | "line" | "area" | "donut" | "stacked" | "table" | "heatmap";
export type AnalyticsPeriod = "week" | "month" | "quarter" | "semester" | "year" | "custom";
export type AnalyticsFilters = {
  period: AnalyticsPeriod;
  from: string;
  to: string;
  driverIds: string[];
  administratorIds: string[];
  assistantIds: string[];
  tagIds: string[];
  kinds?: string[];
  cityIds?: string[];
};

export type MetricDefinition = {
  key: string;
  label: string;
  description: string;
  formula: string;
  included: string;
  excluded: string;
  assumptions: string;
  unit: "number" | "hours" | "percent";
  visualizations: Visualization[];
  dimensions: string[];
};

export const VISUALIZATIONS: { key: Visualization; label: string }[] = [
  { key: "kpi", label: "Cartão KPI" }, { key: "bar", label: "Barras" },
  { key: "horizontal_bar", label: "Barras horizontais" }, { key: "line", label: "Linha" },
  { key: "area", label: "Área" }, { key: "donut", label: "Circular / donut" },
  { key: "stacked", label: "Empilhado" }, { key: "table", label: "Tabela" },
  { key: "heatmap", label: "Mapa de densidade" },
];

export const DIMENSIONS = [
  { key: "none", label: "Sem dimensão" }, { key: "driver", label: "Motorista" },
  { key: "time", label: "Tempo" }, { key: "tag", label: "TAG" },
  { key: "administrator", label: "Administrador" }, { key: "assistant", label: "Assistente" },
  { key: "city", label: "Local" }, { key: "driver_hour", label: "Motorista × hora" },
];

export const METRICS: MetricDefinition[] = [
  {
    key: "occupancy_rate", label: "Ocupação dos motoristas", unit: "percent",
    description: "Percentagem da capacidade de trabalho disponível ocupada por serviços.",
    formula: "Minutos de ocupação efetiva únicos ÷ minutos de capacidade disponível × 100",
    included: "Serviço, deslocação calculada e ajustes manuais que intercetam o período.",
    excluded: "Eventos cancelados e minutos sobrepostos já contabilizados.",
    assumptions: "35 horas por semana (7 horas por dia útil), menos férias aprovadas e indisponibilidades ativas.",
    visualizations: ["kpi", "bar", "horizontal_bar", "line", "area", "table"], dimensions: ["none", "driver", "time"],
  },
  {
    key: "occupied_hours", label: "Horas de ocupação", unit: "hours",
    description: "Tempo operacional efetivo dos motoristas.",
    formula: "Soma dos intervalos efetivos unidos, limitada ao período",
    included: "Serviço, deslocação e ajuste final de ocupação.", excluded: "Cancelados e sobreposições duplicadas.",
    assumptions: "O ajuste substitui a ocupação calculada; não é somado.",
    visualizations: ["kpi", "bar", "horizontal_bar", "line", "area", "donut", "stacked", "table"], dimensions: ["none", "driver", "time", "tag", "administrator", "assistant", "city"],
  },
  {
    key: "service_count", label: "Número de serviços", unit: "number",
    description: "Quantidade de serviços que intercetam o período selecionado.", formula: "Contagem de serviços visíveis não cancelados",
    included: "Serviços com ocupação no período e filtros ativos.", excluded: "Cancelados e serviços não visíveis ao perfil.", assumptions: "Cada ocorrência recorrente conta como um serviço.",
    visualizations: ["kpi", "bar", "horizontal_bar", "line", "area", "donut", "stacked", "table"], dimensions: ["none", "driver", "time", "tag", "administrator", "assistant", "city"],
  },
  {
    key: "average_hours_driver", label: "Média por motorista", unit: "hours",
    description: "Carga média efetiva dos motoristas incluídos.", formula: "Minutos de ocupação efetiva únicos ÷ número de motoristas incluídos ÷ 60",
    included: "Motoristas ativos que respeitam os filtros.", excluded: "Sobreposições e cancelados.", assumptions: "Motoristas sem ocupação continuam incluídos na média.",
    visualizations: ["kpi", "bar", "horizontal_bar", "table"], dimensions: ["none", "driver"],
  },
  {
    key: "services_by_tag", label: "Serviços por motorista e TAG", unit: "number",
    description: "Distribuição dos serviços atribuídos a cada motorista pelas diferentes TAGs.",
    formula: "Contagem de serviços por motorista e TAG ÷ total do motorista (no modo percentagem)",
    included: "Serviços visíveis não cancelados com ocupação no período e motorista atribuído.",
    excluded: "Cancelados, serviços sem motorista atribuído e serviços não visíveis ao perfil.",
    assumptions: "Cada serviço conta uma vez e tem uma única TAG; cada TAG mantém sempre a mesma cor.",
    visualizations: ["stacked"], dimensions: ["tag"],
  },
  {
    key: "hourly_density", label: "Densidade horária", unit: "hours",
    description: "Frequência da ocupação de cada motorista por hora do dia.", formula: "Minutos únicos ocupados em cada intervalo horário, agregados pelos dias do período",
    included: "Ocupação efetiva final, incluindo deslocação e ajustes.", excluded: "Cancelados e sobreposições duplicadas.", assumptions: "A intensidade é normalizada pelo valor máximo visível.",
    visualizations: ["heatmap"], dimensions: ["driver_hour"],
  },
];

export const DEFAULT_FILTERS = (): AnalyticsFilters => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { period: "month", from: isoDate(from), to: isoDate(to), driverIds: [], administratorIds: [], assistantIds: [], tagIds: [], kinds: [], cityIds: [] };
};

export function isoDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function rangeFor(period: AnalyticsFilters["period"], anchor = new Date()): Pick<AnalyticsFilters, "from" | "to"> {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  let end: Date;
  if (period === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); end = new Date(start); end.setDate(end.getDate() + 6);
  } else if (period === "quarter") {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1); end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
  } else if (period === "semester") {
    start.setMonth(start.getMonth() < 6 ? 0 : 6, 1); end = new Date(start.getFullYear(), start.getMonth() + 6, 0);
  } else if (period === "year") {
    start.setMonth(0, 1); end = new Date(start.getFullYear(), 11, 31);
  } else {
    start.setDate(1); end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  }
  return { from: isoDate(start), to: isoDate(end) };
}

export function shiftPeriod(filters: AnalyticsFilters, direction: -1 | 1): AnalyticsFilters {
  const anchor = new Date(`${filters.from}T12:00:00`);
  if (filters.period === "week") anchor.setDate(anchor.getDate() + 7 * direction);
  else if (filters.period === "month") anchor.setMonth(anchor.getMonth() + direction);
  else if (filters.period === "quarter") anchor.setMonth(anchor.getMonth() + 3 * direction);
  else if (filters.period === "semester") anchor.setMonth(anchor.getMonth() + 6 * direction);
  else if (filters.period === "year") anchor.setFullYear(anchor.getFullYear() + direction);
  else return filters;
  return { ...filters, ...rangeFor(filters.period, anchor) };
}

export function parseFilters(value: Json): AnalyticsFilters {
  const fallback = DEFAULT_FILTERS();
  if (!value || Array.isArray(value) || typeof value !== "object") return fallback;
  const raw = value as Record<string, Json | undefined>;
  const period = ["week", "month", "quarter", "semester", "year", "custom"].includes(String(raw["period"])) ? raw["period"] as AnalyticsFilters["period"] : fallback.period;
  const strings = (key: string) => Array.isArray(raw[key]) ? (raw[key] as Json[]).filter((v): v is string => typeof v === "string") : [];
  const calculated = period === "custom" ? fallback : rangeFor(period);
  return { period, from: typeof raw["from"] === "string" ? raw["from"] : calculated.from, to: typeof raw["to"] === "string" ? raw["to"] : calculated.to, driverIds: strings("driverIds"), administratorIds: strings("administratorIds"), assistantIds: strings("assistantIds"), tagIds: strings("tagIds"), kinds: strings("kinds"), cityIds: strings("cityIds") };
}

export function filterRange(filters: AnalyticsFilters): Range {
  return { from: new Date(`${filters.from}T00:00:00`), to: new Date(`${filters.to}T23:59:59.999`) };
}

export function metric(key: string): MetricDefinition { return METRICS.find((item) => item.key === key) ?? METRICS[0] as MetricDefinition; }

/** Cor estável por TAG: o mesmo identificador devolve sempre o mesmo token de cor. */
export const TAG_COLOR_COUNT = 12;
export function tagColor(index: number) { return `var(--chart-${(((index % TAG_COLOR_COUNT) + TAG_COLOR_COUNT) % TAG_COLOR_COUNT) + 1})`; }
export function tagColorMap(tags: { id: string; sort_order: number }[]) {
  const ordered = [...tags].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const map = new Map<string, string>();
  ordered.forEach((tag, index) => map.set(tag.id, tagColor(index)));
  return map;
}
/* Períodos ---------------------------------------------------------- */

export const PERIOD_OPTIONS: { key: AnalyticsPeriod; label: string }[] = [
  { key: "week", label: "Semana" }, { key: "month", label: "Mês" }, { key: "quarter", label: "Trimestre" },
  { key: "semester", label: "Semestre" }, { key: "year", label: "Ano" }, { key: "custom", label: "Personalizado" },
];
export const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  week: "Semana", month: "Mês", quarter: "Trimestre", semester: "Semestre", year: "Ano", custom: "Personalizado",
};

const ptDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Número da semana ISO (1 a 53). */
export function isoWeek(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return { week: Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7), year: target.getUTCFullYear() };
}

/** Descrição do período analisado, sempre explícita quanto ao tipo (semana, mês, trimestre…). */
export function periodLabel(filters: AnalyticsFilters) {
  const start = new Date(`${filters.from}T12:00:00`);
  if (filters.period === "week") {
    const { week, year } = isoWeek(start);
    return `Semana ${week} de ${year} (${ptDate(filters.from)} a ${ptDate(filters.to)})`;
  }
  if (filters.period === "month") {
    const name = start.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  if (filters.period === "quarter") return `T${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`;
  if (filters.period === "semester") return `${start.getMonth() < 6 ? 1 : 2}.º semestre de ${start.getFullYear()}`;
  if (filters.period === "year") return `Ano ${start.getFullYear()}`;
  return `${ptDate(filters.from)} a ${ptDate(filters.to)}`;
}

/** Etiqueta curta para subtítulos: "Mês · Setembro de 2026". */
export const periodSummary = (filters: AnalyticsFilters) => `${PERIOD_LABEL[filters.period]} · ${periodLabel(filters)}`;

/* Escolha explícita do período (ano + índice) ------------------------ */

/** Segunda-feira da semana ISO indicada. */
export function isoWeekStart(year: number, week: number) {
  const jan4 = new Date(year, 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  return monday;
}

/** Número de semanas ISO de um ano (52 ou 53). */
export function isoWeeksInYear(year: number) {
  const dec28 = new Date(year, 11, 28);
  return isoWeek(dec28).week;
}

/** Ano e índice (semana/mês/trimestre/semestre) do período atualmente selecionado. */
export function periodParts(filters: AnalyticsFilters): { year: number; index: number } {
  const start = new Date(`${filters.from}T12:00:00`);
  if (filters.period === "week") {
    const { week, year } = isoWeek(start);
    return { year, index: week };
  }
  if (filters.period === "month") return { year: start.getFullYear(), index: start.getMonth() + 1 };
  if (filters.period === "quarter") return { year: start.getFullYear(), index: Math.floor(start.getMonth() / 3) + 1 };
  if (filters.period === "semester") return { year: start.getFullYear(), index: start.getMonth() < 6 ? 1 : 2 };
  return { year: start.getFullYear(), index: 1 };
}

/** Intervalo a partir de uma escolha explícita: ano + semana/mês/trimestre/semestre. */
export function rangeForParts(period: AnalyticsPeriod, year: number, index: number): Pick<AnalyticsFilters, "from" | "to"> {
  if (period === "week") {
    const start = isoWeekStart(year, Math.min(Math.max(index, 1), isoWeeksInYear(year)));
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { from: isoDate(start), to: isoDate(end) };
  }
  if (period === "month") return { from: isoDate(new Date(year, index - 1, 1)), to: isoDate(new Date(year, index, 0)) };
  if (period === "quarter") return { from: isoDate(new Date(year, (index - 1) * 3, 1)), to: isoDate(new Date(year, index * 3, 0)) };
  if (period === "semester") return { from: isoDate(new Date(year, (index - 1) * 6, 1)), to: isoDate(new Date(year, index * 6, 0)) };
  return { from: isoDate(new Date(year, 0, 1)), to: isoDate(new Date(year, 11, 31)) };
}

export const MONTH_NAMES_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Etiqueta compacta do período ativo: "Semana 38 · 2026", "Setembro · 2026", "T3 · 2026". */
export function periodBadge(filters: AnalyticsFilters) {
  const { year, index } = periodParts(filters);
  if (filters.period === "week") return `Semana ${index} · ${year}`;
  if (filters.period === "month") return `${MONTH_NAMES_PT[index - 1]} · ${year}`;
  if (filters.period === "quarter") return `T${index} · ${year}`;
  if (filters.period === "semester") return `${index}.º semestre · ${year}`;
  if (filters.period === "year") return `Ano · ${year}`;
  return `${ptDate(filters.from)} - ${ptDate(filters.to)}`;
}

/** Subtítulo do widget, com o tipo e o intervalo que alimentam realmente os dados. */
export function widgetPeriodLabel(filters: AnalyticsFilters) {
  const { year, index } = periodParts(filters);
  if (filters.period === "week") return `Semana · ${index} / ${year}`;
  if (filters.period === "month") return `Mês · ${MONTH_NAMES_PT[index - 1]} ${year}`;
  if (filters.period === "quarter") return `Trimestre · T${index} ${year}`;
  if (filters.period === "semester") return `Semestre · ${index}.º semestre ${year}`;
  if (filters.period === "year") return `Ano · ${year}`;
  return `Personalizado · ${ptDate(filters.from)} - ${ptDate(filters.to)}`;
}

export function formatMetric(value: number, unit: MetricDefinition["unit"]) {
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "hours") return `${value.toFixed(1)}h`;
  return Math.round(value).toLocaleString("pt-PT");
}