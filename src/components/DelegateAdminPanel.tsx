import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/DateInput";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import {
  isLinkActiveNow,
  useAdministrators,
  useAssistantAdministrators,
  useAssistants,
  useDelegateAdministrator,
  useEndAdministratorDelegation,
  type Administrator,
} from "@/lib/data";
import { errorMessagePt } from "@/lib/errors";
import { fmtDate } from "@/lib/scheduling";

/**
 * Assistente: delega um Administrador que serve a outro assistente durante um
 * período (férias, ausências). A hierarquia de motoristas do Administrador
 * acompanha automaticamente a delegação, sem duplicar relações.
 * O formulário abre num diálogo a partir do botão "Delegar administrador".
 */
export function DelegateAdminPanel({ adminOptions }: { adminOptions: Administrator[] }) {
  const { user } = useAuth();
  const { data: assistants = [] } = useAssistants();
  const { data: administrators = [] } = useAdministrators();
  const { data: links = [] } = useAssistantAdministrators();
  const delegate = useDelegateAdministrator();
  const endDelegation = useEndAdministratorDelegation();
  const [open, setOpen] = useState(false);

  const [administratorId, setAdministratorId] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sharePast, setSharePast] = useState(false);
  const [shareFuture, setShareFuture] = useState(true);

  // Um único Administrador: fica pré-selecionado.
  useEffect(() => {
    if (adminOptions.length === 1 && !administratorId) setAdministratorId(adminOptions[0]!.id);
  }, [adminOptions, administratorId]);

  const others = useMemo(
    () => assistants.filter((a) => a.active && a.id !== user?.assistantId),
    [assistants, user?.assistantId],
  );

  /** Delegações criadas por mim que ainda estão ativas. */
  const mine = useMemo(
    () =>
      links.filter(
        (l) => l.relationship_type === "delegated" && l.active && l.created_by === user?.userId,
      ),
    [links, user?.userId],
  );

  const adminName = (id: string) => administrators.find((a) => a.id === id)?.name ?? "-";
  const assistantName = (id: string) => assistants.find((a) => a.id === id)?.name ?? "-";

  const submit = async () => {
    if (!administratorId || !assistantId || !startDate || !endDate) {
      toast.error("Preencha o Administrador, o assistente e as datas.");
      return;
    }
    try {
      await delegate.mutateAsync({
        administratorId,
        delegateAssistantId: assistantId,
        startDate,
        endDate,
        sharePast,
        shareFuture,
      });
      toast.success("Delegação criada.");
      setAssistantId("");
      setStartDate("");
      setEndDate("");
      setSharePast(false);
      setShareFuture(true);
      setOpen(false);
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível criar a delegação"));
    }
  };

  const finish = async (id: string) => {
    try {
      await endDelegation.mutateAsync(id);
      toast.success("Delegação terminada.");
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível terminar a delegação"));
    }
  };

  if (user?.role !== "assistant" || !user?.assistantId) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Delegar administrador</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delegar administrador</DialogTitle>
          <DialogDescription>
            Permite que outro assistente peça serviços para o Administrador durante o período
            indicado. A hierarquia de motoristas do Administrador acompanha a delegação e a ordem de
            prioridade mantém-se. Termina automaticamente na data de fim.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Administrador</Label>
              <Select value={administratorId} onValueChange={setAdministratorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {adminOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assistente que recebe</Label>
              <Select value={assistantId} onValueChange={setAssistantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {others.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="deleg-start">Início</Label>
              {/* Campo PT-PT (DD/MM/AAAA) usado em toda a aplicação. */}
              <DateInput id="deleg-start" value={startDate} onChange={setStartDate} />
            </div>
            <div>
              <Label htmlFor="deleg-end">Fim</Label>
              <DateInput id="deleg-end" value={endDate} onChange={setEndDate} />
            </div>

          </div>

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Acesso à informação
            </p>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={sharePast}
                onCheckedChange={(v) => setSharePast(v === true)}
                aria-label="Partilhar histórico passado"
              />
              <span>
                Partilhar histórico passado
                <span className="block text-xs text-muted-foreground">
                  Serviços anteriores ao início da delegação.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={shareFuture}
                onCheckedChange={(v) => setShareFuture(v === true)}
                aria-label="Partilhar serviços futuros"
              />
              <span>
                Partilhar serviços futuros
                <span className="block text-xs text-muted-foreground">
                  Serviços agendados para depois do fim da delegação.
                </span>
              </span>
            </label>
          </div>

          <Button size="sm" onClick={submit} disabled={delegate.isPending || adminOptions.length === 0}>
            {delegate.isPending ? "A guardar…" : "Delegar"}
          </Button>

          {mine.length > 0 && (
            <div className="space-y-1 border-t pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Delegações que criei
              </h3>
              <ul className="divide-y text-sm">
                {mine.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="flex-1">
                      {adminName(l.administrator_id)} → {assistantName(l.assistant_id)}
                      <span className="block text-xs text-muted-foreground">
                        {l.start_date ? fmtDate(l.start_date) : "-"} a{" "}
                        {l.end_date ? fmtDate(l.end_date) : "-"}
                        {" · "}
                        {l.share_past ? "Histórico passado partilhado" : "Sem histórico passado"}
                        {" · "}
                        {l.share_future ? "Serviços futuros partilhados" : "Sem serviços futuros"}
                      </span>
                    </span>
                    {(() => {
                      const today = new Date().toISOString().slice(0, 10);
                      const ended = !!l.end_date && l.end_date < today;
                      const pending = l.delegation_state === "pending";
                      const running = isLinkActiveNow(l);
                      return (
                        <>
                          <Badge variant={running ? "secondary" : "outline"}>
                            {ended
                              ? "Terminada"
                              : pending
                                ? "Pendente de aceitação"
                                : running
                                  ? "A decorrer"
                                  : "Agendada"}
                          </Badge>
                          {!ended && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={endDelegation.isPending}
                              onClick={() => finish(l.id)}
                            >
                              Terminar
                            </Button>
                          )}
                        </>
                      );
                    })()}


                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
