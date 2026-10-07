import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/DateInput";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TimeInput } from "@/components/TimeInput";
import { useAuth } from "@/lib/auth";
import { isLinkActiveNow, useAdministrators, useAssistantAdministrators, useDrivers } from "@/lib/data";
import { useDeleteMyRelease, useSaveMyRelease, useScheduleReleases } from "@/lib/schedule-releases";
import { fmtDateTime, toDateInput } from "@/lib/scheduling";

/**
 * «Libertar horário», três fluxos distintos (a base de dados impõe as mesmas regras):
 * - Administrador: liberta o próprio horário (sem seletor).
 * - Motorista: liberta o próprio horário (sem seletor).
 * - Assistente: escolhe um dos Administradores que assiste neste momento.
 */
type Mode = "administrator" | "driver" | "assistant";

function useReleaseMode(): Mode | null {
  const { user } = useAuth();
  if (user?.administratorId) return "administrator";
  if (user?.role === "driver" && user.driverId) return "driver";
  if (user?.role === "assistant" && user.assistantId) return "assistant";
  return null;
}

export function ScheduleReleaseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const mode = useReleaseMode();
  const { data: administrators = [] } = useAdministrators();
  const { data: links = [] } = useAssistantAdministrators();
  const { data: drivers = [] } = useDrivers();
  const { data: releases = [] } = useScheduleReleases();
  const save = useSaveMyRelease();
  const remove = useDeleteMyRelease();

  /** Assistente: apenas Administradores que assiste neste momento, sem duplicados. */
  const adminOptions = useMemo(() => {
    if (mode !== "assistant") return [];
    const ids = new Set(
      links.filter((l) => l.assistant_id === user?.assistantId && isLinkActiveNow(l)).map((l) => l.administrator_id),
    );
    return administrators.filter((a) => ids.has(a.id) && a.active);
  }, [mode, links, administrators, user?.assistantId]);

  const [adminId, setAdminId] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("15:00");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDate(toDateInput(new Date()));
    setStart("12:00");
    setEnd("15:00");
    setNotes("");
    setAdminId(adminOptions.length === 1 ? adminOptions[0]!.id : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ownerName =
    mode === "administrator"
      ? (administrators.find((a) => a.id === user?.administratorId)?.name ?? user?.name)
      : mode === "driver"
        ? (drivers.find((d) => d.id === user?.driverId)?.name ?? user?.name)
        : null;

  const now = new Date();
  const active = releases.filter((r) => {
    if (r.activity_id || new Date(r.end_datetime) <= now) return false;
    if (mode === "administrator") return r.administrator_id === user?.administratorId;
    if (mode === "driver") return !r.administrator_id && r.driver_id === user?.driverId;
    if (mode === "assistant") return !!r.administrator_id && adminOptions.some((a) => a.id === r.administrator_id);
    return false;
  });
  const adminName = (id: string | null) => administrators.find((a) => a.id === id)?.name ?? "";

  const submit = async () => {
    setError(null);
    if (mode === "assistant" && !adminId) return setError("Escolha o Administrador.");
    if (!date || !start || !end) return setError("Indique a data, o início e o fim.");
    const s = new Date(`${date}T${start}:00`);
    const e = new Date(`${date}T${end}:00`);
    if (e <= s) return setError("O fim tem de ser posterior ao início.");
    try {
      await save.mutateAsync({
        start_datetime: s.toISOString(),
        end_datetime: e.toISOString(),
        notes: notes.trim() || null,
        administrator_id: mode === "assistant" ? adminId : null,
      });
      toast.success("Horário libertado.");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "assistant" ? "Libertar horário de um Administrador" : "Libertar o meu horário"}</DialogTitle>
          <DialogDescription>
            {mode === "administrator" && <>Administrador: <strong>{ownerName}</strong>. Os seus serviços ficam livres neste intervalo e os motoristas atribuídos ficam disponíveis.</>}
            {mode === "driver" && <>Motorista: <strong>{ownerName}</strong>. Os seus serviços ficam livres neste intervalo.</>}
            {mode === "assistant" && <>Os serviços do Administrador escolhido ficam livres neste intervalo e os motoristas atribuídos ficam disponíveis.</>}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {mode === "assistant" && (
            <div>
              <Label htmlFor="rel-admin">Administrador</Label>
              <Select value={adminId} onValueChange={setAdminId}>
                <SelectTrigger id="rel-admin"><SelectValue placeholder="Escolher Administrador" /></SelectTrigger>
                <SelectContent>
                  {adminOptions.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {adminOptions.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Não assiste nenhum Administrador neste momento.</p>}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label htmlFor="rel-date">Data</Label><DateInput id="rel-date" value={date} onChange={setDate} /></div>
            <div><Label htmlFor="rel-start">Início</Label><TimeInput id="rel-start" value={start} onChange={setStart} /></div>
            <div><Label htmlFor="rel-end">Fim</Label><TimeInput id="rel-end" value={end} onChange={setEnd} /></div>
          </div>
          <div><Label htmlFor="rel-notes">Notas (opcional)</Label><Textarea id="rel-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {error && <p className="text-sm text-conflict">{error}</p>}
          {active.length > 0 && (
            <div className="space-y-1 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">Libertações ativas (remover repõe o horário original)</p>
              {active.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {fmtDateTime(r.start_datetime)} – {fmtDateTime(r.end_datetime).slice(-5)}
                    {mode === "assistant" && <span className="text-muted-foreground"> · {adminName(r.administrator_id)}</span>}
                  </span>
                  <Button size="sm" variant="ghost" disabled={remove.isPending} aria-label="Repor horário original"
                    onClick={() => remove.mutate(r.id, { onSuccess: () => toast.success("Horário original reposto."), onError: (e) => toast.error(e.message) })}>
                    <Trash2 className="size-4" /> Repor
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={() => void submit()} disabled={save.isPending || (mode === "assistant" && adminOptions.length === 0)}>Libertar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Botão do cabeçalho do calendário, ao lado de «Novo serviço»: Administrador, Motorista e Assistente. */
export function ReleaseScheduleButton() {
  const mode = useReleaseMode();
  const [open, setOpen] = useState(false);
  if (!mode) return null;
  return (
    <>
      <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <CalendarCheck2 className="size-4" /> Libertar horário
      </Button>
      <ScheduleReleaseDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
