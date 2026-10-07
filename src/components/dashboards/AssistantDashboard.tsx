import { useMemo, useState } from "react";
import { startOfDay } from "date-fns";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

import { CalendarNav } from "@/components/CalendarNav";
import { useResponsiveCalendarView } from "@/hooks/use-calendar-view";
import { TimeOffEditDialog } from "@/components/TimeOffEditDialog";
import { WeekCalendar, rangeFor, type TimeOffRow } from "@/components/WeekCalendar";
import { useScheduleReleases } from "@/lib/schedule-releases";
import { ReleaseScheduleButton } from "@/components/ScheduleReleaseDialog";
import { ActivityDialog, type ActivityDraft } from "@/components/ActivityDialog";
import { useActivityFromSearch } from "@/lib/activity-link";
import { DelegateAdminPanel } from "@/components/DelegateAdminPanel";
import { ActiveDelegationsSection } from "@/components/ActiveDelegationsSection";
import { useAuth } from "@/lib/auth";
import {
  isLinkActiveNow,
  useActivities,
  useAdministrators,
  useAssistantAdministrators,
  useCities,
  useDrivers,
  useTimeOff,
  useUnavailability,
} from "@/lib/data";
import {
  PENDING_DRIVER_ID,
  fmtDate,
  fmtTime,
  type Activity,
  type Driver,
} from "@/lib/scheduling";

/** Etiqueta neutra: o pedido não expõe o estado interno de atribuição. */
const NO_DRIVER_LABEL = "Sem motorista";


/**
 * Assistente e Administrador: mesma vista operacional. Pedem serviços e veem o
 * motorista atribuído. Nunca veem prioridades nem estados internos de atribuição.
 */
