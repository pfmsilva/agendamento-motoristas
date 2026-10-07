import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AvailabilityWarning } from "@/components/AvailabilityWarning";
import { DriverStatusBadge } from "@/components/DriverStatusBadge";
import { useAssignServiceDriver } from "@/lib/data";
import { errorMessagePt } from "@/lib/errors";
import {
  ASSIGNMENT_LABEL,
  assignmentAttempts,
  driverBadge,
  effectiveEnd,
  effectiveStart,
  evaluateAvailability,
  fmtDateTime,
  sortByAvailability,
  type Activity,
  type Driver,
  type DriverDataset,
} from "@/lib/scheduling";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activity: Activity | null;
  drivers: Driver[];
  data: DriverDataset;
  canOverride: boolean;
};

/**
 * Atribuição / reatribuição manual de motorista (Owner, Gestor, Administrador).
 * Mostra a disponibilidade de cada motorista para a ocupação do serviço antes de confirmar.
 */
export function ManualAssignDialog({ open, onOpenChange, activity, drivers, data, canOverride }: Props) {
  const assign = useAssignServiceDriver();
  const [driverId, setDriverId] = useState("");
  const [override, setOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDriverId(activity?.driver_id ?? "");
    setOverride(false);
    setError(null);
  }, [open, activity?.id]);

  const occStart = activity ? effectiveStart(activity) : null;
  const occEnd = activity ? effectiveEnd(activity) : null;

  const badges = useMemo(() => {
    const m = new Map<string, ReturnType<typeof driverBadge>>();
    if (!activity || !occStart || !occEnd) return m;
    for (const d of drivers) {
      m.set(d.id, driverBadge(d.id, occStart, occEnd, data, { ignoreActivityId: activity.id }));
    }
    return m;
  }, [activity?.id, drivers, data, occStart?.getTime(), occEnd?.getTime()]);

  const availability = useMemo(() => {
    if (!activity || !driverId || !occStart || !occEnd) return null;
    return evaluateAvailability(driverId, occStart, occEnd, data, { ignoreActivityId: activity.id });
  }, [activity?.id, driverId, data, occStart?.getTime(), occEnd?.getTime()]);

  const blocked = availability?.status === "UNAVAILABLE";
  // Assinatura do conflito: muda de motorista ou de tipo de conflito repõem a confirmação.
  const conflictKey = `${driverId}|${availability?.status ?? ""}|${(availability?.conflicts ?? [])
    .map((c) => c.kind)
    .join(",")}`;
  useEffect(() => {
    setOverride(false);
    setError(null);
  }, [conflictKey]);

  const attempts = activity ? assignmentAttempts(activity) : [];
  const active = drivers.filter((d) => d.active || d.id === activity?.driver_id);
  // Disponíveis primeiro; os indisponíveis continuam visíveis, marcados, no fim.
  const orderedDrivers = sortByAvailability(active, badges);

  const confirm = async () => {
    if (!activity) return;
    setError(null);
    if (!driverId) {
      setError("Selecione o motorista.");
      return;
    }
    if (blocked && !override) {
      setError(
        canOverride
          ? "Existe conflito. Confirme que quer atribuir mesmo assim."
          : "Existe conflito neste período. Só um gestor pode forçar a atribuição.",
      );
      return;
    }
    try {
      await assign.mutateAsync({
        id: activity.id,
        driverId,
        // Confirmação explícita do utilizador: força a atribuição apesar do conflito.
        override,
        expectedUpdatedAt: activity.updated_at,
      });
      toast.success("Motorista atribuído.");
      onOpenChange(false);
    } catch (e) {
      const msg = errorMessagePt(e, "Não foi possível atribuir o motorista");
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <Dialog modal={false} open={open} onOpenChange={(v) => !assign.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{activity?.driver_id ? "Reatribuir motorista" : "Atribuir motorista"}</DialogTitle>
          <DialogDescription>
            A atribuição manual fica registada e substitui a atribuição automática.
          </DialogDescription>
        </DialogHeader>

        {activity && (
          <div className="space-y-3 text-sm">
            <div className="space-y-1 rounded-md border bg-surface-2 p-3">
              <p className="font-medium">{activity.title}</p>
              <p className="text-muted-foreground">
                Serviço: {fmtDateTime(activity.start_datetime)} – {fmtDateTime(activity.end_datetime)}
              </p>
              <p className="text-muted-foreground">
                Ocupação (com deslocação): {occStart && fmtDateTime(occStart)} – {occEnd && fmtDateTime(occEnd)}
              </p>
              <p className="text-xs text-muted-foreground">
                Atribuição atual: {ASSIGNMENT_LABEL[activity.assignment_status]}
                {activity.driver_id
                  ? ` · ${drivers.find((d) => d.id === activity.driver_id)?.name ?? "-"}`
                  : " · sem motorista"}
              </p>
              {attempts.length > 0 && (
                <div className="pt-1">
                  <p className="text-xs font-medium whitespace-pre-line">{"\n\n"}Motoristas tentados pela lista de prioridade:</p>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {attempts.map((t) => (
                      <li key={t.driver_id}>
                        {t.priority}. {t.name}: {t.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <Label>Motorista</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger aria-label="Motorista">
                  <SelectValue placeholder="Selecionar motorista" />
                </SelectTrigger>
                <SelectContent>
                  {orderedDrivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      <span className="flex w-full items-center justify-between gap-3">
                        <span>{d.name}</span>
                        {badges.get(d.id) && <DriverStatusBadge badge={badges.get(d.id)!} />}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {availability && (
              <AvailabilityWarning
                result={availability}
                driverName={drivers.find((d) => d.id === driverId)?.name ?? null}
              >
                {blocked &&
                  (canOverride ? (
                    <label className="mt-3 flex items-start gap-2 text-xs font-medium">
                      <Checkbox className="mt-0.5" checked={override} onCheckedChange={(v) => setOverride(Boolean(v))} />
                      Confirmo que quero atribuir apesar do conflito
                    </label>
                  ) : (
                    <p className="mt-2 text-xs">Apenas um gestor pode forçar a atribuição com conflito.</p>
                  ))}
              </AvailabilityWarning>
            )}

            {error && (
              <p className="rounded-md border border-conflict/40 bg-conflict-soft p-3 text-sm text-conflict">{error}</p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" disabled={assign.isPending} onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            // Com conflito, só a confirmação explícita desbloqueia a atribuição.
            disabled={assign.isPending || !activity || !driverId || (blocked && !override)}
            onClick={() => void confirm()}
          >
            {assign.isPending ? "A atribuir…" : "Atribuir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
