import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/DateInput";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAdministrators,
  useAssistants,
  useAuditLog,
  useCities,
  useDrivers,
  useProfiles,
  useUserRoles,
} from "@/lib/data";
import type { Database } from "@/integrations/supabase/types";

type AuditRow = Database["public"]["Tables"]["audit_log"]["Row"];
type Json = Record<string, unknown>;

const ENTITY_LABEL: Record<string, string> = {
  activity: "Serviço",
  driver: "Motorista",
  assistant: "Assistente",
  city: "Cidade",
  assignment: "Atribuição",
  delegation: "Delegação",
  time_off: "Ausência",
  unavailability: "Indisponibilidade",
  user: "Utilizador",
  activity_validation: "Validação de alteração",
  loan_vehicle: "Viatura de empréstimo",
  loan_vehicle_event: "Registo de viatura de empréstimo",
  loan_vehicle_event_type: "Tipo de evento de viatura",
};

const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário",
  manager: "Gestor",
  administrator: "Administrador",
  assistant: "Assistente",
  driver: "Motorista",
};

type Kind = "created" | "updated" | "deleted" | "activated" | "deactivated" | "cancelled" | "other";

const KIND_LABEL: Record<Kind, string> = {
  created: "Criação",
  updated: "Alteração",
  deleted: "Eliminação",
  activated: "Ativação",
  deactivated: "Desativação",
  cancelled: "Cancelamento",
  other: "Outra ação",
};

const KIND_VARIANT: Record<Kind, "default" | "secondary" | "outline" | "destructive"> = {
  created: "default",
  updated: "secondary",
  deleted: "destructive",
  activated: "secondary",
  deactivated: "outline",
  cancelled: "destructive",
  other: "outline",
};

function actionKind(action: string): Kind {
  if (action.includes("created") || action.includes("requested")) return "created";
  if (action.includes("deleted")) return "deleted";
  if (action.includes("cancelled")) return "cancelled";
  if (action.includes("deactivated")) return "deactivated";
  if (action.includes("activated")) return "activated";
  if (
    action.includes("updated") ||
    action.includes("modified") ||
    action.includes("changed") ||
    action.includes("adjusted") ||
    action.includes("approved") ||
    action.includes("rejected") ||
    action.includes("overridden") ||
    action.includes("accepted") ||
    action.includes("refused")
  )
    return "updated";
  if (action.includes("ended")) return "deactivated";
  return "other";
}

/** Human labels for the columns we may show in the change details. */
const FIELD_LABEL: Record<string, string> = {
  name: "Nome",
  email: "Email",
  role: "Perfil",
  driver_name: "Ficha de motorista",
  assistant_name: "Ficha de assistente",
  title: "Título",
  type: "Tipo",
  status: "Estado",
  active: "Ativo",
  notes: "Notas",
  reason: "Motivo",
  origin: "Origem",
  destination: "Destino",
  employee_code: "Código",
  color_index: "Cor no calendário",
  driver_id: "Motorista",
  assistant_id: "Assistente",
  delegate_assistant_id: "Assistente delegado",
  delegated_by_assistant_id: "Delegado por",
  share_past: "Histórico passado partilhado",
  share_future: "Serviços futuros partilhados",
  city_id: "Cidade",
  start_datetime: "Início",
  end_datetime: "Fim",
  start_date: "Data de início",
  end_date: "Data de fim",
  travel_minutes: "Tempo de deslocação (min)",
  driver_adjusted_start: "Início ajustado",
  driver_adjusted_end: "Fim ajustado",
  adjustment_source: "Ajustado por",
  is_base: "Cidade base",
  override_conflict: "Conflito forçado",
  administrator_id: "Administrador",
  delegation_state: "Estado da delegação",
  decided_at: "Data da decisão",
  decided_by: "Decidido por",
  ended_at: "Terminada em",
  ended_by: "Terminada por",
};

/** Estados internos com rótulo PT-PT na auditoria. */
const STATE_LABEL: Record<string, string> = {
  pending: "Pendente de aceitação",
  active: "Ativa",
  refused: "Recusada",
  ended: "Terminada",
};

const HIDDEN_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "requested_by",
  "approved_by",
  "original_assistant_id",
  "calculated_occupation_start",
  "calculated_occupation_end",
  "effective_start",
  "effective_end",
  "travel_unknown",
  "outbound_minutes",
  "return_minutes",
  "title",
  "notes",
  "user_id",
]);

const DATE_FIELDS = new Set([
  "start_datetime",
  "end_datetime",
  "driver_adjusted_start",
  "driver_adjusted_end",
]);

