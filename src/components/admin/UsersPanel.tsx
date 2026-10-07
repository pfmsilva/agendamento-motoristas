import { useMemo, useState } from "react";
import { Search } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import {
  useActivities,
  useAssistants,
  useDeletePendingAccount,
  useDrivers,
  useProfiles,
  useUserRoles,
} from "@/lib/data";
import { errorMessagePt } from "@/lib/errors";
import { buildTeam, ROLE_LABEL, type TeamPerson } from "./team";
import { UserEditDialog } from "./UserEditDialog";

export function UsersPanel() {
  const { user } = useAuth();
  const { data: profiles = [] } = useProfiles();
  const { data: roles = [] } = useUserRoles();
  const { data: drivers = [] } = useDrivers();
  const { data: assistants = [] } = useAssistants();
  const { data: activities = [] } = useActivities();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [editing, setEditing] = useState<TeamPerson | null>(null);
  const [toDelete, setToDelete] = useState<TeamPerson | null>(null);
  const deleteAccount = useDeletePendingAccount();
  const isOwner = user?.role === "owner";

  const team = useMemo(
    () => buildTeam(profiles, roles, drivers, assistants),
    [profiles, roles, drivers, assistants],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return team.filter((p) => {
      if (statusFilter === "active" && !p.active) return false;
      if (statusFilter === "inactive" && p.active) return false;
      if (roleFilter !== "all") {
        const key = p.role ?? (p.profile ? "pending" : "no_account");
        if (key !== roleFilter) return false;
      }
      if (q && !p.name.toLowerCase().includes(q) && !p.email.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [team, search, statusFilter, roleFilter]);

  const filtersActive =
    search.trim() !== "" || statusFilter !== "all" || roleFilter !== "all";
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setRoleFilter("all");
  };

  const pending = filtered.filter((p) => p.profile && !p.role);
  const rest = filtered.filter((p) => !(p.profile && !p.role));

  const historyCount = (p: TeamPerson) =>
    p.driver ? activities.filter((a) => a.driver_id === p.driver!.id).length : 0;

  const confirmDelete = async () => {
    if (!toDelete?.profile) return;
    try {
      await deleteAccount.mutateAsync(toDelete.profile.id);
      toast.success("Pedido eliminado.");
      setToDelete(null);
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível eliminar o pedido"));
    }
  };

  const Row = ({ p, deletable = false }: { p: TeamPerson; deletable?: boolean }) => (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      <div className="min-w-0 sm:min-w-48 sm:flex-1">
        <p className="truncate text-sm font-medium">{p.name}</p>
        <p className="truncate text-xs text-muted-foreground">{p.email || "sem conta associada"}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={p.role ? "secondary" : p.profile ? "default" : "outline"}>
          {p.role ? ROLE_LABEL[p.role] : p.profile ? "Pendente de atribuição" : "Ficha sem conta"}
        </Badge>

        <Badge variant={p.active ? "outline" : "secondary"}>{p.active ? "Ativo" : "Inativo"}</Badge>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => setEditing(p)}>
          Editar
        </Button>

        {deletable && isOwner && p.profile && p.profile.id !== user?.userId && (
          <Button size="sm" variant="ghost" className="flex-1 sm:flex-none" onClick={() => setToDelete(p)}>
            Eliminar
          </Button>
        )}
      </div>
    </li>
  );


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Procurar por nome ou email…"
            aria-label="Procurar utilizador"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-36" aria-label="Filtrar por estado">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Estado: Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por perfil">
            <SelectValue placeholder="Perfil" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Perfil: Todos</SelectItem>
            {Object.entries(ROLE_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
            <SelectItem value="pending">Pendente de atribuição</SelectItem>
            <SelectItem value="no_account">Ficha sem conta</SelectItem>
          </SelectContent>
        </Select>

        {filtersActive && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            Limpar filtros
          </Button>
        )}

        <p className="text-xs text-muted-foreground">
          {"\n"}
        </p>
      </div>

      <section className="panel p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Contas pendentes de perfil</h2>
          <Badge variant={pending.length ? "default" : "outline"}>{pending.length}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Contas novas ficam sem acesso até lhes atribuir um perfil.
        </p>
        <ul className="mt-2 divide-y">
          {pending.map((p) => (
            <Row key={p.key} p={p} deletable />
          ))}

          {pending.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">Não há contas pendentes.</li>
          )}
        </ul>
      </section>

      <section className="panel p-4">
        <h2 className="text-sm font-semibold">Equipa</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Nome · Email · Perfil · Estado. O seu próprio perfil não pode ser alterado aqui.
        </p>
        <ul className="mt-2 divide-y">
          {rest.map((p) => (
            <Row key={p.key} p={p} />
          ))}
          {rest.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">
              {filtersActive ? "Sem resultados para os filtros escolhidos." : "Sem resultados."}
            </li>
          )}
        </ul>
      </section>

      <UserEditDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        person={editing}
        isSelf={!!editing?.profile && editing.profile.id === user?.userId}
        historyCount={editing ? historyCount(editing) : 0}
      />

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && !deleteAccount.isPending && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem a certeza de que pretende eliminar este pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta de {toDelete?.name || "-"} ({toDelete?.email || "sem email"}) será eliminada
              definitivamente. Esta ação não pode ser anulada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAccount.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteAccount.isPending}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleteAccount.isPending ? "A eliminar…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
