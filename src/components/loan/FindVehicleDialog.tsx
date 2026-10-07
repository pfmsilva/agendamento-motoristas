import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/DateInput";
import { TimeInput } from "@/components/TimeInput";
import {
  blockingEvents,
  allocationConflictReason,
  overlaps,
  ptDateTime,
  type LoanEvent,
  type LoanVehicle,
} from "@/lib/loan-vehicles";

const toDate = (date: string, time: string) => new Date(`${date}T${time}:00`);
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Pesquisa de viaturas livres num período. A disponibilidade é recalculada
 * automaticamente a cada alteração — não há botão de pesquisa.
 */
export function FindVehicleDialog({
  open,
  onOpenChange,
  vehicles,
  events,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicles: LoanVehicle[];
  events: LoanEvent[];
  onChoose: (vehicleId: string, startDate: string, startTime: string, endDate: string, endTime: string) => void;
}) {
  const [startDate, setStartDate] = useState(isoToday());
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(isoToday());
  const [endTime, setEndTime] = useState("18:00");

  useEffect(() => {
    if (!open) return;
    setStartDate(isoToday());
    setEndDate(isoToday());
  }, [open]);

  const results = useMemo(() => {
    const start = toDate(startDate, startTime);
    const end = toDate(endDate, endTime);
    const valid = startDate && endDate && end > start;
    const blocking = blockingEvents(events);
    const rows = vehicles
      .filter((v) => v.active)
      .map((v) => {
        const clash = valid
          ? blocking.find(
              (e) =>
                e.vehicle_id === v.id &&
                overlaps(start, end, new Date(e.start_datetime), new Date(e.end_datetime)),
            )
          : undefined;
        return { vehicle: v, clash };
      });
    return {
      valid,
      rows: [...rows].sort((a, b) => Number(!!a.clash) - Number(!!b.clash)),
    };
  }, [vehicles, events, startDate, startTime, endDate, endTime]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Encontrar viatura disponível</DialogTitle>
          <DialogDescription>A disponibilidade é atualizada automaticamente.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label>Data de início</Label>
            <DateInput value={startDate} onChange={setStartDate} aria-label="Data de início" />
          </div>
          <div>
            <Label>Hora de início</Label>
            <TimeInput value={startTime} onChange={setStartTime} aria-label="Hora de início" />
          </div>
          <div>
            <Label>Data de fim</Label>
            <DateInput value={endDate} onChange={setEndDate} aria-label="Data de fim" />
          </div>
          <div>
            <Label>Hora de fim</Label>
            <TimeInput value={endTime} onChange={setEndTime} aria-label="Hora de fim" />
          </div>
        </div>

        {!results.valid ? (
          <p className="text-sm text-muted-foreground">Indique um período válido (o fim tem de ser posterior ao início).</p>
        ) : (
          <div className="max-h-[50vh] space-y-2 overflow-auto pr-1">
            {results.rows.map(({ vehicle, clash }) => (
              <div
                key={vehicle.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{vehicle.plate}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {clash
                      ? `Indisponível — ${allocationConflictReason(clash)}`
                      : [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Disponível no período indicado"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      clash ? "bg-muted text-muted-foreground" : "bg-available-soft text-available"
                    }`}
                  >
                    {clash ? "Indisponível" : "Disponível"}
                  </span>
                  <Button
                    size="sm"
                    disabled={!!clash}
                    onClick={() => onChoose(vehicle.id, startDate, startTime, endDate, endTime)}
                  >
                    Alocar
                  </Button>
                </div>
              </div>
            ))}
            {results.rows.length === 0 && (
              <p className="text-sm text-muted-foreground">Ainda não há viaturas ativas registadas.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
