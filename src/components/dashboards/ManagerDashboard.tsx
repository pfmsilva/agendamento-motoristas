import { useEffect, useMemo, useState } from "react";
import { addDays, addMonths, format, startOfDay } from "date-fns";
import { pt } from "date-fns/locale";
import { AlertTriangle, CalendarOff, CalendarPlus, ChevronLeft, ChevronRight, Search, UserPlus, UserSearch } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { errorMessagePt } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarNav } from "@/components/CalendarNav";
import { useResponsiveCalendarView } from "@/hooks/use-calendar-view";
import { TimeOffEditDialog } from "@/components/TimeOffEditDialog";
import { WeekCalendar, rangeFor, type CalendarView, type TimeOffRow } from "@/components/WeekCalendar";
import { ActivityDialog, type ActivityDraft } from "@/components/ActivityDialog";
import { useActivityFromSearch } from "@/lib/activity-link";
import { FindDriverDialog } from "@/components/FindDriverDialog";
import { ManualAssignDialog } from "@/components/ManualAssignDialog";
import { ValidationPanel } from "@/components/ValidationPanel";
import { useScheduleReleases } from "@/lib/schedule-releases";
import { useAuth } from "@/lib/auth";
import {
  useActivities,
  useAdministrators,
  useAdjustReasons,
  useAssistants,
  useCities,
  useDecideEventApproval,
  useDecideOccupationAdjustment,
  useDisplayNames,
  useDrivers,
  useEventTags,
  useMarkNotificationsRead,
  useNotifications,
  useTimeOff,
  useUnavailability,
} from "@/lib/data";
import {
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  ASSIGNMENT_LABEL,
  ADMIN_GENERIC_TITLE,
  AVAILABILITY_CLASS,
  AVAILABILITY_LABEL,
  DRIVER_BADGE_CLASS,
  hidesAdminContent,
  PENDING_DRIVER_ID,
  PENDING_DRIVER_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
  availabilityForDay,
  dayWindow,
  driverBadge,
  computeState,
  effectiveEnd,
  effectiveStart,
  fmtDate,
  fmtTime,
  isPendingAssignment,
  canSeePendingAssignments,
  overlaps,
  type Activity,
  type AvailabilityStatus,
  type Driver,
} from "@/lib/scheduling";


/** Faixa virtual do calendário para serviços ainda sem motorista. */
const PENDING_LANE: Driver = {
  id: PENDING_DRIVER_ID,
  name: PENDING_DRIVER_LABEL,
  active: true,
  can_create_events: true,
  user_id: null,
  employee_code: null,
  assistant_id: null,
  color_index: null,
  created_at: "",
  updated_at: "",
};