export function AuditPanel() {
  const { data: audit = [] } = useAuditLog();
  const { data: profiles = [] } = useProfiles();
  const { data: drivers = [] } = useDrivers();
  const { data: assistants = [] } = useAssistants();
  const { data: administrators = [] } = useAdministrators();
  const { data: cities = [] } = useCities();
  const { data: userRoles = [] } = useUserRoles();


  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState("all");
  const [kind, setKind] = useState("all");
  const [entity, setEntity] = useState("all");
  const [detail, setDetail] = useState<AuditRow | null>(null);

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drivers) map.set(d.id, d.name);
    for (const a of assistants) map.set(a.id, a.name);
    for (const a of administrators) map.set(a.id, a.name);
    for (const c of cities) map.set(c.id, c.name);
    for (const p of profiles) map.set(p.id, p.name || p.email);
    return map;
  }, [drivers, assistants, administrators, cities, profiles]);

  const label = (v: unknown, field?: string): string => {
    if (v === null || v === undefined || v === "") return "-";
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    if (typeof v === "string") {
      if (field === "adjustment_source") return v === "motorista" ? "Motorista" : "Gestor/Proprietário";
      if (field === "delegation_state" && STATE_LABEL[v]) return STATE_LABEL[v];
      if (nameOf.has(v)) return nameOf.get(v)!;
      if (field && DATE_FIELDS.has(field)) return new Date(v).toLocaleString("pt-PT");
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v).toLocaleDateString("pt-PT");
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString("pt-PT");
      return v;
    }
    if (typeof v === "number") return String(v);
    return "-";
  };

  const describe = (row: AuditRow): string => {
    const nv = (row.new_value ?? row.old_value) as Json | null;
    const name =
      (typeof nv?.["title"] === "string" && nv["title"]) ||
      (typeof nv?.["name"] === "string" && nv["name"]) ||
      (typeof nv?.["driver_id"] === "string" && nameOf.get(nv["driver_id"] as string)) ||
      (typeof nv?.["administrator_id"] === "string" && nameOf.get(nv["administrator_id"] as string)) ||
      (typeof nv?.["email"] === "string" && nv["email"]) ||
      "";
    return name || "-";
  };

  const changes = (row: AuditRow) => {
    const oldV = (row.old_value ?? {}) as Json;
    const newV = (row.new_value ?? {}) as Json;
    const keys = new Set([...Object.keys(oldV), ...Object.keys(newV)].filter((k) => !HIDDEN_FIELDS.has(k)));
    const out: { field: string; before: unknown; after: unknown }[] = [];
    for (const k of keys) {
      const a = oldV[k] ?? null;
      const b = newV[k] ?? null;
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      out.push({ field: k, before: a, after: b });
    }
    return out;
  };

  const users = useMemo(
    () => profiles.filter((p) => audit.some((a) => a.user_id === p.id)),
    [profiles, audit],
  );
  const entities = useMemo(
    () => Array.from(new Set(audit.map((a) => a.entity_type))),
    [audit],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return audit.filter((a) => {
      if (userId !== "all" && a.user_id !== userId) return false;
      if (kind !== "all" && actionKind(a.action) !== kind) return false;
      if (entity !== "all" && a.entity_type !== entity) return false;
      const t = new Date(a.created_at).getTime();
      if (from && t < new Date(`${from}T00:00:00`).getTime()) return false;
      if (to && t > new Date(`${to}T23:59:59`).getTime()) return false;
      if (!q) return true;
      const hay = [
        ENTITY_LABEL[a.entity_type] ?? a.entity_type,
        KIND_LABEL[actionKind(a.action)],
        describe(a),
        nameOf.get(a.user_id ?? "") ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [audit, search, from, to, userId, kind, entity, nameOf]);

  const roleOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of userRoles) map.set(r.user_id, ROLE_LABEL[r.role] ?? r.role);
    return map;
  }, [userRoles]);

  /** Exporta exatamente as linhas visíveis (filtros ativos) para .xlsx. */
  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const data = rows.map((a) => {
      const d = new Date(a.created_at);
      const details = changes(a)
        .map(
          (c) =>
            `${FIELD_LABEL[c.field] ?? c.field}: ${label(c.before, c.field)} → ${label(c.after, c.field)}`,
        )
        .join("; ");
      return {
        Data: d.toLocaleDateString("pt-PT"),
        Hora: d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
        Utilizador: nameOf.get(a.user_id ?? "") ?? "Sistema",
        Perfil: roleOf.get(a.user_id ?? "") ?? "-",
        Ação: KIND_LABEL[actionKind(a.action)],
        Entidade: ENTITY_LABEL[a.entity_type] ?? a.entity_type,
        Descrição: describe(a),
        Detalhes: details || "-",
      };
    });
    const sheet = XLSX.utils.json_to_sheet(data);
    sheet["!cols"] = [
      { wch: 12 },
      { wch: 8 },
      { wch: 24 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 28 },
      { wch: 60 },
    ];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Auditoria");
    const stamp = new Date().toISOString().slice(0, 10).split("-").reverse().join("-");
    XLSX.writeFile(book, `auditoria-${stamp}.xlsx`);
  };

  return (
    <section className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Histórico de alterações</h2>
          <p className="text-xs text-muted-foreground">
            Quem alterou, quando, o que mudou e qual era o valor anterior. Clique numa linha para ver os detalhes.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={exportExcel}>
          <Download className="mr-2 h-4 w-4" />
          Exportar para Excel
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="md:col-span-3 lg:col-span-2">
          <Label className="text-xs">Pesquisar</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome, serviço, motorista..."
          />
        </div>
        <div>
          <Label className="text-xs">De</Label>
          <DateInput value={from} onChange={(v) => setFrom(v)} />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <DateInput value={to} onChange={(v) => setTo(v)} />
        </div>
        <div>
          <Label className="text-xs">Utilizador</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Tipo de ação</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Entidade</Label>
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {entities.map((e) => (
                <SelectItem key={e} value={e}>{ENTITY_LABEL[e] ?? e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(search || from || to || userId !== "all" || kind !== "all" || entity !== "all") && (
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setFrom("");
                setTo("");
                setUserId("all");
                setKind("all");
                setEntity("all");
              }}
            >
              Limpar filtros
            </Button>
          </div>
        )}
      </div>

      {/* Telemóvel: cada registo é um cartão; a partir de md volta a tabela. */}
      <ul className="space-y-2 md:hidden">
        {rows.map((a) => {
          const k = actionKind(a.action);
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setDetail(a)}
                className="w-full rounded-lg border p-3 text-left hover:bg-muted/50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={KIND_VARIANT[k]}>{KIND_LABEL[k]}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {ENTITY_LABEL[a.entity_type] ?? a.entity_type}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("pt-PT")}
                  </span>
                </div>
                <p className="mt-1.5 text-sm">{describe(a)}</p>
                <p className="text-xs text-muted-foreground">
                  {nameOf.get(a.user_id ?? "") ?? "Sistema"}
                </p>
              </button>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="py-6 text-center text-sm text-muted-foreground">
            Sem registos para estes filtros.
          </li>
        )}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Data / hora</th>
              <th className="py-2 pr-3 font-medium">Utilizador</th>
              <th className="py-2 pr-3 font-medium">Ação</th>
              <th className="py-2 pr-3 font-medium">Entidade</th>
              <th className="py-2 pr-3 font-medium">Descrição</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const k = actionKind(a.action);
              return (
                <tr
                  key={a.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => setDetail(a)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setDetail(a);
                  }}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
                >
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {new Date(a.created_at).toLocaleString("pt-PT")}
                  </td>
                  <td className="py-2 pr-3">{nameOf.get(a.user_id ?? "") ?? "Sistema"}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={KIND_VARIANT[k]}>{KIND_LABEL[k]}</Badge>
                  </td>
                  <td className="py-2 pr-3">{ENTITY_LABEL[a.entity_type] ?? a.entity_type}</td>
                  <td className="py-2 pr-3">{describe(a)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  Sem registos para estes filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {(ENTITY_LABEL[detail.entity_type] ?? detail.entity_type)}{" "}
                  {KIND_LABEL[actionKind(detail.action)].toLowerCase()}
                </DialogTitle>
                <DialogDescription>{describe(detail)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Utilizador: </span>
                  {nameOf.get(detail.user_id ?? "") ?? "Sistema"}
                </p>
                <p>
                  <span className="text-muted-foreground">Data: </span>
                  {new Date(detail.created_at).toLocaleString("pt-PT")}
                </p>
                {detail.entity_type === "user" && (() => {
                  const ov = (detail.old_value ?? {}) as Json;
                  const n = typeof ov["name"] === "string" ? ov["name"] : "";
                  const em = typeof ov["email"] === "string" ? ov["email"] : "";
                  return (
                    <p>
                      <span className="text-muted-foreground">Utilizador eliminado: </span>
                      {[n, em ? `(${em})` : ""].filter(Boolean).join(" ") || "-"}
                    </p>
                  );
                })()}
                {actionKind(detail.action) === "deleted" && (
                  <p className="text-muted-foreground">
                    Histórico preservado: sim - os registos associados mantêm-se.
                  </p>
                )}
                {(() => {
                  const list = changes(detail);
                  if (list.length === 0) {
                    return <p className="text-muted-foreground">Sem alterações de campos a mostrar.</p>;
                  }
                  return (
                    <div className="divide-y rounded-md border">
                      {list.map((c) => (
                        <div key={c.field} className="grid grid-cols-3 gap-2 px-3 py-2">
                          <span className="font-medium">{FIELD_LABEL[c.field] ?? c.field}</span>
                          <span className="text-muted-foreground line-through">
                            {label(c.before, c.field)}
                          </span>
                          <span>{label(c.after, c.field)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
