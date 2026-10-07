/**
 * Exportação Excel das Análises: uma linha por serviço (dados de detalhe, não resumos).
 * Respeita os filtros ativos do painel e só recebe os serviços que o utilizador já pode ver.
 * Serviços de Administração são exportados sem Título nem Notas (privacidade ADMIN).
 */
import { eventKindKeyOf, eventKindLabelOf } from "./scheduling";
import type { Activity } from "./scheduling";
import { releasedMs } from "./schedule-releases";

const pad = (value: number) => String(value).padStart(2, "0");

const dateCell = (value: string | null | undefined) => {
  if (!value) return "";
  const d = new Date(value);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const timeCell = (value: string | null | undefined) => {
  if (!value) return "";
  const d = new Date(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const dateTimeCell = (value: string | null | undefined) =>
  value ? `${dateCell(value)} ${timeCell(value)}` : "";

const minutesBetween = (from: string | null | undefined, to: string | null | undefined) =>
  from && to ? Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000)) : null;

/** Duração em formato consistente HH:MM. */
const durationCell = (minutes: number | null) =>
  minutes == null ? "" : `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

const KIND_LABEL: Record<string, string> = { administration: "Administração", garage: "Garagem" };
const TYPE_LABEL: Record<string, string> = {
  trip: "Deslocação",
  airport: "Aeroporto",
  meeting: "Reunião",
  event: "Evento",
  service: "Serviço",
  availability: "Disponibilidade",
  other: "Outro",
};
const STATUS_LABEL: Record<string, string> = { draft: "Rascunho", confirmed: "Confirmado", cancelled: "Cancelado" };
const ASSIGN_LABEL: Record<string, string> = { automatic: "Automática", manual: "Manual", pending_manual: "Por atribuir" };

export type ExportLookups = {
  driverNames: Map<string, string>;
  administratorNames: Map<string, string>;
  assistantNames: Map<string, string>;
  tagLabels: Map<string, string>;
  cityNames: Map<string, string>;
  reasonLabels: Map<string, string>;
  userNames: Map<string, string>;
};

const name = (map: Map<string, string>, id: string | null | undefined) => (id ? (map.get(id) ?? "") : "");

/** Horário libertado e ocupação contabilizada (sem os intervalos libertados). */
function occupationTotals(a: Activity) {
  const s = a.effective_start ?? a.calculated_occupation_start ?? a.start_datetime;
  const e = a.effective_end ?? a.calculated_occupation_end ?? a.end_datetime;
  const total = minutesBetween(s, e) ?? 0;
  const freed = Math.round(releasedMs(a, new Date(s), new Date(e)) / 60000);
  return {
    "Horário libertado": durationCell(freed),
    "Ocupação contabilizada": durationCell(Math.max(0, total - freed)),
  };
}

export function serviceRows(activities: Activity[], lookups: ExportLookups) {
  return [...activities]
    .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime))
    .map((a) => {
      const isAdmin = a.event_kind === "administration";
      const travelCalculated =
        (minutesBetween(a.calculated_occupation_start, a.start_datetime) ?? 0) +
        (minutesBetween(a.end_datetime, a.calculated_occupation_end) ?? 0);
      const adjustedStart = a.driver_adjusted_start ?? null;
      const adjustedEnd = a.driver_adjusted_end ?? null;
      const travelAdjusted =
        adjustedStart || adjustedEnd
          ? (minutesBetween(adjustedStart ?? a.calculated_occupation_start, a.start_datetime) ?? 0) +
            (minutesBetween(a.end_datetime, adjustedEnd ?? a.calculated_occupation_end) ?? 0)
          : null;
      return {
        "ID do serviço": a.id,
        Data: dateCell(a.start_datetime),
        "Hora de início": timeCell(a.start_datetime),
        "Hora de fim": timeCell(a.end_datetime),
        Duração: durationCell(minutesBetween(a.start_datetime, a.end_datetime)),
        Motorista: name(lookups.driverNames, a.driver_id),
        "Tipo de evento": a.event_kind_label_snapshot ?? KIND_LABEL[eventKindKeyOf(a)] ?? eventKindLabelOf(eventKindKeyOf(a)),
        "Tipo de atividade": TYPE_LABEL[String(a.type)] ?? String(a.type),
        TAG: name(lookups.tagLabels, a.tag_id),
        Título: isAdmin ? "" : (a.title ?? ""),
        Administrador: name(lookups.administratorNames, a.administrator_id),
        Assistente: name(lookups.assistantNames, a.assistant_id),
        Origem: name(lookups.cityNames, a.origin_city_id) || (a.origin ?? ""),
        Destino: name(lookups.cityNames, a.city_id) || (a.destination ?? ""),
        "Ida e volta": a.round_trip ? "Sim" : "Não",
        "Deslocação calculada": durationCell(travelCalculated),
        "Deslocação ajustada": durationCell(travelAdjusted),
        "Diferença de deslocação (min)": travelAdjusted == null ? "" : travelAdjusted - travelCalculated,
        "Motivo do ajuste": a.adjustment_reason_label_snapshot ?? name(lookups.reasonLabels, a.adjustment_reason_id),
        "Ajustado por": name(lookups.userNames, a.adjusted_by),
        "Data do ajuste": dateTimeCell(a.adjusted_at),
        "Ocupação (início)": dateTimeCell(a.effective_start ?? a.calculated_occupation_start),
        "Ocupação (fim)": dateTimeCell(a.effective_end ?? a.calculated_occupation_end),
        ...occupationTotals(a),
        Estado: STATUS_LABEL[String(a.status)] ?? String(a.status),
        Atribuição: ASSIGN_LABEL[String(a.assignment_status)] ?? String(a.assignment_status),
        "Conflito autorizado": a.override_conflict ? "Sim" : "Não",
        "Série recorrente": a.series_id ?? "",
        "N.º na série": a.series_index ?? "",
        "Motorista original": name(lookups.driverNames, a.original_driver_id),
        "Motivo de reatribuição": a.reassign_reason ?? "",
        "Data de reatribuição": dateTimeCell(a.reassigned_at),
        Notas: isAdmin ? "" : (a.notes ?? ""),
        "Criado em": dateTimeCell(a.created_at),
        "Criado por": name(lookups.userNames, a.created_by),
        "Atualizado em": dateTimeCell(a.updated_at),
        "Atualizado por": name(lookups.userNames, a.updated_by),
      };
    });
}

const WIDTHS = [
  38, 12, 14, 12, 10, 22, 18, 18, 20, 34, 22, 22, 22, 22, 12, 20, 20, 26, 26, 22, 18, 20, 20, 14, 16, 18, 38, 12,
  22, 30, 20, 50, 18, 22, 18, 22, 18, 22,
];

export async function downloadServicesExcel(activities: Activity[], lookups: ExportLookups, period: { from: string; to: string }) {
  const XLSX = await import("xlsx");
  const rows = serviceRows(activities, lookups);
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = WIDTHS.map((wch) => ({ wch }));
  if (rows.length) sheet["!autofilter"] = { ref: sheet["!ref"] as string };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Serviços");
  XLSX.writeFile(book, `servicos-${period.from}-a-${period.to}.xlsx`);
}
