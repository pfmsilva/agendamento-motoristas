import { format } from "date-fns";
import { downloadExcelRows } from "./excel-export";
import { loanStatus, LOAN_STATUS_LABEL, type LoanEvent, type LoanEventType, type LoanVehicle } from "./loan-vehicles";

const date = (iso: string) => format(new Date(iso), "dd/MM/yyyy");
const time = (iso: string) => format(new Date(iso), "HH:mm");
const dateTime = (iso: string | null | undefined) => iso ? format(new Date(iso), "dd/MM/yyyy HH:mm") : "";

export function loanVehicleRows(
  events: LoanEvent[],
  vehicles: LoanVehicle[],
  types: LoanEventType[],
  userNames: Record<string, string>,
) {
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const typeByKey = new Map(types.map((type) => [type.key, type]));
  return [...events].sort((a, b) => a.start_datetime.localeCompare(b.start_datetime)).map((event) => {
    const vehicle = vehicleById.get(event.vehicle_id);
    const type = typeByKey.get(event.kind);
    return {
      "ID do registo": event.id,
      "Tipo de registo": event.kind_label_snapshot ?? type?.label ?? event.kind,
      Título: event.person_name ?? event.kind_label_snapshot ?? type?.label ?? event.kind,
      Data: date(event.start_datetime),
      "Hora de início": time(event.start_datetime),
      "Data de fim": event.permanent ? "" : date(event.end_datetime),
      "Hora de fim": event.permanent ? "" : time(event.end_datetime),
      Matrícula: vehicle?.plate ?? "",
      Marca: vehicle?.brand ?? "",
      Modelo: vehicle?.model ?? "",
      "Pessoa associada": event.person_name ?? "",
      "Alocação permanente": event.permanent ? "Sim" : "Não",
      "Alocação temporária": !event.permanent && Boolean(type?.allows_permanent) ? "Sim" : "Não",
      Inspeção: event.kind === "inspection" ? "Sim" : "Não",
      Estado: LOAN_STATUS_LABEL[loanStatus(event)],
      Cancelado: event.cancelled ? "Sim" : "Não",
      "Motivo de cancelamento": event.cancel_reason ?? "",
      Notas: event.notes ?? "",
      "Criado por": event.created_by ? userNames[event.created_by] ?? event.created_by : "",
      "Criado em": dateTime(event.created_at),
      "Atualizado em": dateTime(event.updated_at),
      "Chave do tipo": event.kind,
    };
  });
}

export async function downloadLoanVehiclesExcel(
  events: LoanEvent[],
  vehicles: LoanVehicle[],
  types: LoanEventType[],
  userNames: Record<string, string>,
  period: { from: string; to: string },
) {
  await downloadExcelRows(
    loanVehicleRows(events, vehicles, types, userNames),
    "Eventos de viaturas",
    `viaturas-${period.from}-a-${period.to}.xlsx`,
    [38, 24, 28, 12, 14, 12, 14, 14, 18, 18, 24, 20, 20, 12, 14, 12, 28, 45, 24, 20, 20, 20].map((width) => ({ width })),
  );
}