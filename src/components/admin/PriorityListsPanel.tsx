import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/DateInput";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAdminPriorities,
  useAdministrators,
  useAssistantAdministrators,
  useAssistants,
  useDeleteAssistantAdminLink,
  useSaveAdministrator,
  useSaveAssistantAdminLink,
  isLinkActiveNow,
  isLinkVisibleInConfig,
  isDelegationPending,
  type Administrator,
} from "@/lib/data";
import { errorMessagePt } from "@/lib/errors";
import { fmtDate } from "@/lib/scheduling";
import { PriorityListEditor } from "./PriorityListEditor";

/**
 * Administração → Administradores: fichas, hierarquia de motoristas e assistentes
 * ligados a cada Administrador (principal e delegações temporárias).
 */
export function PriorityListsPanel() {
  const { data: administrators = [] } = useAdministrators();
  const { data: rows = [] } = useAdminPriorities();
  const save = useSaveAdministrator();
  const [newName, setNewName] = useState("");

  const create = async () => {
    if (!newName.trim()) return;
    try {
      await save.mutateAsync({ values: { name: newName.trim() } });
      toast.success("Administrador criado.");
      setNewName("");
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível criar o Administrador"));
    }
  };

  return (
    <section className="space-y-4">
      <div className="panel space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold">Administradores e hierarquias de motoristas</h2>
          <p className="text-xs text-muted-foreground">
            Cada Administrador tem a sua ordem de motoristas. Quando um serviço é criado, o sistema
            atribui o primeiro motorista dessa ordem que esteja livre para toda a ocupação. Sem
            ninguém livre, o serviço fica por atribuir e o Proprietário e o Gestor são avisados.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label>Novo Administrador</Label>
            <Input
              className="w-56"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Administração A"
            />
          </div>
          <Button disabled={!newName.trim() || save.isPending} onClick={() => void create()}>
            Adicionar
          </Button>
        </div>
      </div>

      {administrators.length === 0 && (
        <p className="panel p-4 text-sm text-muted-foreground">Ainda não existem Administradores.</p>
      )}

      {administrators.map((a) => (
        <AdministratorCard
          key={a.id}
          administrator={a}
          count={rows.filter((r) => r.administrator_id === a.id).length}
        />
      ))}
    </section>
  );
}

function AdministratorCard({
  administrator,
  count,
}: {
  administrator: Administrator;
  count: number;
}) {
  const save = useSaveAdministrator();
  const [name, setName] = useState(administrator.name);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const lastRequested = useRef(administrator.name);
  const previousSavedName = useRef(administrator.name);

  useEffect(() => {
    if (
      administrator.name === lastRequested.current ||
      lastRequested.current === previousSavedName.current
    ) {
      setName(administrator.name);
      lastRequested.current = administrator.name;
    }
    previousSavedName.current = administrator.name;
  }, [administrator.id, administrator.name]);

  const rename = async (nextName = name) => {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === administrator.name || trimmed === lastRequested.current) return;
    lastRequested.current = trimmed;
    setSaveState("saving");
    try {
      await save.mutateAsync({ id: administrator.id, values: { name: trimmed } });
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch (e) {
      lastRequested.current = administrator.name;
      setSaveState("idle");
      toast.error(errorMessagePt(e, "Não foi possível guardar"));
    }
  };

  useEffect(() => {
    if (!name.trim() || name.trim() === administrator.name) return;
    const timer = window.setTimeout(() => void rename(name), 650);
    return () => window.clearTimeout(timer);
  }, [name, administrator.name]);

  const toggle = async () => {
    try {
      await save.mutateAsync({
        id: administrator.id,
        values: { name: administrator.name, active: !administrator.active },
      });
      toast.success(administrator.active ? "Administrador desativado." : "Administrador reativado.");
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível alterar o estado"));
    }
  };

  return (
    <article className={`panel space-y-4 p-4 ${administrator.active ? "" : "opacity-70"}`}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <div className="min-w-52 max-w-sm flex-1">
              <Label className="text-xs text-muted-foreground">Administrador</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => void rename()}
              />
            </div>
            <span className="pb-2 text-xs text-muted-foreground" aria-live="polite">
              {saveState === "saving" ? "A guardar…" : saveState === "saved" ? "Alterações guardadas" : ""}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {count === 1 ? "1 motorista" : `${count} motoristas`} na hierarquia
            </span>
            {!administrator.active && <Badge variant="outline">inativo</Badge>}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Ações do Administrador">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className={administrator.active ? "text-destructive focus:text-destructive" : ""}
              disabled={save.isPending}
              onSelect={() => void toggle()}
            >
              {administrator.active ? "Desativar" : "Reativar"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Hierarquia de motoristas
        </h4>
        <PriorityListEditor administratorId={administrator.id} />
      </div>

      <div className="border-t pt-4">
        <AssistantLinks administratorId={administrator.id} />
      </div>
    </article>
  );
}

