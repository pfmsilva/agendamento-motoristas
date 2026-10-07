import { missingFieldsMessage } from "@/lib/required-fields";
import { useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { DateInput } from "@/components/DateInput";
import {
  useAdminPriorities,
  useAdministrators,
  useAssistantAdministrators,
  useSaveAdministrator,
  useAssignUserProfile,
  useAssistants,
  useDeleteAssistantAdminLink,
  useDeleteUnlinkedRecord,
  useDeleteUserAccount,
  useDrivers,
  useSaveAssistant,
  useSaveAssistantAdminLink,
  useSaveDriver,
  useSaveProfileName,
  useSetDriverActive,
  useSetProfileActive,
  isLinkVisibleInConfig,
  type AppRoleValue,
} from "@/lib/data";
import {
  DRIVER_COLOR_COUNT,
  DRIVER_COLOR_HEX,
  driverColorIndex,
  fmtDate,
} from "@/lib/scheduling";
import { useAuth } from "@/lib/auth";
import { errorMessagePt } from "@/lib/errors";
import { ROLE_LABEL, type TeamPerson } from "./team";
import { PriorityListEditor } from "./PriorityListEditor";

const ROLES: AppRoleValue[] = ["owner", "manager", "administrator", "assistant", "driver"];
const KEEP = "__keep__";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  person: TeamPerson | null;
  isSelf: boolean;
  historyCount: number;
};

