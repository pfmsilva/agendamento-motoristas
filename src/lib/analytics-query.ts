import type { Json } from "@/integrations/supabase/types";
import {
  effectiveEnd,
  effectiveStart,
  eventKindKeyOf,
  eventKindLabelOf,
  hasAdjustment,
  type Activity,
} from "./scheduling";
import { occupiedHoursIn } from "./schedule-releases";
import { filterRange, tagColor, type AnalyticsFilters } from "./analytics-builder";
import { KIND_COLOR } from "./analytics-insights";
import type { AnalyticsOccupancyRow } from "./data";

/* ------------------------------------------------------------------ *
 * Catálogo genérico de campos (dimensões e medidas) das Análises.
 * O construtor de gráficos combina campos com papéis visuais, por isso
 * acrescentar novas dimensões/medidas não obriga a refazer a interface.
 * ------------------------------------------------------------------ */

export type Unit = "number" | "hours" | "percent";
export type AggKind = "count" | "count_distinct" | "sum" | "avg" | "min" | "max" | "percent";

export const AGG_LABELS: Record<AggKind, string> = {
  count: "Contagem",
  count_distinct: "Contagem distinta",
  sum: "Soma",
  avg: "Média",
  min: "Mínimo",
  max: "Máximo",
  percent: "Percentagem do total",
};

export type LookupContext = {
  driverNames: Map<string, string>;
  administratorNames: Map<string, string>;
  assistantNames: Map<string, string>;
  tagLabels: Map<string, string>;
  tagColors: Map<string, string>;
  /** Cores fixas das TAGs associadas a Administração e Garagem. */
  semanticTagColors: Map<string, string>;
  /** Cor do perfil de cada motorista (mesma do calendário). */
  driverColors: Map<string, string>;
  cityNames: Map<string, string>;
};

export type DimensionDef = {
  key: string;
  label: string;
  group: "Operação" | "Tempo" | "Local";
  /** Chave e etiqueta do grupo a que a atividade pertence. */
  value: (activity: Activity, ctx: LookupContext) => { id: string; label: string; order?: number } | null;
};

const pad = (value: number) => String(value).padStart(2, "0");
const startDate = (activity: Activity) => new Date(activity.start_datetime);
const MONTHS = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const KIND_LABELS: Record<string, string> = { service: "Serviço", garage: "Garagem", administration: "Administração", time_off: "Férias", unavailability: "Indisponibilidade" };