export function AssistantDashboard() {
  const { user } = useAuth();
  const { data: drivers = [] } = useDrivers();
  const [view, setView] = useResponsiveCalendarView("workweek");
  const [anchor, setAnchor] = useState(startOfDay(new Date()));
  const { data: allActivities = [] } = useActivities(rangeFor(view, anchor));
  const { data: timeOff = [] } = useTimeOff();
  const { data: unavailability = [] } = useUnavailability();
  const { data: cities = [] } = useCities();
  const administratorsQuery = useAdministrators();
  const linksQuery = useAssistantAdministrators();
  const administrators = administratorsQuery.data ?? [];
  const links = linksQuery.data ?? [];

  // Só decidimos sobre o aviso de ligação depois de os dados chegarem: evita um
  // aviso momentâneo baseado em listas ainda vazias durante o carregamento.
  const linksReady =
    !!user && administratorsQuery.isSuccess && (user.role === "administrator" || linksQuery.isSuccess);

  const isAdministrator = user?.role === "administrator";

  /** Administradores que este utilizador serve neste momento. */
  const adminOptions = useMemo(() => {
    if (isAdministrator) {
      return administrators.filter((a) => a.id === user?.administratorId);
    }
    if (!user?.assistantId) return [];
    const ids = new Set(
      links
        .filter((l) => l.assistant_id === user.assistantId && isLinkActiveNow(l))
        .map((l) => l.administrator_id),
    );
    return administrators.filter((a) => ids.has(a.id) && a.active);
  }, [administrators, links, user?.assistantId, user?.administratorId, isAdministrator]);

  const adminName = (id: string | null) =>
    id ? (administrators.find((a) => a.id === id)?.name ?? "-") : "-";

  // Serviços dos Administradores servidos (a base de dados já limita; filtramos por segurança).
  const activities = useMemo(() => {
    const ids = new Set(adminOptions.map((a) => a.id));
    return allActivities.filter(
      (a) =>
        (a.administrator_id && ids.has(a.administrator_id)) ||
        (!isAdministrator && !!user?.assistantId && a.assistant_id === user.assistantId),
    );
  }, [allActivities, adminOptions, user?.assistantId, isAdministrator]);

  const { data: releases = [] } = useScheduleReleases();
  const data = useMemo(() => ({ activities, timeOff, unavailability, cities, releases }), [activities, timeOff, unavailability, cities, releases]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<ActivityDraft | null>(null);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [adjusting, setAdjusting] = useState<Activity | null>(null);
  const [pendingAdjust, setPendingAdjust] = useState<{ start: Date; end: Date } | null>(null);
  const [editingTimeOff, setEditingTimeOff] = useState<TimeOffRow | null>(null);
  const visibleRange = rangeFor(view, anchor);

  /** Faixas do calendário: motoristas com serviços meus + faixa neutra sem motorista. */
  const lanes = useMemo<Driver[]>(() => {
    const ids = new Set(activities.filter((a) => a.status !== "cancelled").map((a) => a.driver_id));
    const list = drivers.filter((d) => ids.has(d.id));
    if (ids.has(null)) {
      list.push({
        id: PENDING_DRIVER_ID,
        name: NO_DRIVER_LABEL,
        active: true,
        can_create_events: true,
        user_id: null,
        employee_code: null,
        assistant_id: null,
        color_index: null,
        created_at: "",
        updated_at: "",
      });
    }
    return list;
  }, [activities, drivers]);

  const now = Date.now();
  const upcoming = activities
    .filter((a) => a.status !== "cancelled" && new Date(a.end_datetime).getTime() >= now)
    .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime))
    .slice(0, 8);

  const openNew = (start?: Date) => {
    setEditing(null);
    setDraft(start ? { start } : {});
    setDialogOpen(true);
  };
  const openEdit = (a: Activity) => {
    setEditing(a);
    setDraft(null);
    setDialogOpen(true);
  };

  // Abre o serviço indicado por uma notificação, no calendário já existente.
  useActivityFromSearch((a) => {
    setAnchor(startOfDay(new Date(a.start_datetime)));
    openEdit(a);
  });

  const driverName = (a: Activity) =>
    a.driver_id ? (drivers.find((d) => d.id === a.driver_id)?.name ?? "Motorista") : NO_DRIVER_LABEL;


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Os meus serviços</h1>
          <p className="text-sm text-muted-foreground">
            Crie e acompanhe os serviços; o motorista aparece assim que estiver atribuído.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DelegateAdminPanel adminOptions={adminOptions} />
          <ReleaseScheduleButton />
          <Button onClick={() => openNew()} disabled={!linksReady || adminOptions.length === 0}>
            <CalendarPlus className="size-4" /> Novo serviço
          </Button>
        </div>
      </div>

      {linksReady && adminOptions.length === 0 && (
        <p className="rounded-md border border-leave bg-leave-soft p-4 text-sm text-leave">
          Ainda não está ligado a nenhum Administrador. Peça ao Proprietário ou ao Gestor para fazer
          essa ligação antes de criar serviços.
        </p>
      )}

      {/* Só aparece enquanto houver delegações a vigorar; some automaticamente. */}
      <ActiveDelegationsSection />


      <TimeOffEditDialog
        timeOff={editingTimeOff}
        open={editingTimeOff !== null}
        onOpenChange={(v) => { if (!v) setEditingTimeOff(null); }}
      />

      <CalendarNav view={view} onViewChange={setView} anchor={anchor} onAnchorChange={setAnchor} />

      <WeekCalendar
        drivers={lanes}
        data={data}
        view={view}
        anchor={anchor}
        onSlotClick={(_driverId, start) => openNew(start)}
        onExpandDay={(date) => {
          setAnchor(date);
          setView("week");
        }}
        onActivityClick={openEdit}
        onTimeOffClick={(t) => setEditingTimeOff(t)}
        // Mesmo fluxo de ajuste do Gestor: o arrasto só propõe a nova ocupação.
        canAdjust={(a) => a.status !== "cancelled"}
        onAdjustRange={(a, start, end) => {
          setPendingAdjust({ start, end });
          setAdjusting(a);
        }}
      />

      <div className="w-full">
        <section className="panel p-4">
          <h2 className="mb-2 text-sm font-semibold">Próximos serviços</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem serviços futuros.</p>
          ) : (
            <ul className="divide-y text-sm">
              {upcoming.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                  <button type="button" className="flex-1 text-left hover:underline" onClick={() => openEdit(a)}>
                    <span className="font-medium">{a.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {fmtDate(a.start_datetime)} {fmtTime(a.start_datetime)}–{fmtTime(a.end_datetime)}
                      {a.destination ? ` · ${a.destination}` : ""}
                      {` · ${adminName(a.administrator_id)}`}
                    </span>
                  </button>
                  <span className="text-xs">{driverName(a)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ActivityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        draft={draft}
        activity={editing}
        drivers={drivers}
        data={data}
        cities={cities}
        canOverride={false}
        mode="request"
        adminOptions={adminOptions}
        administrators={administrators}
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
        canOverride={false}
        administrators={administrators}
      />

    </div>
  );
}
