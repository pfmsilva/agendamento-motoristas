import { AvailabilityDialog } from "@/components/AvailabilityDialog";
import type { TimeOffRow } from "@/components/WeekCalendar";
import { endOfDay, startOfDay, type AvailabilityPeriod } from "@/lib/scheduling";

/** Converte a linha de férias/ausência no período que o modal de edição já sabe tratar. */
export function timeOffToPeriod(t: TimeOffRow): AvailabilityPeriod {
  return {
    id: t.id,
    source: "timeoff",
    start: startOfDay(new Date(`${t.start_date}T00:00:00`)),
    end: endOfDay(new Date(`${t.end_date}T00:00:00`)),
    allDay: true,
    reason: t.reason,
    notes: t.notes,
    kind: t.type,
    updatedAt: t.updated_at,
  };
}

/**
 * Abre o mesmo modal de períodos usado pelo Motorista, a partir de um bloco de
 * férias/ausência clicado no calendário. As permissões continuam a ser as da
 * base de dados (RLS) — aqui nada é alargado.
 */
export function TimeOffEditDialog({
  timeOff,
  open,
  onOpenChange,
}: {
  timeOff: TimeOffRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!timeOff) return null;
  return (
    <AvailabilityDialog
      open={open}
      onOpenChange={onOpenChange}
      driverId={timeOff.driver_id}
      period={timeOffToPeriod(timeOff)}
    />
  );
}