export function UserEditDialog({ open, onOpenChange, person, isSelf, historyCount }: Props) {
  const { data: drivers = [] } = useDrivers();
  const { data: assistants = [] } = useAssistants();
  const { data: priorities = [] } = useAdminPriorities();
  const { data: administrators = [] } = useAdministrators();
  const saveAdministrator = useSaveAdministrator();

  const assignProfile = useAssignUserProfile();
  const saveName = useSaveProfileName();
  const saveDriver = useSaveDriver();
  const saveAssistant = useSaveAssistant();
  const setProfileActive = useSetProfileActive();
  const setDriverActive = useSetDriverActive();
  const deleteUser = useDeleteUserAccount();
  const deleteRecord = useDeleteUnlinkedRecord();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [role, setRole] = useState<AppRoleValue | "">("");
  const [link, setLink] = useState<string>(KEEP);
  const [color, setColor] = useState(0);
  const [canCreateEvents, setCanCreateEvents] = useState(true);
  const { user: authUser } = useAuth();
  const isOwnerUser = authUser?.role === "owner";

  useEffect(() => {
    if (!open || !person) return;
    setName(person.name);
    setEmail(person.profile?.email ?? "");
    setRole(person.role ?? "");
    setLink(KEEP);
    setCanCreateEvents(person.driver?.can_create_events ?? true);
    setColor(person.driver ? driverColorIndex(person.driver.id, drivers) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, person?.key]);

  const usedColors = useMemo(
    () =>
      drivers
        .filter((d) => d.id !== person?.driver?.id)
        .map((d) => driverColorIndex(d.id, drivers)),
    [drivers, person?.driver?.id],
  );

  const driverAssignments = useMemo(
    () => (person?.driver ? priorities.filter((a) => a.driver_id === person.driver!.id) : []),
    [priorities, person?.driver?.id],
  );

  if (!person) return null;

  const busy =
    assignProfile.isPending ||
    saveName.isPending ||
    saveDriver.isPending ||
    saveAssistant.isPending ||
    setProfileActive.isPending ||
    setDriverActive.isPending;

  const hasAccount = !!person.profile;
  const roleChanged = hasAccount && role !== "" && role !== (person.role ?? "");
  const needsLink = role === "driver" || role === "assistant";
  const linkOptions = role === "driver" ? drivers : assistants;

  const submit = async () => {
    const trimmed = name.trim();
    const trimmedEmail = email.trim();
    const missing = missingFieldsMessage([
      { label: "nome", filled: Boolean(trimmed) },
      ...(hasAccount ? [{ label: "perfil", filled: Boolean(role) }] : []),
    ]);
    if (missing) {
      toast.error(missing);
      return;
    }
    // Contas com acesso têm sempre um email válido; nunca se grava vazio.
    if (hasAccount && !trimmedEmail) {
      toast.error("O email é obrigatório para utilizadores com conta.");
      return;
    }
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
      toast.error("Email inválido. Corrija o endereço antes de guardar.");
      return;
    }
    try {
      if (hasAccount) {
        const emailChanged = trimmedEmail !== (person.profile?.email ?? "");
        if (trimmed !== person.name || emailChanged) {
          await saveName.mutateAsync({
            id: person.profile!.id,
            name: trimmed,
            ...(emailChanged ? { email: trimmedEmail } : {}),
          });
        }
        const alreadyLinked =
          role === "driver" ? !!person.driver : role === "assistant" ? !!person.assistant : false;
        if (roleChanged || (needsLink && link !== KEEP)) {
          const chosen = link !== KEEP ? link : alreadyLinked ? undefined : "new";
          await assignProfile.mutateAsync({
            userId: person.profile!.id,
            role,
            ...(needsLink && chosen ? { link: chosen } : {}),
            personName: trimmed,
          });
        }
      }

      // Profile-specific record fields
      const driverId =
        link !== KEEP && role === "driver" && link !== "new" ? link : person.driver?.id;
      if (role === "driver" && driverId) {
        await saveDriver.mutateAsync({
          id: driverId,
          values: {
            name: trimmed,
            color_index: color,
            ...(isOwnerUser ? { can_create_events: canCreateEvents } : {}),
          },
        });
      }
      const assistantId =
        link !== KEEP && role === "assistant" && link !== "new" ? link : person.assistant?.id;
      if (role === "assistant" && assistantId) {
        await saveAssistant.mutateAsync({ id: assistantId, values: { name: trimmed } });
      }
      if (!hasAccount) {
        if (person.driver) {
          await saveDriver.mutateAsync({
            id: person.driver.id,
            values: {
              name: trimmed,
              color_index: color,
              ...(isOwnerUser ? { can_create_events: canCreateEvents } : {}),
            },
          });
        } else if (person.assistant) {
          await saveAssistant.mutateAsync({ id: person.assistant.id, values: { name: trimmed } });
        }
      }

      toast.success("Utilizador atualizado.");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível guardar"));
    }
  };

  const toggleActive = async () => {
    try {
      if (hasAccount) {
        await setProfileActive.mutateAsync({ id: person.profile!.id, active: !person.active });
      } else if (person.driver) {
        await setDriverActive.mutateAsync({ id: person.driver.id, active: !person.active });
      }
      toast.success(person.active ? "Conta desativada." : "Conta reativada.");
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível atualizar o estado"));
    }
  };

  const showDriverSection =
    (role === "driver" && (person.driver || link !== KEEP)) || (!hasAccount && !!person.driver);
  const showAssistantSection = role === "assistant" || (!hasAccount && !!person.assistant);

  const deleteBusy = deleteUser.isPending || deleteRecord.isPending;

  const confirmDeleteUser = async () => {
    try {
      if (person.profile) {
        await deleteUser.mutateAsync(person.profile.id);
      } else if (person.driver) {
        await deleteRecord.mutateAsync({ kind: "driver", id: person.driver.id });
      } else if (person.assistant) {
        await deleteRecord.mutateAsync({ kind: "assistant", id: person.assistant.id });
      } else {
        return;
      }
      toast.success("Utilizador eliminado.");
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível eliminar o utilizador"));
      setConfirmDelete(false);
    }
  };

  return (
    <>
    <Dialog
      open={open && !confirmDelete}
      onOpenChange={(v) => !v && !busy && !confirmDelete && onOpenChange(false)}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar utilizador</DialogTitle>
          <DialogDescription>
            Dados da pessoa e configuração específica do perfil atribuído. O histórico nunca é
            apagado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Dados do utilizador</h3>
            <div>
              <Label htmlFor="uname">Nome</Label>
              <Input id="uname" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="uemail">Email</Label>
              {hasAccount ? (
                <>
                  <Input
                    id="uemail"
                    type="email"
                    value={email}
                    required
                    placeholder="nome@exemplo.com"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Email obrigatório. Alterar aqui não muda o email de início de sessão nem a
                    ligação à ficha ou aos Administradores.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ficha sem conta: o email fica disponível quando a pessoa criar conta na aplicação.
                </p>
              )}
            </div>
            <div>
              <Label>Perfil</Label>
              {hasAccount ? (
                <Select
                  value={role}
                  onValueChange={(v) => {
                    setRole(v as AppRoleValue);
                    setLink(KEEP);
                  }}
                  disabled={isSelf}
                >
                  <SelectTrigger aria-label="Perfil">
                    <SelectValue placeholder="Escolher perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ficha sem conta ({person.driver ? "motorista" : "assistente"}). O perfil é
                  atribuído quando a pessoa criar conta na aplicação.
                </p>
              )}
              {isSelf && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Não pode alterar o seu próprio perfil.
                </p>
              )}
            </div>

            {hasAccount && needsLink && (
              <div>
                <Label>Ficha associada</Label>
                <Select value={link} onValueChange={setLink} disabled={isSelf}>
                  <SelectTrigger aria-label="Ficha associada">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={KEEP}>
                      {role === "driver" && person.driver
                        ? `Manter: ${person.driver.name}`
                        : role === "assistant" && person.assistant
                          ? `Manter: ${person.assistant.name}`
                          : "Criar ficha com este nome"}
                    </SelectItem>
                    <SelectItem value="new">Criar nova ficha com este nome</SelectItem>
                    {linkOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                        {o.active ? "" : " (inativo)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </section>

          {showDriverSection && (
            <section className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold">Configuração do motorista</h3>
              {isOwnerUser && (
                <div className="rounded-md border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="can-create-events" className="cursor-pointer">
                      Pode criar eventos
                    </Label>
                    <Switch
                      id="can-create-events"
                      checked={canCreateEvents}
                      onCheckedChange={setCanCreateEvents}
                      aria-label="Pode criar eventos"
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Desligado, o motorista continua a ver a sua agenda e os serviços atribuídos, mas
                    não cria serviços, eventos, férias nem indisponibilidades. Atribuições,
                    hierarquia, disponibilidade, histórico e cor mantêm-se. O motorista não é
                    notificado.
                  </p>
                </div>
              )}
              <div>
                <Label className="mb-1 block">Cor no calendário</Label>
                <div className="flex flex-wrap gap-2.5">
                  {Array.from({ length: DRIVER_COLOR_COUNT }, (_, i) => {
                    const taken = usedColors.includes(i);
                    const selected = color === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setColor(i)}
                        title={
                          taken ? `Cor ${i + 1} - já atribuída a outro motorista` : `Cor ${i + 1}`
                        }
                        aria-label={`Cor ${i + 1}`}
                        aria-pressed={selected}
                        className={`relative size-7 rounded-full border border-border/60 transition-transform hover:scale-110 ${
                          selected
                            ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                            : ""
                        }`}

                        style={{
                          backgroundColor: DRIVER_COLOR_HEX[i],
                          opacity: taken && !selected ? 0.45 : 1,
                        }}
                      >
                        {taken && !selected && (
                          <span className="absolute inset-0 grid place-items-center text-[10px] font-bold text-white">
                            ×
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {person.driver && (
                <div className="space-y-1">
                  <Label className="block">Hierarquias em que consta</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {driverAssignments.length === 0 && (
                      <span className="text-sm text-muted-foreground">
                        Não consta em nenhuma hierarquia. Edite-a na área de Administradores.
                      </span>
                    )}
                    {driverAssignments.map((a) => (
                      <Badge key={a.id} variant="secondary">
                        {administrators.find((o) => o.id === a.administrator_id)?.name ?? "-"} ·{" "}
                        {a.priority}.º
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {historyCount} serviço(s) no histórico mantêm-se associados a esta pessoa.
              </p>
            </section>
          )}

          {showAssistantSection && person.assistant && (
            <section className="space-y-2 border-t pt-4">
              <h3 className="text-sm font-semibold">Configuração do assistente</h3>
              <AssistantAdminsEditor assistantId={person.assistant.id} />
            </section>
          )}

          {role === "administrator" && hasAccount && (
            <section className="space-y-2 border-t pt-4">
              <h3 className="text-sm font-semibold">Configuração do Administrador</h3>
              {administrators.find((o) => o.user_id === person.profile!.id) ? (
                <>
                  <Label className="block">Hierarquia de motoristas</Label>
                  <PriorityListEditor
                    administratorId={administrators.find((o) => o.user_id === person.profile!.id)!.id}
                  />
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Esta conta ainda não tem ficha de Administrador.
                  </p>
                  <Button
                    size="sm"
                    disabled={saveAdministrator.isPending}
                    onClick={async () => {
                      try {
                        await saveAdministrator.mutateAsync({
                          values: { name: name.trim() || person.name, user_id: person.profile!.id },
                        });
                        toast.success("Ficha de Administrador criada.");
                      } catch (e) {
                        toast.error(errorMessagePt(e, "Não foi possível criar a ficha"));
                      }
                    }}
                  >
                    Criar ficha de Administrador
                  </Button>
                </div>
              )}
            </section>
          )}

          <section className="rounded-md border bg-surface-2 p-3 text-sm">
            <p className="font-medium">Estado</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {person.active
                ? "Ao desativar, a pessoa deixa de aceder à aplicação e de receber novos serviços. O histórico mantém-se."
                : "Inativo: sem acesso nem novos serviços; o histórico continua visível."}
            </p>
            <Button
              className="mt-2"
              size="sm"
              variant={person.active ? "outline" : "default"}
              disabled={busy || isSelf}
              onClick={() => void toggleActive()}
            >
              {person.active ? "Desativar" : "Reativar"}
            </Button>
          </section>

          {!isSelf && (
            <section className="border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Eliminar remove{" "}
                {hasAccount
                  ? "a conta de acesso e o perfil deste utilizador; o histórico de serviços mantém-se."
                  : "esta ficha definitivamente (apenas possível sem histórico)."}
              </p>
              <Button
                className="mt-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                size="sm"
                variant="outline"
                disabled={busy || deleteBusy}
                onClick={() => setConfirmDelete(true)}
              >
                Eliminar utilizador
              </Button>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? "A guardar…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog
      open={confirmDelete}
      onOpenChange={(v) => !v && !deleteBusy && setConfirmDelete(false)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar utilizador?</AlertDialogTitle>
          <AlertDialogDescription>
            Tem a certeza de que pretende eliminar este utilizador? Esta ação não pode ser
            revertida.
            <span className="mt-1 block font-medium text-foreground">
              {person.name || "-"}
              {person.email ? ` (${person.email})` : ""}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteBusy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteBusy}
            onClick={(e) => {
              e.preventDefault();
              void confirmDeleteUser();
            }}
          >
            {deleteBusy ? "A eliminar…" : "Eliminar utilizador"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

/**
 * Administradores que um assistente serve: ligações em vigor (principal,
 * delegações a decorrer, pendentes ou agendadas). Delegações expiradas,
 * recusadas ou terminadas não aparecem, mas o registo mantém-se em histórico.
 * Tudo é reversível: remover e voltar a ligar repõe a configuração anterior.
 */
function AssistantAdminsEditor({ assistantId }: { assistantId: string }) {
  const { data: administrators = [] } = useAdministrators();
  const { data: links = [] } = useAssistantAdministrators();
  const saveLink = useSaveAssistantAdminLink();
  const removeLink = useDeleteAssistantAdminLink();

  const [adminId, setAdminId] = useState("");
  const [kind, setKind] = useState<"primary" | "delegated">("primary");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const visible = links.filter((l) => isLinkVisibleInConfig(l));
  const mine = visible.filter((l) => l.assistant_id === assistantId);
  const available = administrators.filter(
    (a) => a.active && !mine.some((l) => l.administrator_id === a.id),
  );
  const primaryCountOf = (id: string) =>
    visible.filter((l) => l.administrator_id === id && l.relationship_type === "primary").length;
  const primaryFull = adminId ? primaryCountOf(adminId) >= 2 : false;

  const add = async () => {
    if (!adminId) return;
    if (kind === "primary" && primaryFull) {
      toast.error("Este Administrador já tem dois assistentes principais.");
      return;
    }
    try {
      await saveLink.mutateAsync({
        assistant_id: assistantId,
        administrator_id: adminId,
        relationship_type: kind,
        start_date: kind === "delegated" && start ? start.slice(0, 10) : null,
        end_date: kind === "delegated" && end ? end.slice(0, 10) : null,
        share_past: kind === "delegated" ? false : true,
        share_future: true,
        active: true,
      });
      toast.success("Administrador associado a este assistente.");
      setAdminId("");
      setStart("");
      setEnd("");
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível associar o Administrador"));
    }
  };

  const remove = async (id: string) => {
    try {
      await removeLink.mutateAsync(id);
      toast.success("Associação removida. Pode voltar a associar a qualquer momento.");
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível remover a associação"));
    }
  };

  return (
    <div className="space-y-2">
      <Label className="block">Administradores que serve</Label>
      {mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem Administrador associado.</p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {mine.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="font-medium">
                {administrators.find((o) => o.id === l.administrator_id)?.name ?? "-"}
              </span>
              <Badge variant={l.relationship_type === "primary" ? "secondary" : "outline"}>
                {l.relationship_type === "primary" ? "Principal" : "Delegação temporária"}
              </Badge>
              {l.relationship_type === "delegated" && (l.start_date || l.end_date) && (
                <span className="text-xs text-muted-foreground">
                  {l.start_date ? fmtDate(`${l.start_date}T00:00:00`) : "-"} a{" "}
                  {l.end_date ? fmtDate(`${l.end_date}T00:00:00`) : "sem fim"}
                </span>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="ml-auto size-7 text-muted-foreground hover:text-destructive"
                aria-label="Remover Administrador"
                disabled={removeLink.isPending}
                onClick={() => void remove(l.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label>Adicionar Administrador</Label>
          <Select value={adminId} onValueChange={setAdminId}>
            <SelectTrigger aria-label="Adicionar Administrador">
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  Sem Administradores disponíveis
                </SelectItem>
              ) : (
                available.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))
              )}
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
              <SelectItem value="primary" disabled={primaryFull}>
                Principal
              </SelectItem>
              <SelectItem value="delegated">Delegação temporária</SelectItem>
            </SelectContent>
          </Select>
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
      {primaryFull && (
        <p className="text-xs text-muted-foreground">
          Este Administrador já tem dois assistentes principais.
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={!adminId || saveLink.isPending}
        onClick={() => void add()}
      >
        {saveLink.isPending ? "A guardar…" : "Associar"}
      </Button>
      <p className="text-xs text-muted-foreground">
        A hierarquia de motoristas pertence ao Administrador; o assistente herda-a. As alterações são
        guardadas de imediato e podem ser revertidas; o histórico nunca é apagado.
      </p>
    </div>
  );
}
