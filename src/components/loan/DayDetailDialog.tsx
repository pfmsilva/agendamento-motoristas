import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatDuration,
  minutesOnDay,
  ptTime,
  LOAN_STATUS_LABEL,
  loanStatus,
  loanTypeLabel,
  type LoanEvent,
  type LoanEventType,
  type LoanVehicle,
} from "@/lib/loan-vehicles";

/** Atividade de uma viatura num dia (aberta a partir da vista Mês). */
export function DayDetailDialog({
  open,
  onOpenChange,
  vehicle,
  day,
  events,
  eventTypes,
  onOpenEvent,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: LoanVehicle | null;
  day: Date | null;
  events: LoanEvent[];
  eventTypes: LoanEventType[];
  onOpenEvent: (event: LoanEvent) => void;
  onCreate: (kind: string) => void;
}) {
  if (!vehicle || !day) return null;
  const total = events.reduce((s, e) => s + minutesOnDay(e, day), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {vehicle.plate} — {format(day, "dd/MM/yyyy")}
          </DialogTitle>
          <DialogDescription>Ocupação total: {formatDuration(total)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {events.length === 0 && (
            <p className="text-sm text-muted-foreground">Sem atividade registada neste dia.</p>
          )}
          {events.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onOpenEvent(e)}
              className="block w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm hover:bg-surface"
            >
               <span className="font-semibold">{loanTypeLabel(e, eventTypes)}</span>
               {e.person_name && <span className="block">{e.person_name}</span>}
               <span className="block text-xs text-muted-foreground">
                 {e.permanent
                    ? `${loanTypeLabel(e, eventTypes)} permanente`
                   : `${ptTime(e.start_datetime)}–${ptTime(e.end_datetime)}`}
               </span>
              <span className="ml-2 text-xs text-muted-foreground">{LOAN_STATUS_LABEL[loanStatus(e)]}</span>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={() => onCreate("allocation")}>
            <Plus className="size-4" />Novo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