function AssistantLinks({ administratorId }: { administratorId: string }) {
  const { data: assistants = [] } = useAssistants();
  const { data: links = [] } = useAssistantAdministrators();
  const saveLink = useSaveAssistantAdminLink();
  const removeLink = useDeleteAssistantAdminLink();

  // Só a configuração em vigor: delegações expiradas, recusadas ou terminadas
  // desaparecem daqui automaticamente (o registo mantém-se para histórico).
  const mine = links.filter(
    (l) => l.administrator_id === administratorId && isLinkVisibleInConfig(l),
  );
  // Um Administrador pode ter até dois assistentes principais.
  const primaryCount = mine.filter((l) => l.relationship_type === "primary" && l.active).length;
  const [open, setOpen] = useState(false);
  const [assistantId, setAssistantId] = useState("");
  const [kind, setKind] = useState<"primary" | "delegated">("delegated");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [sharePast, setSharePast] = useState(false);
  const [shareFuture, setShareFuture] = useState(true);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const add = async () => {
    if (!assistantId) return;
    try {
      await saveLink.mutateAsync({
        assistant_id: assistantId,
        administrator_id: administratorId,
        relationship_type: kind,
        start_date: kind === "delegated" ? (start ? start.slice(0, 10) : null) : null,
        end_date: kind === "delegated" ? (end ? end.slice(0, 10) : null) : null,
        share_past: kind === "delegated" ? sharePast : true,
        share_future: kind === "delegated" ? shareFuture : true,
        active: true,
      });
      toast.success("Assistente ligado a este Administrador.");
      setAssistantId("");
      setStart("");
      setEnd("");
      setSharePast(false);
      setShareFuture(true);
      setOpen(false);
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível ligar o assistente"));
    }
  };

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Assistentes que servem este Administrador
      </h4>
      {mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum assistente ligado.</p>
      ) : (
        <ul className="divide-y text-sm">
          {mine.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
              <span className="font-medium">
                {assistants.find((s) => s.id === l.assistant_id)?.name ?? "Assistente"}
              </span>
              <Badge variant={l.relationship_type === "primary" ? "secondary" : "outline"}>
                {l.relationship_type === "primary" ? "Principal" : "Delegação temporária"}
              </Badge>
              {(l.start_date || l.end_date) && (
                <span className="text-xs text-muted-foreground">
                  {l.start_date ? fmtDate(`${l.start_date}T00:00:00`) : "-"} a{" "}
                  {l.end_date ? fmtDate(`${l.end_date}T00:00:00`) : "sem fim"}
                </span>
              )}
              {isDelegationPending(l) && <Badge variant="outline">pendente</Badge>}
              {!isDelegationPending(l) && !isLinkActiveNow(l) && (
                <Badge variant="outline">agendada</Badge>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="ml-auto size-7 text-muted-foreground hover:text-destructive"
                disabled={removeLink.isPending}
                aria-label="Remover ligação"
                onClick={() => setRemoveId(l.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="mt-1">
            Adicionar assistente
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar assistente</DialogTitle>
            <DialogDescription>
              Ligue um assistente a este Administrador. Numa delegação temporária, a hierarquia de
              motoristas acompanha a ligação e termina automaticamente na data de fim.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Assistente</Label>
                <Select value={assistantId} onValueChange={setAssistantId}>
                  <SelectTrigger aria-label="Assistente">
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {assistants
                      .filter((s) => s.active && !mine.some((l) => l.assistant_id === s.id))
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de ligação</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as "primary" | "delegated")}>
                  <SelectTrigger aria-label="Tipo de ligação">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Cada Administrador pode ter até dois assistentes principais. */}
                    <SelectItem value="primary" disabled={primaryCount >= 2}>
                      Principal
                    </SelectItem>
                    <SelectItem value="delegated">Delegação temporária</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {primaryCount >= 2
                    ? "Este Administrador já tem dois assistentes principais."
                    : `Até dois assistentes principais (${primaryCount} de 2).`}
                </p>
              </div>
              {kind === "delegated" && (
                <>
                  <div>
                    <Label>Início</Label>
                    <DateInput value={start} onChange={setStart} />
                  </div>
                  <div>
                    <Label>Fim</Label>
                    <DateInput value={end} onChange={setEnd} />
                  </div>
                </>
              )}
            </div>

            {kind === "delegated" && (
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
            )}

            <Button
              size="sm"
              disabled={!assistantId || saveLink.isPending}
              onClick={() => void add()}
            >
              {saveLink.isPending ? "A guardar…" : "Ligar assistente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={removeId !== null} onOpenChange={(open) => !open && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover ligação ao assistente?</AlertDialogTitle>
            <AlertDialogDescription>
              O assistente deixa de servir este Administrador. Os serviços já criados mantêm-se.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeLink.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeLink.isPending}
              onClick={async () => {
                if (!removeId) return;
                try {
                  await removeLink.mutateAsync(removeId);
                  toast.success("Ligação removida. Os serviços já criados mantêm-se.");
                  setRemoveId(null);
                } catch (e) {
                  toast.error(errorMessagePt(e, "Não foi possível remover"));
                }
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
