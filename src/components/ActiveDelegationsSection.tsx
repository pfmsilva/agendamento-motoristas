import { useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/lib/auth";
import {
  isDelegationPending,
  isLinkActiveNow,
  useAdministrators,
  useAssistantAdministrators,
  useAssistants,
  useEndAdministratorDelegation,
  useRespondAdministratorDelegation,
} from "@/lib/data";
import { errorMessagePt } from "@/lib/errors";
import { fmtDate } from "@/lib/scheduling";

type Item = {
  id: string;
  label: string;
  detail: string;
  /** Recebida por mim (posso decidir/terminar) ou criada por mim. */
  received: boolean;
  pending: boolean;
};

/**
 * Assistente: secção «Delegações» na página «Os meus serviços». Mostra as
 * delegações pendentes de aceitação e as que estão a vigorar — recebidas por
 * mim ou criadas por mim — e desaparece por completo quando não há nenhuma.
 * Delegações recusadas ou terminadas nunca aparecem aqui.
 */
export function ActiveDelegationsSection() {
  const { user } = useAuth();
  const { data: links = [] } = useAssistantAdministrators();
  const { data: administrators = [] } = useAdministrators();
  const { data: assistants = [] } = useAssistants();
  const respond = useRespondAdministratorDelegation();
  const endDelegation = useEndAdministratorDelegation();
  const [confirmEnd, setConfirmEnd] = useState<Item | null>(null);

  const items = useMemo<Item[]>(() => {
    if (user?.role !== "assistant" || !user.assistantId) return [];
    const adminName = (id: string) => administrators.find((a) => a.id === id)?.name ?? "-";
    const assistantName = (id: string) => assistants.find((a) => a.id === id)?.name ?? "-";
    const delegatorName = (createdBy: string | null) =>
      createdBy ? (assistants.find((a) => a.user_id === createdBy)?.name ?? null) : null;

    const rows: Item[] = [];
    for (const l of links) {
      if (l.relationship_type !== "delegated") continue;
      const pending = isDelegationPending(l);
      if (!pending && !isLinkActiveNow(l)) continue;
      const received = l.assistant_id === user.assistantId;
      const createdByMe = l.created_by === user.userId;
      if (!received && !createdByMe) continue;

      const delegator = received ? delegatorName(l.created_by) : assistantName(user.assistantId);
      const label = `${delegator ?? "Outro assistente"} delegou ${adminName(l.administrator_id)}`;
      const period = l.end_date
        ? `${l.start_date ? fmtDate(l.start_date) : "-"} a ${fmtDate(l.end_date)}`
        : l.start_date
          ? `Desde ${fmtDate(l.start_date)}`
          : null;

      rows.push({
        id: l.id,
        label,
        detail: period ?? "",
        received,
        pending,
      });
    }
    // Pendentes primeiro: são as que exigem uma decisão.
    return rows.sort((a, b) => Number(b.pending) - Number(a.pending));
  }, [links, administrators, assistants, user?.role, user?.assistantId, user?.userId]);

  const decide = async (id: string, accept: boolean) => {
    try {
      await respond.mutateAsync({ id, accept });
      toast.success(accept ? "Delegação aceite." : "Delegação recusada.");
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível responder à delegação"));
    }
  };

  const finish = async (id: string) => {
    try {
      await endDelegation.mutateAsync(id);
      toast.success("Delegação terminada.");
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível terminar a delegação"));
    } finally {
      setConfirmEnd(null);
    }
  };

  if (user?.role !== "assistant" || items.length === 0) return null;

  return (
    <section className="rounded-md border bg-muted/30 px-4 py-3">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <ArrowRightLeft className="size-3.5" /> Delegações
      </h2>
      <ul className="mt-1.5 space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2">
            <span className="flex-1">
              {item.label}
              {item.detail && (
                <span className="block pl-4 text-xs text-muted-foreground">{item.detail}</span>
              )}
            </span>
            <Badge variant={item.pending ? "outline" : "secondary"}>
              {item.pending ? "Pendente de aceitação" : "Ativa"}
            </Badge>
            {item.received && item.pending && (
              <>
                <Button size="sm" disabled={respond.isPending} onClick={() => decide(item.id, true)}>
                  Aceitar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={respond.isPending}
                  onClick={() => decide(item.id, false)}
                >
                  Recusar
                </Button>
              </>
            )}
            {item.received && !item.pending && (
              <Button size="sm" variant="outline" onClick={() => setConfirmEnd(item)}>
                Terminar delegação
              </Button>
            )}
          </li>
        ))}
      </ul>

      <AlertDialog open={!!confirmEnd} onOpenChange={(o) => !o && setConfirmEnd(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminar delegação?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmEnd?.label} deixa de estar ao seu cuidado de imediato e o assistente que
              criou a delegação é notificado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={endDelegation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmEnd) void finish(confirmEnd.id);
              }}
            >
              Terminar delegação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