export const DIMENSIONS: DimensionDef[] = [
  { key: "driver", label: "Motorista", group: "Operação", value: (a, c) => (a.driver_id ? { id: a.driver_id, label: c.driverNames.get(a.driver_id) ?? "Motorista" } : { id: "__none__", label: "Por atribuir" }) },
  { key: "administrator", label: "Administrador", group: "Operação", value: (a, c) => (a.administrator_id ? { id: a.administrator_id, label: c.administratorNames.get(a.administrator_id) ?? "Administrador" } : { id: "__none__", label: "Sem Administrador" }) },
  { key: "assistant", label: "Assistente", group: "Operação", value: (a, c) => (a.assistant_id ? { id: a.assistant_id, label: c.assistantNames.get(a.assistant_id) ?? "Assistente" } : { id: "__none__", label: "Sem Assistente" }) },
  { key: "tag", label: "TAG", group: "Operação", value: (a, c) => (a.tag_id ? { id: a.tag_id, label: c.tagLabels.get(a.tag_id) ?? "TAG" } : { id: "__none__", label: "Sem TAG" }) },
  // O rótulo vem da configuração de tipos de evento; o histórico mantém a chave gravada.
  { key: "event_kind", label: "Tipo de evento", group: "Operação", value: (a) => { const key = eventKindKeyOf(a); return { id: key, label: a.event_kind_label_snapshot ?? KIND_LABELS[key] ?? eventKindLabelOf(key) }; } },
  { key: "assignment_status", label: "Tipo de atribuição", group: "Operação", value: (a) => ({ id: String(a.assignment_status), label: a.assignment_status === "automatic" ? "Automática" : a.assignment_status === "manual" ? "Manual" : "Por atribuir" }) },
  { key: "origin", label: "Origem", group: "Local", value: (a, c) => { const label = (a.origin_city_id ? c.cityNames.get(a.origin_city_id) : null) ?? a.origin ?? "Sem origem"; return { id: a.origin_city_id ?? label, label }; } },
  { key: "destination", label: "Destino", group: "Local", value: (a, c) => { const label = (a.city_id ? c.cityNames.get(a.city_id) : null) ?? a.destination ?? "Sem destino"; return { id: a.city_id ?? label, label }; } },
  { key: "date", label: "Data", group: "Tempo", value: (a) => { const d = startDate(a); const id = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; return { id, label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, order: d.getTime() }; } },
  { key: "weekday", label: "Dia da semana", group: "Tempo", value: (a) => { const d = startDate(a); const index = (d.getDay() + 6) % 7; return { id: String(index), label: WEEKDAYS[d.getDay()] ?? "", order: index }; } },
  { key: "week", label: "Semana", group: "Tempo", value: (a) => { const d = startDate(a); const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)); return { id: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`, label: `Semana de ${pad(start.getDate())}/${pad(start.getMonth() + 1)}`, order: start.getTime() }; } },
  { key: "month", label: "Mês", group: "Tempo", value: (a) => { const d = startDate(a); return { id: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, order: d.getFullYear() * 12 + d.getMonth() }; } },
  { key: "semester", label: "Semestre", group: "Tempo", value: (a) => { const d = startDate(a); const semester = d.getMonth() < 6 ? 1 : 2; return { id: `${d.getFullYear()}-S${semester}`, label: `${semester}.º semestre ${d.getFullYear()}`, order: d.getFullYear() * 2 + semester }; } },
  { key: "year", label: "Ano", group: "Tempo", value: (a) => { const d = startDate(a); return { id: String(d.getFullYear()), label: String(d.getFullYear()), order: d.getFullYear() }; } },
  { key: "hour", label: "Hora do dia", group: "Tempo", value: (a) => { const hour = startDate(a).getHours(); return { id: String(hour), label: `${pad(hour)}:00`, order: hour }; } },
];

export const dimension = (key: string | null | undefined) => DIMENSIONS.find((item) => item.key === key) ?? null;

export type MeasureDef = {
  key: string;
  label: string;
  unit: Unit;
  description: string;
  formula: string;
  included: string;
  excluded: string;
  assumptions: string;
  aggregations: AggKind[];
  defaultAgg: AggKind;
  /** Valor numérico por serviço; medidas especiais calculam de outra forma. */
  value?: (activity: Activity, range: { from: Date; to: Date }) => number;
  special?: "occupancy_rate" | "working_days" | "driver_count";
};

const MS_HOUR = 3_600_000;
// Horários libertados nunca contam como horas ocupadas.
const serviceHours = (a: Activity, range: { from: Date; to: Date }) => occupiedHoursIn(a, new Date(a.start_datetime), new Date(a.end_datetime), range);
const occupiedHours = (a: Activity, range: { from: Date; to: Date }) => occupiedHoursIn(a, effectiveStart(a), effectiveEnd(a), range);

export const MEASURES: MeasureDef[] = [
  {
    key: "service_count", label: "Número de serviços", unit: "number",
    description: "Quantidade de serviços que intercetam o período selecionado.",
    formula: "Contagem de serviços visíveis não cancelados",
    included: "Serviços com ocupação no período e filtros ativos.",
    excluded: "Cancelados e serviços não visíveis ao perfil.",
    assumptions: "Cada ocorrência recorrente conta como um serviço.",
    aggregations: ["count", "percent"], defaultAgg: "count", value: () => 1,
  },
  {
    key: "occupied_hours", label: "Horas de ocupação", unit: "hours",
    description: "Tempo operacional efetivo, incluindo deslocação e ajustes.",
    formula: "Soma dos intervalos efetivos, limitada ao período",
    included: "Serviço, deslocação calculada e ajuste final de ocupação.",
    excluded: "Cancelados e tempo fora do período.",
    assumptions: "O ajuste substitui a ocupação calculada; não é somado.",
    aggregations: ["sum", "avg", "min", "max", "percent"], defaultAgg: "sum", value: occupiedHours,
  },
  {
    key: "service_hours", label: "Horas de serviço", unit: "hours",
    description: "Duração do serviço sem deslocação nem ajustes.",
    formula: "Soma de (fim − início), limitada ao período",
    included: "Horário agendado do serviço.", excluded: "Deslocação, ajustes e cancelados.",
    assumptions: "Só conta a parte do serviço dentro do período.",
    aggregations: ["sum", "avg", "min", "max", "percent"], defaultAgg: "sum", value: serviceHours,
  },
  {
    key: "travel_hours", label: "Horas de deslocação", unit: "hours",
    description: "Tempo de deslocação calculado além do horário do serviço.",
    formula: "Horas de ocupação − horas de serviço (mínimo 0)",
    included: "Deslocação calculada a partir do local e ajustes que a prolongam.",
    excluded: "Cancelados e valores negativos.",
    assumptions: "Ajustes manuais podem alterar a deslocação efetiva.",
    aggregations: ["sum", "avg", "min", "max", "percent"], defaultAgg: "sum",
    value: (a, range) => Math.max(0, occupiedHours(a, range) - serviceHours(a, range)),
  },
  {
    key: "adjusted_hours", label: "Horas ajustadas manualmente", unit: "hours",
    description: "Ocupação de serviços cujo horário foi ajustado manualmente.",
    formula: "Soma das horas de ocupação dos serviços com ajuste manual",
    included: "Serviços com ajuste manual registado.", excluded: "Serviços sem ajuste e cancelados.",
    assumptions: "Conta a ocupação total do serviço ajustado.",
    aggregations: ["sum", "avg", "max", "percent"], defaultAgg: "sum",
    value: (a, range) => (hasAdjustment(a) ? occupiedHours(a, range) : 0),
  },
  {
    key: "avg_service_duration", label: "Duração média do serviço", unit: "hours",
    description: "Duração média de cada serviço no período.",
    formula: "Horas de serviço ÷ número de serviços",
    included: "Serviços visíveis não cancelados.", excluded: "Cancelados.",
    assumptions: "Serviços que atravessam o período contam apenas a parte incluída.",
    aggregations: ["avg", "sum", "min", "max"], defaultAgg: "avg", value: serviceHours,
  },
  {
    key: "working_days", label: "Dias com serviços", unit: "number",
    description: "Número de dias distintos com pelo menos um serviço.",
    formula: "Contagem de dias distintos com ocupação",
    included: "Dias com serviços visíveis não cancelados.", excluded: "Dias sem serviços.",
    assumptions: "Conta o dia de início de cada serviço.",
    aggregations: ["count_distinct"], defaultAgg: "count_distinct", special: "working_days",
  },
  {
    key: "driver_count", label: "Motoristas distintos", unit: "number",
    description: "Número de motoristas distintos com serviços atribuídos.",
    formula: "Contagem distinta de motoristas com serviços",
    included: "Motoristas com pelo menos um serviço no período.", excluded: "Serviços por atribuir.",
    assumptions: "Cada motorista conta uma vez.",
    aggregations: ["count_distinct"], defaultAgg: "count_distinct", special: "driver_count",
  },
  {
    key: "occupancy_rate", label: "Ocupação (%)", unit: "percent",
    description: "Percentagem da capacidade de trabalho disponível que está ocupada.",
    formula: "Minutos de ocupação únicos ÷ minutos de capacidade disponível × 100",
    included: "Serviço, deslocação calculada e ajustes manuais no período.",
    excluded: "Cancelados e minutos sobrepostos já contabilizados.",
    assumptions: "35 horas por semana (7 horas por dia útil), menos férias aprovadas e indisponibilidades ativas.",
    aggregations: ["percent"], defaultAgg: "percent", special: "occupancy_rate",
  },
];

export const measure = (key: string | null | undefined) => MEASURES.find((item) => item.key === key) ?? (MEASURES[0] as MeasureDef);

/* ------------------------------------------------------------------ *
 * Tipos de visualização e papéis de campo
 * ------------------------------------------------------------------ */

export type VizKind =
  | "kpi" | "bar" | "hbar" | "stacked_bar" | "stacked_hbar" | "percent_stacked_bar"
  | "line" | "area" | "combo" | "pie" | "donut" | "heatmap" | "table" | "matrix" | "scatter";

export type Role = "axis" | "legend" | "values" | "rows" | "columns" | "tooltips";

export type VizDef = {
  key: VizKind;
  label: string;
  icon: string;
  /** Papéis mostrados no construtor, pela ordem. */
  roles: Role[];
  axisLabel?: string;
  legendLabel?: string;
  valuesLabel?: string;
  maxValues: number;
  stacked?: boolean;
  horizontal?: boolean;
  percentStack?: boolean;
};

export const VISUALIZATIONS: VizDef[] = [
  { key: "kpi", label: "Cartão KPI", icon: "gauge", roles: ["values"], valuesLabel: "Medida", maxValues: 1 },
  { key: "bar", label: "Barras verticais", icon: "bar", roles: ["axis", "values", "legend", "tooltips"], maxValues: 3 },
  { key: "hbar", label: "Barras horizontais", icon: "hbar", roles: ["axis", "values", "legend", "tooltips"], maxValues: 3, horizontal: true },
  { key: "stacked_bar", label: "Barras empilhadas", icon: "stacked", roles: ["axis", "values", "legend", "tooltips"], legendLabel: "Legenda / empilhamento", maxValues: 1, stacked: true },
  { key: "stacked_hbar", label: "Barras horizontais empilhadas", icon: "stackedh", roles: ["axis", "values", "legend", "tooltips"], legendLabel: "Legenda / empilhamento", maxValues: 1, stacked: true, horizontal: true },
  { key: "percent_stacked_bar", label: "Empilhado 100%", icon: "percent", roles: ["axis", "values", "legend", "tooltips"], legendLabel: "Legenda / empilhamento", maxValues: 1, stacked: true, percentStack: true, horizontal: true },
  { key: "line", label: "Linha", icon: "line", roles: ["axis", "values", "legend", "tooltips"], axisLabel: "Eixo X", maxValues: 3 },
  { key: "area", label: "Área", icon: "area", roles: ["axis", "values", "legend", "tooltips"], axisLabel: "Eixo X", maxValues: 3 },
  { key: "combo", label: "Linha + barras", icon: "combo", roles: ["axis", "values", "tooltips"], axisLabel: "Eixo X", valuesLabel: "Medidas (1.ª em barras, seguintes em linha)", maxValues: 3 },
  { key: "pie", label: "Circular", icon: "pie", roles: ["axis", "values"], axisLabel: "Categoria / legenda", maxValues: 1 },
  { key: "donut", label: "Donut", icon: "donut", roles: ["axis", "values"], axisLabel: "Categoria / legenda", maxValues: 1 },
  { key: "heatmap", label: "Mapa de densidade", icon: "heatmap", roles: ["rows", "columns", "values"], valuesLabel: "Valor / intensidade", maxValues: 1 },
  { key: "table", label: "Tabela", icon: "table", roles: ["axis", "values"], axisLabel: "Colunas de agrupamento", valuesLabel: "Medidas", maxValues: 4 },
  { key: "matrix", label: "Matriz", icon: "matrix", roles: ["rows", "columns", "values"], maxValues: 1 },
  { key: "scatter", label: "Dispersão", icon: "scatter", roles: ["axis", "values", "tooltips"], axisLabel: "Pontos (dimensão)", valuesLabel: "Medidas (X e Y)", maxValues: 2 },
];

export const visualization = (key: string | null | undefined) => VISUALIZATIONS.find((item) => item.key === key) ?? (VISUALIZATIONS[1] as VizDef);

export const ROLE_LABELS: Record<Role, string> = {
  axis: "Eixo",
  legend: "Legenda / série",
  values: "Valores",
  rows: "Linhas",
  columns: "Colunas",
  tooltips: "Detalhe (tooltip)",
};

/* ------------------------------------------------------------------ *
 * Configuração guardada do widget
 * ------------------------------------------------------------------ */

export type ValueField = { measure: string; agg: AggKind; label?: string | null };
export type SortConfig = { by: "category" | "measure"; direction: "asc" | "desc" };

export type WidgetConfig = {
  viz: VizKind;
  axis: string | null;
  legend: string | null;
  rows: string | null;
  columns: string | null;
  values: ValueField[];
  tooltips: ValueField[];
  sort: SortConfig;
  comparePrevious: boolean;
  target: number | null;
};

export const DEFAULT_CONFIG = (): WidgetConfig => ({
  viz: "bar", axis: "driver", legend: null, rows: "driver", columns: "hour",
  values: [{ measure: "service_count", agg: "count" }], tooltips: [],
  sort: { by: "measure", direction: "desc" }, comparePrevious: false, target: null,
});

const str = (value: unknown) => (typeof value === "string" && value ? value : null);

function parseValues(value: unknown): ValueField[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): ValueField | null => {
      const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const key = str(raw["measure"]);
      if (!key || !MEASURES.some((m) => m.key === key)) return null;
      const def = measure(key);
      const agg = typeof raw["agg"] === "string" && def.aggregations.includes(raw["agg"] as AggKind) ? (raw["agg"] as AggKind) : def.defaultAgg;
      const label = str(raw["label"]);
      return { measure: key, agg, ...(label ? { label } : {}) } as ValueField;
    })
    .filter((item): item is ValueField => item !== null);
}

/** Converte widgets antigos (métrica + visualização + dimensão) para a nova configuração. */
function legacyConfig(widget: { metric_key: string; visualization: string; dimension_key: string | null }): WidgetConfig {
  const base = DEFAULT_CONFIG();
  if (widget.metric_key === "services_by_tag") {
    return { ...base, viz: "stacked_hbar", axis: "driver", legend: "tag", values: [{ measure: "service_count", agg: "count" }], sort: { by: "measure", direction: "desc" } };
  }
  if (widget.metric_key === "hourly_density" || widget.visualization === "heatmap") {
    return { ...base, viz: "heatmap", rows: "driver", columns: "hour", values: [{ measure: "occupied_hours", agg: "sum" }] };
  }
  const measureKey = widget.metric_key === "average_hours_driver" ? "occupied_hours" : MEASURES.some((m) => m.key === widget.metric_key) ? widget.metric_key : "service_count";
  const def = measure(measureKey);
  const viz: VizKind = widget.visualization === "kpi" ? "kpi"
    : widget.visualization === "horizontal_bar" ? "hbar"
    : widget.visualization === "donut" ? "donut"
    : widget.visualization === "stacked" ? "stacked_bar"
    : widget.visualization === "table" ? "table"
    : widget.visualization === "line" ? "line"
    : widget.visualization === "area" ? "area" : "bar";
  const axis = widget.dimension_key && widget.dimension_key !== "none" && dimension(widget.dimension_key) ? widget.dimension_key : "driver";
  return { ...base, viz, axis, legend: null, values: [{ measure: measureKey, agg: widget.metric_key === "average_hours_driver" ? "avg" : def.defaultAgg }] };
}

export function parseWidgetConfig(widget: { metric_key: string; visualization: string; dimension_key: string | null; config: Json }): WidgetConfig {
  const raw = (widget.config && typeof widget.config === "object" && !Array.isArray(widget.config) ? widget.config : {}) as Record<string, unknown>;
  const viz = str(raw["viz"]);
  if (!viz || !VISUALIZATIONS.some((item) => item.key === viz)) return legacyConfig(widget);
  const values = parseValues(raw["values"]);
  const sortRaw = (raw["sort"] && typeof raw["sort"] === "object" ? raw["sort"] : {}) as Record<string, unknown>;
  return {
    viz: viz as VizKind,
    axis: str(raw["axis"]),
    legend: str(raw["legend"]),
    rows: str(raw["rows"]),
    columns: str(raw["columns"]),
    values: values.length ? values : DEFAULT_CONFIG().values,
    tooltips: parseValues(raw["tooltips"]),
    sort: { by: sortRaw["by"] === "category" ? "category" : "measure", direction: sortRaw["direction"] === "asc" ? "asc" : "desc" },
    comparePrevious: raw["comparePrevious"] === true,
    target: typeof raw["target"] === "number" ? raw["target"] : null,
  };
}

export const configToJson = (config: WidgetConfig): Json => JSON.parse(JSON.stringify(config)) as Json;

/* ------------------------------------------------------------------ *
 * Filtragem e cálculo
 * ------------------------------------------------------------------ */

export function applyFilters(activities: Activity[], filters: AnalyticsFilters, range = filterRange(filters)) {
  return activities.filter((item) => {
    if (item.status === "cancelled") return false;
    const start = new Date(item.effective_start ?? item.start_datetime);
    const end = new Date(item.effective_end ?? item.end_datetime);
    if (start > range.to || end < range.from) return false;
    if (filters.driverIds.length && !(item.driver_id && filters.driverIds.includes(item.driver_id))) return false;
    if (filters.administratorIds.length && !(item.administrator_id && filters.administratorIds.includes(item.administrator_id))) return false;
    if (filters.assistantIds.length && !(item.assistant_id && filters.assistantIds.includes(item.assistant_id))) return false;
    if (filters.tagIds.length && !(item.tag_id && filters.tagIds.includes(item.tag_id))) return false;
    if (filters.kinds?.length && !filters.kinds.includes(String(item.event_kind))) return false;
    if (filters.cityIds?.length && !(item.city_id && filters.cityIds.includes(item.city_id))) return false;
    return true;
  });
}

export type Cell = {
  value: number;
  extras: { label: string; value: string }[];
  /** Nº de serviços que contribuíram para esta célula, no mesmo período e filtros. */
  serviceCount: number;
};
export type Category = { id: string; label: string; order?: number; total: number; color?: string };
export type SeriesKey = { key: string; label: string; color: string; unit: Unit };

export type Dataset = {
  config: WidgetConfig;
  categories: Category[];
  series: SeriesKey[];
  cells: Map<string, Cell>;
  kpi: { value: number; unit: Unit; previous: number | null; target: number | null };
  empty: boolean;
};

const cellKey = (categoryId: string, seriesKey: string) => `${categoryId}\u0000${seriesKey}`;

function aggregate(def: MeasureDef, agg: AggKind, items: Activity[], range: { from: Date; to: Date }, grandTotal?: number): number {
  if (def.special === "working_days") return new Set(items.map((a) => a.start_datetime.slice(0, 10))).size;
  if (def.special === "driver_count") return new Set(items.map((a) => a.driver_id).filter(Boolean)).size;
  const values = items.map((a) => (def.value ? def.value(a, range) : 1));
  if (!values.length) return 0;
  const sum = values.reduce((total, value) => total + value, 0);
  switch (agg) {
    case "count": return values.length;
    case "count_distinct": return new Set(values).size;
    case "avg": return sum / values.length;
    case "min": return Math.min(...values);
    case "max": return Math.max(...values);
    case "percent": return grandTotal ? (sum / grandTotal) * 100 : 0;
    default: return sum;
  }
}

function occupancyRate(rows: AnalyticsOccupancyRow[], driverIds: Set<string> | null) {
  let occupied = 0; let capacity = 0;
  for (const row of rows) {
    if (driverIds && !driverIds.has(row.driver_id)) continue;
    occupied += Number(row.occupied_minutes); capacity += Number(row.capacity_minutes);
  }
  return capacity ? (occupied / capacity) * 100 : 0;
}

function valueLabel(field: ValueField) {
  const def = measure(field.measure);
  if (field.label) return field.label;
  return field.agg === def.defaultAgg ? def.label : `${def.label} · ${AGG_LABELS[field.agg]}`;
}

export function formatValue(value: number, unit: Unit) {
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "hours") return `${value.toFixed(1)}h`;
  return Math.round(value).toLocaleString("pt-PT");
}

export const paletteColor = (index: number) => `var(--chart-${(index % 12) + 1})`;

/** Cor semântica quando a categoria, e não a série, representa o significado visual. */
function categoryColor(axisKey: string | null, id: string, ctx: LookupContext) {
  if (axisKey === "event_kind") return KIND_COLOR[id as keyof typeof KIND_COLOR];
  if (axisKey === "driver") return ctx.driverColors.get(id);
  if (axisKey === "tag") return ctx.semanticTagColors.get(id) ?? ctx.tagColors.get(id);
  return undefined;
}

type BuildInput = {
  config: WidgetConfig;
  activities: Activity[];
  previousActivities?: Activity[];
  occupancy: AnalyticsOccupancyRow[];
  filters: AnalyticsFilters;
  ctx: LookupContext;
};

export function buildDataset({ config, activities, previousActivities = [], occupancy, filters, ctx }: BuildInput): Dataset {
  const range = filterRange(filters);
  const viz = visualization(config.viz);
  const axisKey = viz.roles.includes("rows") ? config.rows : config.axis;
  const legendKey = viz.roles.includes("columns") ? config.columns : viz.roles.includes("legend") ? config.legend : null;
  const axisDim = dimension(axisKey);
  const legendDim = dimension(legendKey);
  const valueFields = config.values.length ? config.values.slice(0, viz.maxValues) : DEFAULT_CONFIG().values;

  const primary = valueFields[0] as ValueField;
  const primaryDef = measure(primary.measure);

  /* KPI ------------------------------------------------------------ */
  const kpiValue = primaryDef.special === "occupancy_rate"
    ? occupancyRate(occupancy, null)
    : aggregate(primaryDef, primary.agg, activities, range, aggregate(primaryDef, "sum", activities, range));
  const previousValue = config.comparePrevious && primaryDef.special !== "occupancy_rate"
    ? aggregate(primaryDef, primary.agg, previousActivities, range, aggregate(primaryDef, "sum", previousActivities, range))
    : null;

  if (viz.key === "kpi" || !axisDim) {
    return { config, categories: [], series: [], cells: new Map(), kpi: { value: kpiValue, unit: primaryDef.unit, previous: previousValue, target: config.target }, empty: !activities.length };
  }

  /* Agrupamento ------------------------------------------------------ */
  const groups = new Map<string, { label: string; order?: number; items: Activity[] }>();
  const sub = new Map<string, { label: string; order?: number; color?: string; items: Activity[] }>();
  const buckets = new Map<string, Activity[]>();

  for (const activity of activities) {
    const category = axisDim.value(activity, ctx);
    if (!category) continue;
    const group = groups.get(category.id) ?? { label: category.label, ...(category.order === undefined ? {} : { order: category.order }), items: [] };
    group.items.push(activity);
    groups.set(category.id, group);
    const legendValue = legendDim ? legendDim.value(activity, ctx) : null;
    const seriesId = legendValue ? legendValue.id : "__value__";
    if (legendValue && !sub.has(seriesId)) {
      /** TAG mantém a sua cor; tipos de evento usam a convenção semântica; Motorista usa o perfil. */
      const fixedColor =
        legendKey === "tag"
          ? ctx.semanticTagColors.get(seriesId) ?? ctx.tagColors.get(seriesId)
          : legendKey === "event_kind"
            ? KIND_COLOR[seriesId as keyof typeof KIND_COLOR]
            : legendKey === "driver"
              ? ctx.driverColors.get(seriesId)
              : undefined;
      sub.set(seriesId, { label: legendValue.label, ...(legendValue.order === undefined ? {} : { order: legendValue.order }), ...(fixedColor ? { color: fixedColor } : {}), items: [] });
    }
    const key = cellKey(category.id, seriesId);
    const bucket = buckets.get(key) ?? [];
    bucket.push(activity);
    buckets.set(key, bucket);
    if (legendValue) (sub.get(seriesId) as { items: Activity[] }).items.push(activity);
  }

  /* Séries ----------------------------------------------------------- */
  const series: SeriesKey[] = legendDim
    ? [...sub.entries()]
        .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0) || a[1].label.localeCompare(b[1].label, "pt-PT"))
        .map(([key, value], index) => ({ key, label: value.label, color: value.color ?? paletteColor(index), unit: primaryDef.unit }))
    : valueFields.map((field, index) => ({ key: `value_${index}`, label: valueLabel(field), color: paletteColor(index), unit: measure(field.measure).unit }));

  const grandTotals = new Map<string, number>();
  for (const field of valueFields) {
    const def = measure(field.measure);
    grandTotals.set(field.measure, def.value ? activities.reduce((total, item) => total + (def.value as (a: Activity, r: { from: Date; to: Date }) => number)(item, range), 0) : activities.length);
  }

  const cells = new Map<string, Cell>();
  const categories: Category[] = [];

  for (const [categoryId, group] of groups) {
    let total = 0;
    const driverSet = new Set(group.items.map((item) => item.driver_id).filter((id): id is string => !!id));
    for (const seriesItem of series) {
      const items = legendDim ? buckets.get(cellKey(categoryId, seriesItem.key)) ?? [] : group.items;
      const field = legendDim ? primary : (valueFields[Number(seriesItem.key.split("_")[1])] as ValueField);
      const def = measure(field.measure);
      const value = def.special === "occupancy_rate"
        ? occupancyRate(occupancy, axisKey === "driver" ? new Set([categoryId]) : driverSet)
        : aggregate(def, field.agg, items, range, grandTotals.get(field.measure) ?? 0);
      total += value;
      const extras = config.tooltips.map((extra) => {
        const extraDef = measure(extra.measure);
        const extraValue = extraDef.special === "occupancy_rate"
          ? occupancyRate(occupancy, axisKey === "driver" ? new Set([categoryId]) : driverSet)
          : aggregate(extraDef, extra.agg, items, range, grandTotals.get(extra.measure) ?? 0);
        return { label: valueLabel(extra), value: formatValue(extraValue, extraDef.unit) };
      });
      cells.set(cellKey(categoryId, seriesItem.key), { value, extras, serviceCount: items.length });
    }
    const color = categoryColor(axisKey, categoryId, ctx);
    categories.push({ id: categoryId, label: group.label, ...(group.order === undefined ? {} : { order: group.order }), ...(color ? { color } : {}), total });
  }

  const timeOrdered = categories.every((item) => item.order !== undefined);
  categories.sort((a, b) => {
    if (config.sort.by === "category" || timeOrdered) {
      const compare = timeOrdered ? (a.order ?? 0) - (b.order ?? 0) : a.label.localeCompare(b.label, "pt-PT");
      return config.sort.by === "category" && config.sort.direction === "desc" && !timeOrdered ? -compare : compare;
    }
    return config.sort.direction === "asc" ? a.total - b.total : b.total - a.total;
  });

  return { config, categories, series, cells, kpi: { value: kpiValue, unit: primaryDef.unit, previous: previousValue, target: config.target }, empty: !categories.length };
}

export const datasetCell = (dataset: Dataset, categoryId: string, seriesKey: string) => dataset.cells.get(cellKey(categoryId, seriesKey));
export const seriesLabel = valueLabel;
