import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/DateInput";
import { TimeInput } from "@/components/TimeInput";
import {
  CONFLICT_MESSAGE,
  conflictFor,
  permanentOverlapFor,
  PERMANENT_OVERLAP_WARNING,
  LOAN_STATUS_LABEL,
  loanStatus,
  ptDateTime,
  useCancelLoanEvent,
  useEndPermanentAllocation,
  useSaveLoanEvent,
  type LoanEvent,
  type LoanEventKind,
  type LoanEventType,
  type LoanVehicle,
} from "@/lib/loan-vehicles";

export type LoanEventDraft = {
  kind: LoanEventKind;
  vehicleId?: string;
  date?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
};

const toIso = (date: string, time: string) => new Date(`${date}T${time}:00`);

/** Formulário único para alocações e inspeções de viaturas de empréstimo. */
export function LoanEventDialog({
  open,
  onOpenChange,
  vehicles,
  events,
  draft,
  editing,
  eventTypes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicles: LoanVehicle[];
  events: LoanEvent[];
  draft: LoanEventDraft | null;
  editing: LoanEvent | null;
  eventTypes: LoanEventType[];
}) {
  const save = useSaveLoanEvent();
  const cancelEvent = useCancelLoanEvent();
  const endPermanent = useEndPermanentAllocation();
  const [kind, setKind] = useState<LoanEventKind>("allocation");
  const selectedType = eventTypes.find((type) => type.key === kind) ?? null;
  const requiresPerson = selectedType?.requires_person ?? Boolean(editing?.person_name);
  const allowsPermanent = selectedType?.allows_permanent ?? Boolean(editing?.permanent);

  const [vehicleId, setVehicleId] = useState("");
  const [person, setPerson] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("18:00");
  const [notes, setNotes] = useState("");
  const [permanent, setPermanent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [askCancel, setAskCancel] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setWarning(null);
    setKind(editing ? editing.kind : (draft?.kind ?? eventTypes.find((type) => type.active)?.key ?? "allocation"));
    if (editing) {
      const s = new Date(editing.start_datetime);
      const e = new Date(editing.end_datetime);
      const d = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
      const t = (x: Date) => `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
      setVehicleId(editing.vehicle_id);
      setPerson(editing.person_name ?? "");
      setStartDate(d(s));
      setStartTime(t(s));
      setEndDate(d(e));
      setEndTime(t(e));
      setNotes(editing.notes ?? "");
      setPermanent(editing.permanent);
      return;
    }
    const today = new Date();
    const iso = draft?.date ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setVehicleId(draft?.vehicleId ?? "");
    setPerson("");
    setStartDate(iso);
    setEndDate(draft?.endDate ?? iso);
    const draftType = eventTypes.find((type) => type.key === (draft?.kind ?? "allocation"));
    setStartTime(draft?.startTime ?? draftType?.default_start_time.slice(0, 5) ?? "09:00");
    setEndTime(draft?.endTime ?? draftType?.default_end_time.slice(0, 5) ?? "18:00");
    setNotes("");
    setPermanent(false);
  }, [open, editing, draft, eventTypes]);

  /** Ao trocar de tipo numa criação, repõe horas típicas e limpa campos específicos. */
  const changeKind = (next: LoanEventKind) => {
    setKind(next);
    if (editing) return;
    const nextType = eventTypes.find((type) => type.key === next);
    if (!nextType?.allows_permanent) {
      setPermanent(false);
    }
    if (!nextType?.requires_person) {
      setPerson("");
    }
    setStartTime(draft?.startTime ?? nextType?.default_start_time.slice(0, 5) ?? "09:00");
    setEndTime(draft?.endTime ?? nextType?.default_end_time.slice(0, 5) ?? "18:00");
  };

  const activeVehicles = vehicles.filter((v) => v.active || v.id === vehicleId);

  /** Devolve erro bloqueante e, em separado, um aviso não bloqueante. */
  const validate = (): { error: string | null; warning: string | null } => {
    if (!vehicleId) return { error: "Selecione a viatura.", warning: null };
    if (requiresPerson && !person.trim())
      return { error: "Indique a pessoa que recebe a viatura.", warning: null };
    if (!startDate || (!permanent && !endDate))
      return { error: "Indique as datas de início e de fim.", warning: null };
    const start = toIso(startDate, startTime);
    const end = permanent ? new Date("9999-12-31T23:59:59.999Z") : toIso(endDate, endTime);
    if (!(end > start)) return { error: "O fim tem de ser posterior ao início.", warning: null };
    const clash = conflictFor(events, vehicleId, start, end, editing?.id, kind, permanent, editing?.permanent, eventTypes);
    if (clash)
      return {
        error: `${CONFLICT_MESSAGE}\nConflito: ${clash.kind_label_snapshot ?? eventTypes.find((type) => type.key === clash.kind)?.label ?? clash.kind} ${ptDateTime(clash.start_datetime)} – ${ptDateTime(clash.end_datetime)}`,
        warning: null,
      };
    const permanentClash = (selectedType?.allows_overlap_with_permanent ?? true)
      ? permanentOverlapFor(events, vehicleId, start, end, editing?.id, permanent)
      : null;
    return { error: null, warning: permanentClash ? PERMANENT_OVERLAP_WARNING : null };
  };

  // Revalida sempre que muda viatura, tipo ou datas.
  useEffect(() => {
    if (!open) return;
    const result = validate();
    setError(result.error);
    setWarning(result.warning);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, vehicleId, startDate, startTime, endDate, endTime, person, permanent, open]);

  const submit = async () => {
    const result = validate();
    setWarning(result.warning);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    try {
      await save.mutateAsync({
        id: editing?.id,
        vehicle_id: vehicleId,
        kind,
        person_name: requiresPerson ? person.trim() : null,
        start_datetime: toIso(startDate, startTime).toISOString(),
        end_datetime: permanent
          ? new Date("9999-12-31T23:59:59.999Z").toISOString()
          : toIso(endDate, endTime).toISOString(),
        permanent,
        notes: notes.trim() || null,
      });
      toast.success(`${selectedType?.label ?? "Evento"} guardado.`);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível guardar.");
    }
  };

  const title = editing ? (editing.kind_label_snapshot ?? selectedType?.label ?? "Evento") : "Novo evento";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Estado: ${LOAN_STATUS_LABEL[loanStatus(editing)]}`
                : "Configure o período e os dados pedidos para este tipo de evento."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="loan-kind">Tipo de evento</Label>
              <Select
                value={kind}
                onValueChange={(v) => changeKind(v as LoanEventKind)}
                disabled={!!editing}
              >
                <SelectTrigger id="loan-kind">
                  <SelectValue placeholder="Selecione o tipo de evento" />
                </SelectTrigger>
                <SelectContent>
                  {eventTypes.filter((type) => type.active || type.key === kind).map((type) => <SelectItem key={type.key} value={type.key}>{type.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {requiresPerson && (
              <div className="sm:col-span-2">
                <Label htmlFor="loan-person">Pessoa</Label>
                <Input
                  id="loan-person"
                  value={person}
                  onChange={(e) => setPerson(e.target.value)}
                  placeholder="Nome da pessoa"
                  autoComplete="off"
                />
              </div>
            )}
            {allowsPermanent && (
              <div className="sm:col-span-2 flex items-start gap-3 rounded-md border border-border bg-surface-2 p-3">
                <Checkbox
                  id="loan-permanent"
                  checked={permanent}
                  onCheckedChange={(checked) => setPermanent(checked === true)}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="loan-permanent">Alocação permanente</Label>
                  <p className="text-xs text-muted-foreground">Sem data de fim, até ser terminada ou alterada.</p>
                </div>
              </div>
            )}
            <div className="sm:col-span-2">
              <Label htmlFor="loan-vehicle">Viatura</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger id="loan-vehicle">
                  <SelectValue placeholder="Selecione a viatura" />
                </SelectTrigger>
                <SelectContent>
                  {activeVehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plate}
                      {v.brand || v.model ? ` — ${[v.brand, v.model].filter(Boolean).join(" ")}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data de início</Label>
              <DateInput value={startDate} onChange={setStartDate} aria-label="Data de início" />
            </div>
            <div>
              <Label>Hora de início</Label>
              <TimeInput value={startTime} onChange={setStartTime} aria-label="Hora de início" />
            </div>
            {!permanent && (
              <>
                <div>
                  <Label>Data de fim</Label>
                  <DateInput value={endDate} onChange={setEndDate} aria-label="Data de fim" />
                </div>
                <div>
                  <Label>Hora de fim</Label>
                  <TimeInput value={endTime} onChange={setEndTime} aria-label="Hora de fim" />
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <Label htmlFor="loan-notes">Notas</Label>
              <Textarea id="loan-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </div>

          {error && (
            <p className="whitespace-pre-line rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {!error && warning && (
            <p className="whitespace-pre-line rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
              {warning}
            </p>
          )}


          <DialogFooter className="gap-2 sm:justify-between">
            {editing && !editing.cancelled ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setAskCancel(true)}>
                  Cancelar evento
                </Button>
                {editing.permanent && (
                  <Button
                    variant="outline"
                    disabled={endPermanent.isPending}
                    onClick={async () => {
                      const endedAt = new Date();
                      if (endedAt <= new Date(editing.start_datetime)) {
                        setError("A alocação ainda não começou. Altere-a para uma alocação temporária ou cancele-a.");
                        return;
                      }
                      try {
                        await endPermanent.mutateAsync({ id: editing.id, endedAt: endedAt.toISOString() });
                        toast.success("Alocação permanente terminada.");
                        onOpenChange(false);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Não foi possível terminar a alocação.");
                      }
                    }}
                  >
                    Terminar alocação
                  </Button>
                )}
              </div>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <Button onClick={submit} disabled={!!error || save.isPending}>
                Guardar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={askCancel} onOpenChange={setAskCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar o evento?</AlertDialogTitle>
            <AlertDialogDescription>
              A viatura volta a ficar disponível neste período. O registo é mantido no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!editing) return;
                try {
                  await cancelEvent.mutateAsync(editing.id);
                  toast.success("Registo cancelado.");
                  setAskCancel(false);
                  onOpenChange(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Não foi possível cancelar.");
                }
              }}
            >
              Cancelar registo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