/** Owner e Gestor: visão completa das operações, com atribuição manual. */
export function ManagerDashboard() {
  const { user } = useAuth();
  const canOverride = user?.role === "owner" || user?.role === "manager";
  
  const { data: drivers = [] } = useDrivers();
  const [view, setView] = useResponsiveCalendarView("workweek");
  const [anchor, setAnchor] = useState(startOfDay(new Date()));
  const { data: activities = [] } = useActivities(rangeFor(view, anchor));
  const { data: timeOff = [] } = useTimeOff();
  const { data: unavailability = [] } = useUnavailability();
  const { data: assistants = [] } = useAssistants();
  const { data: administrators = [] } = useAdministrators();
  const { data: cities = [] } = useCities();
  const { data: eventTags = [] } = useEventTags();
  const { data: adjustReasons = [] } = useAdjustReasons();
  const { data: notifications = [] } = useNotifications();
  const markNotificationsRead = useMarkNotificationsRead();
  const adminTagId = eventTags.find((tag) => tag.system_key === "admin")?.id ?? null;
  // Regra central: Gestor/Proprietário nunca veem título nem notas de Administração.
  const managerVisibleTitle = (activity: Activity) =>
    hidesAdminContent(user?.role) && adminTagId && activity.tag_id === adminTagId
      ? ADMIN_GENERIC_TITLE
      : activity.title;

  const { data: releases = [] } = useScheduleReleases();
  const data = useMemo(() => ({ activities, timeOff, unavailability, cities, releases }), [activities, timeOff, unavailability, cities, releases]);


  const [driverFilter, setDriverFilter] = useState("all");
  const [assistantFilter, setAssistantFilter] = useState("all");
  const [administratorFilter, setAdministratorFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<ActivityDraft | null>(null);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [openServiceAfterSearch, setOpenServiceAfterSearch] = useState(false);
  const [assigning, setAssigning] = useState<Activity | null>(null);
  // Mantém a versão atual do serviço enquanto o modal está aberto: evita atribuições
  // recusadas por o registo ter sido entretanto atualizado (versão em memória desatualizada).
  const assigningLive = useMemo(
    () => (assigning ? (activities.find((a) => a.id === assigning.id) ?? assigning) : null),
    [assigning, activities],
  );
  /** Ajuste da ocupação/deslocação de eventos de garagem (Gestor/Proprietário). */
  const [adjusting, setAdjusting] = useState<Activity | null>(null);
  const [pendingAdjust, setPendingAdjust] = useState<{ start: Date; end: Date } | null>(null);
  const [editingTimeOff, setEditingTimeOff] = useState<TimeOffRow | null>(null);

  // Só Gestor e Proprietário resolvem (e por isso veem) atribuições manuais pendentes.
  const canSeePending = canSeePendingAssignments(user?.role);
  const pendingServices = useMemo(
    () =>
      canSeePending
        ? activities
            .filter((a) => a.status !== "cancelled" && isPendingAssignment(a))
            .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime))
        : [],
    [activities, canSeePending],
  );

  // Eventos de tipos sujeitos a aprovação: basta o Gestor OU o Proprietário decidir.
  const pendingApprovals = useMemo(
    () =>
      activities
        .filter((a) => a.approval_status === "pending")
        .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime)),
    [activities],
  );
  const decideApproval = useDecideEventApproval();
  const { data: displayNames } = useDisplayNames();
  // Ajustes manuais de ocupação com motivo «Outros»: aguardam Gestor OU Proprietário.
  const decideAdjustment = useDecideOccupationAdjustment();
  const pendingAdjustments = useMemo(
    () =>
      canSeePending
        ? activities
            .filter((a) => a.adjustment_approval_status === "pending")
            .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime))
        : [],
    [activities, canSeePending],
  );
  // Avisos de férias são apenas informativos e permanecem aqui até ao reconhecimento.
  const holidayNotices = useMemo(
    () =>
      canSeePending
        ? notifications.filter(
            (notification) =>
              !notification.read &&
              notification.kind === "time_off" &&
              notification.title === "Férias / Ausência registada",
          )
        : [],
    [notifications, canSeePending],
  );
  // Locais criados por Assistentes ou Motoristas, ainda sem tempo de deslocação.
  const pendingCities = useMemo(
    () => cities.filter((c) => c.active && !c.is_base && !c.travel_configured),
    [cities],
  );

  // Abre o serviço indicado por uma notificação, no calendário já existente.
  useActivityFromSearch((a) => {
    setAnchor(startOfDay(new Date(a.start_datetime)));
    setEditing(a);
    setDraft(null);
    setDialogOpen(true);
  });

  const range = rangeFor(view, anchor);

  const visibleDrivers = useMemo(() => {
    const list = drivers.filter((d) => {
      if (driverFilter !== "all" && d.id !== driverFilter) return false;
      if (stateFilter !== "all") {
        const s = computeState(d.id, range.from, addDays(range.to, 1), data).state;
        if (s !== stateFilter) return false;
      }
      return true;
    });
    // Serviços por atribuir aparecem numa faixa própria, salvo quando se filtra um motorista.
    if (driverFilter === "all" && pendingServices.length > 0) list.push(PENDING_LANE);
    return list;
  }, [drivers, driverFilter, stateFilter, range.from, range.to, activities, timeOff, unavailability, pendingServices.length]);

  // O filtro de assistente aplica-se a quem pediu o serviço (já não há motoristas fixos por assistente).
  const filteredData = useMemo(
    () => ({
      ...data,
      activities: activities.filter(
        (a) =>
          (typeFilter === "all" || a.type === typeFilter) &&
          (statusFilter === "all" || a.status === statusFilter) &&
          (assistantFilter === "all" || a.assistant_id === assistantFilter) &&
          (administratorFilter === "all" || a.administrator_id === administratorFilter),
      ),
    }),
    [activities, typeFilter, statusFilter, assistantFilter, administratorFilter, timeOff, unavailability],
  );



  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return null;
    const driverName = (id: string | null) => (id ? (drivers.find((d) => d.id === id)?.name ?? "") : PENDING_DRIVER_LABEL);
    return activities
      .filter((a) =>
        [managerVisibleTitle(a), a.destination, a.origin, driverName(a.driver_id), a.start_datetime]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [search, activities, drivers, adminTagId]);

  const openNew = (driverId?: string, start?: Date, end?: Date, cityId?: string | null) => {
    setEditing(null);
    setDraft({ driverId, start, end, cityId: cityId ?? undefined });
    setDialogOpen(true);
  };

  const label =
    view === "day"
      ? format(anchor, "EEEE d 'de' MMMM 'de' yyyy", { locale: pt })
      : view === "workweek" || view === "week"
        ? `Semana de ${format(rangeFor(view, anchor).from, "d MMM yyyy", { locale: pt })}`
        : format(anchor, "MMMM yyyy", { locale: pt });


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Visão geral das operações</h1>
          <p className="text-sm text-muted-foreground">Todos os motoristas, todas as atividades, disponibilidade em tempo real.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setFindOpen(true)}>
            <UserSearch className="size-4" /> Encontrar motorista disponível
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => openNew()}>
            <CalendarPlus className="size-4" /> Novo serviço
          </Button>
        </div>
      </div>

      <ValidationPanel />

      {pendingCities.length > 0 && (
        <section className="rounded-md border border-leave bg-leave-soft p-4">
          <h2 className="text-sm font-semibold text-leave">
            {pendingCities.length === 1
              ? "1 local novo precisa de tempo de deslocação"
              : `${pendingCities.length} locais novos precisam de tempo de deslocação`}
          </h2>
          <p className="text-xs text-muted-foreground">
            {pendingCities.map((c) => c.name).join(", ")}
          </p>
          <Link
            to="/admin"
            search={{ tab: "cities" }}
            className="mt-2 inline-block text-sm font-medium underline"
          >
            Abrir Cidades e deslocações
          </Link>
        </section>
      )}

      {pendingApprovals.length > 0 && (
        <section className="rounded-md border border-leave bg-leave-soft p-4">
          <h2 className="text-sm font-semibold text-leave">
            {pendingApprovals.length === 1
              ? "1 evento aguarda aprovação"
              : `${pendingApprovals.length} eventos aguardam aprovação`}
          </h2>
          <ul className="mt-2 divide-y text-sm">
            {pendingApprovals.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                <button
                  type="button"
                  className="flex-1 text-left hover:underline"
                  onClick={() => {
                    setEditing(a);
                    setDraft(null);
                    setDialogOpen(true);
                  }}
                >
                  <span className="font-medium">{managerVisibleTitle(a)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {fmtDate(a.start_datetime)} {fmtTime(a.start_datetime)}–{fmtTime(a.end_datetime)}
                    {a.destination ? ` · ${a.destination}` : ""}
                    {" · "}
                    {a.driver_id ? (drivers.find((d) => d.id === a.driver_id)?.name ?? "-") : PENDING_DRIVER_LABEL}
                  </span>
                  {a.justification && (
                    <span className="block text-xs text-muted-foreground">
                      Justificação: {a.justification}
                    </span>
                  )}
                </button>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await decideApproval.mutateAsync({ id: a.id, approve: true });
                      toast.success("Evento aprovado.");
                    } catch (e) {
                      toast.error(errorMessagePt(e, "Não foi possível aprovar o evento"));
                    }
                  }}
                >
                  Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await decideApproval.mutateAsync({ id: a.id, approve: false });
                      toast.success("Evento rejeitado.");
                    } catch (e) {
                      toast.error(errorMessagePt(e, "Não foi possível rejeitar o evento"));
                    }
                  }}
                >
                  Rejeitar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendingAdjustments.length > 0 && (
        <section className="rounded-md border border-l-2 border-l-warning bg-card p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-warning">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {pendingAdjustments.length === 1
              ? "1 ajuste de ocupação aguarda aprovação"
              : `${pendingAdjustments.length} ajustes de ocupação aguardam aprovação`}
          </h2>
          <ul className="mt-3 space-y-3 text-sm">
            {pendingAdjustments.map((a) => (
              <li key={a.id} className="rounded-md border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Serviço</p>
                    <button
                      type="button"
                      className="mt-0.5 text-left font-semibold hover:underline"
                      onClick={() => {
                        setEditing(a);
                        setDraft(null);
                        setDialogOpen(true);
                      }}
                    >
                      {managerVisibleTitle(a)}
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pedido por {(a.adjustment_requested_by ? displayNames?.[a.adjustment_requested_by] : null) ?? "-"}
                      {a.adjustment_requested_at
                        ? ` · ${fmtDate(a.adjustment_requested_at)} ${fmtTime(a.adjustment_requested_at)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      disabled={decideAdjustment.isPending}
                      onClick={async () => {
                        try {
                          await decideAdjustment.mutateAsync({ id: a.id, approve: true });
                          toast.success("Ajuste aprovado.");
                        } catch (e) {
                          toast.error(errorMessagePt(e, "Não foi possível aprovar o ajuste"));
                        }
                      }}
                    >
                      Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decideAdjustment.isPending}
                      onClick={async () => {
                        try {
                          await decideAdjustment.mutateAsync({ id: a.id, approve: false });
                          toast.success("Ajuste rejeitado.");
                        } catch (e) {
                          toast.error(errorMessagePt(e, "Não foi possível rejeitar o ajuste"));
                        }
                      }}
                    >
                      Rejeitar
                    </Button>
                  </div>
                </div>

                <div className="mt-3 rounded-md border border-warning/40 bg-warning-soft p-3">
                  <p className="font-semibold text-warning">Alteração a aprovar</p>
                  <dl className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Ocupação atual</dt>
                      <dd className="mt-0.5 font-medium">
                        {fmtDate(a.effective_start ?? a.start_datetime)} {fmtTime(a.effective_start ?? a.start_datetime)} –{" "}
                        {fmtDate(a.effective_end ?? a.end_datetime)} {fmtTime(a.effective_end ?? a.end_datetime)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Nova ocupação proposta</dt>
                      <dd className="mt-0.5 font-semibold text-warning">
                        {fmtDate(a.adjustment_proposed_start ?? a.start_datetime)} {fmtTime(a.adjustment_proposed_start ?? a.start_datetime)} –{" "}
                        {fmtDate(a.adjustment_proposed_end ?? a.end_datetime)} {fmtTime(a.adjustment_proposed_end ?? a.end_datetime)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Motivo do ajuste</dt>
                      <dd className="mt-0.5 font-medium">
                        {a.adjustment_reason_label_snapshot ?? adjustReasons.find((reason) => reason.id === a.adjustment_reason_id)?.label ?? "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Justificação</dt>
                      <dd className="mt-0.5 whitespace-pre-line break-words font-medium">
                        {a.adjustment_justification ?? "-"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendingServices.length > 0 && (
        <section className="rounded-md border border-l-2 border-l-leave bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-leave">
              <AlertTriangle className="size-4" aria-hidden="true" />
              {pendingServices.length === 1
                ? "1 serviço aguarda atribuição manual"
                : `${pendingServices.length} serviços aguardam atribuição manual`}
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Nenhum motorista da hierarquia do Administrador estava disponível para toda a ocupação.
          </p>
          <ul className="mt-2 divide-y text-sm">
            {pendingServices.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/50">
                <button type="button" className="flex-1 text-left hover:underline" onClick={() => { setEditing(a); setDraft(null); setDialogOpen(true); }}>
                    <span className="font-medium">{managerVisibleTitle(a)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {fmtDate(a.start_datetime)} {fmtTime(a.start_datetime)}–{fmtTime(a.end_datetime)}
                    {a.destination ? ` · ${a.destination}` : ""}
                    {" · "}
                    {administrators.find((o) => o.id === a.administrator_id)?.name ?? "Sem Administrador"}
                    {" · pedido por "}
                    {assistants.find((s) => s.id === a.assistant_id)?.name ?? "-"}
                  </span>
                </button>
                <span className="text-xs text-muted-foreground">{ASSIGNMENT_LABEL[a.assignment_status]}</span>
                <Button size="sm" onClick={() => setAssigning(a)}>
                  <UserPlus className="size-4" /> Atribuir motorista
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {holidayNotices.length > 0 && (
        <section className="rounded-md border bg-card p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <CalendarOff className="size-4 text-leave" aria-hidden="true" />
            {holidayNotices.length === 1
              ? "1 Férias / Ausência registada"
              : `${holidayNotices.length} Férias / Ausências registadas`}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Informação operacional. Não é necessária aprovação.</p>
          <ul className="mt-2 divide-y text-sm">
            {holidayNotices.map((notification) => {
              const absence = timeOff.find((item) => item.id === notification.entity_id);
              const driver = absence ? drivers.find((item) => item.id === absence.driver_id) : null;
              return (
                <li key={notification.id} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto min-w-0 justify-start whitespace-normal px-2 py-1.5 text-left hover:bg-muted"
                    disabled={!absence}
                    onClick={() => absence && setEditingTimeOff(absence)}
                  >
                    <span className="min-w-0 max-w-full break-words">
                      <span className="block break-words font-medium">{driver?.name ?? "Motorista"}</span>
                      <span className="block text-xs font-normal text-muted-foreground">Férias / Ausência registada</span>
                      {absence ? (
                        <span className="mt-1 block text-xs font-normal text-foreground">
                          Início: {fmtDate(absence.start_date)} · Fim: {fmtDate(absence.end_date)}
                        </span>
                      ) : (
                        <span className="mt-1 block whitespace-pre-line break-words text-xs font-normal text-muted-foreground">{notification.body}</span>
                      )}
                    </span>
                  </Button>
                  <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-end">
                    <span className="text-xs leading-snug text-muted-foreground">Não é necessária aprovação</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={markNotificationsRead.isPending}
                      onClick={() => markNotificationsRead.mutate([notification.id])}
                    >
                      OK
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="panel space-y-2 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Disponibilidade em {format(anchor, "d 'de' MMMM", { locale: pt })}
        </p>
        <div className="flex flex-wrap gap-2">
          {visibleDrivers.filter((d) => d.id !== PENDING_DRIVER_ID).map((d) => {
            const res = availabilityForDay(d.id, anchor, data);
            const badge = driverBadge(d.id, ...dayWindow(anchor), data);
            return (
              <span
                key={d.id}
                title={res.reasons.join("\n") || "Sem restrições"}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                  res.status === "UNAVAILABLE" ? DRIVER_BADGE_CLASS[badge.kind] : AVAILABILITY_CLASS[res.status]
                }`}
              >
                <span className="font-medium">{d.name}</span>
                <span className="opacity-80">
                  {res.status === "UNAVAILABLE" ? badge.label : AVAILABILITY_LABEL[res.status]}
                </span>
              </span>
            );
          })}
          {visibleDrivers.length === 0 && (
            <span className="text-sm text-muted-foreground">Nenhum motorista corresponde aos filtros.</span>
          )}
        </div>
      </div>


      <div className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-60 flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Pesquisar motorista, atividade, destino, data…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <FilterSelect value={driverFilter} onChange={setDriverFilter} placeholder="Motorista"
            options={[{ value: "all", label: "Todos os motoristas" }, ...drivers.map((d) => ({ value: d.id, label: d.name }))]} />
          <FilterSelect value={assistantFilter} onChange={setAssistantFilter} placeholder="Assistente"
            options={[{ value: "all", label: "Todos os assistentes" }, ...assistants.map((a) => ({ value: a.id, label: a.name }))]} />
          <FilterSelect value={administratorFilter} onChange={setAdministratorFilter} placeholder="Administrador"
            options={[{ value: "all", label: "Todos os Administradores" }, ...administrators.map((o) => ({ value: o.id, label: o.name }))]} />
          <FilterSelect value={typeFilter} onChange={setTypeFilter} placeholder="Tipo"
            options={[{ value: "all", label: "Todos os tipos" }, ...ACTIVITY_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))]} />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} placeholder="Estado"
            options={[{ value: "all", label: "Todos os estados" }, ...ACTIVITY_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
          <FilterSelect value={stateFilter} onChange={setStateFilter} placeholder="Disponibilidade"
            options={[
              { value: "all", label: "Qualquer disponibilidade" },
              { value: "AVAILABLE", label: "Disponível" },
              { value: "BUSY", label: "Ocupado" },
              { value: "ON_LEAVE", label: "De férias" },
              { value: "UNAVAILABLE", label: "Indisponível" },
              { value: "CONFLICT", label: "Conflito" },
            ]} />
        </div>

        {searchResults && (
          <div className="rounded-md border">
            {searchResults.length === 0 && <p className="p-3 text-sm text-muted-foreground">Sem resultados.</p>}
            {searchResults.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setEditing(a);
                  setDraft(null);
                  setDialogOpen(true);
                }}
                className="flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
              >
                <span className="font-medium">{managerVisibleTitle(a)}</span>
                <span className="text-muted-foreground">
                  {a.driver_id ? drivers.find((d) => d.id === a.driver_id)?.name : PENDING_DRIVER_LABEL}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {fmtDate(a.start_datetime)} {fmtTime(a.start_datetime)} · {a.destination ?? "-"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <CalendarNav view={view} onViewChange={setView} anchor={anchor} onAnchorChange={setAnchor} />

      <WeekCalendar
        drivers={visibleDrivers}
        data={filteredData}
        view={view}
        anchor={anchor}
        onSlotClick={(driverId: string, start: Date) =>
          openNew(driverId || (driverFilter !== "all" ? driverFilter : undefined), start)
        }
        onExpandDay={(date) => {
          setAnchor(date);
          setView("week");
        }}
        onActivityClick={(a) => {
          setEditing(a);
          setDraft(null);
          setDialogOpen(true);
        }}
        onTimeOffClick={(t) => setEditingTimeOff(t)}
        // Gestor/Proprietário afinam a ocupação de qualquer evento visível.
        canAdjust={(a) => canOverride && a.status !== "cancelled"}
        onAdjustRange={(a, start, end) => {
          setPendingAdjust({ start, end });
          setAdjusting(a);
        }}
      />

      <>
      <TimeOffEditDialog
        timeOff={editingTimeOff}
        open={editingTimeOff !== null}
        onOpenChange={(v) => { if (!v) setEditingTimeOff(null); }}
      />
      <ActivityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        draft={draft}
        activity={editing}
        drivers={drivers}
        data={data}
        cities={cities}
        canOverride={canOverride}
        administrators={administrators}
        onAdjustOccupation={(a) => {
          setPendingAdjust(null);
          setAdjusting(a);
        }}
      />

      <ActivityDialog
        open={adjusting !== null}
        onOpenChange={(v) => {
          if (!v) {
            setAdjusting(null);
            setPendingAdjust(null);
          }
        }}
        mode="adjust"
        draft={null}
        activity={adjusting}
        pendingAdjust={pendingAdjust}
        drivers={drivers}
        data={data}
        cities={cities}
        canOverride={canOverride}
        administrators={administrators}
      />


      <ManualAssignDialog
        open={assigning !== null}
        onOpenChange={(v) => !v && setAssigning(null)}
        activity={assigningLive}
        drivers={drivers}
        data={data}
        canOverride={canOverride}
      />
      <FindDriverDialog
        open={findOpen}
        onOpenChange={setFindOpen}
        onClosed={() => {
          if (!openServiceAfterSearch) return;
          setOpenServiceAfterSearch(false);
          setDialogOpen(true);
        }}
        drivers={drivers}
        data={data}
        cities={cities}
        onPick={(driverId, start, end, cityId, originCityId) => {
          setEditing(null);
          setDraft({
            driverId,
            start,
            end,
            cityId: cityId ?? undefined,
            originCityId: originCityId ?? undefined,
          });
          setOpenServiceAfterSearch(true);
          setFindOpen(false);
        }}
      />
      </>

    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-auto min-w-52 gap-2 [&>span]:line-clamp-none [&>span]:overflow-visible">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
