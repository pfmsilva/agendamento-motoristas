import { useMemo, useState } from "react";
import { addDays, addMonths, format, isSameDay, startOfDay } from "date-fns";
import { pt } from "date-fns/locale";
import { CalendarPlus, ChevronLeft, ChevronRight, Pencil, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useActivities,
  useAdministrators,
  useAssistants,
  useCities,
  useDrivers,
  useTimeOff,
  useUnavailability,
  useDisplayNames,
} from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { CalendarNav } from "@/components/CalendarNav";
import { useResponsiveCalendarView } from "@/hooks/use-calendar-view";
import { WeekCalendar, rangeFor, type CalendarView } from "@/components/WeekCalendar";
import { useScheduleReleases } from "@/lib/schedule-releases";
import { ReleaseScheduleButton } from "@/components/ScheduleReleaseDialog";
import { ActivityDialog } from "@/components/ActivityDialog";
import { useActivityFromSearch } from "@/lib/activity-link";
import { AvailabilityDialog } from "@/components/AvailabilityDialog";
import { timeOffToPeriod } from "@/components/TimeOffEditDialog";
import {
  availabilityPeriods,
  effectiveEnd,
  effectiveStart,
  fmtDate,
  fmtDateTime,
  fmtTime,
  hasAdjustment,
  STATUS_LABEL,
  TIMEOFF_TYPE_LABEL,
  type Activity,
  type AvailabilityPeriod,
  isGarage,
  garageStyle,
  driverColorVar,
  EVENT_TAG,
} from "@/lib/scheduling";


function ActivityCard({
  a,
  administratorName,
  assistantName,
  createdByName,
  driverColor,
  canAdjust,
  onAdjust,
}: {
  a: Activity;
  administratorName?: string | undefined;
  assistantName?: string | undefined;
  createdByName?: string | undefined;
  driverColor: string;
  canAdjust: boolean;
  onAdjust: (a: Activity) => void;
}) {
  return (
    <div className="panel p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span
              className="rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={isGarage(a) ? garageStyle(driverColor) : undefined}
            >
              {isGarage(a) ? EVENT_TAG.garage : EVENT_TAG.administration}
            </span>
            {a.title}
          </p>
          <p className="text-sm text-muted-foreground">
            Serviço: {fmtDate(a.start_datetime)} · {fmtTime(a.start_datetime)}–{fmtTime(a.end_datetime)}
          </p>
          <p className="text-sm text-muted-foreground">
            Ocupação: {fmtTime(effectiveStart(a))}–{fmtTime(effectiveEnd(a))}
            {hasAdjustment(a)
              ? a.adjustment_source === "motorista"
                ? " (ajustada por si)"
                : " (ajustada pela gestão)"
              : ""}
          </p>
          {administratorName && (
            <p className="text-sm text-muted-foreground">{administratorName}</p>
          )}
          {assistantName && (
            <p className="text-sm text-muted-foreground">Assistente: {assistantName}</p>
          )}
          {(a.origin || a.destination) && (
            <p className="mt-1 text-sm">
              {a.origin ?? "-"} → {a.destination ?? "-"}
            </p>
          )}
          {createdByName && (
            <p className="text-sm text-muted-foreground">Criado por: {createdByName}</p>
          )}
          {a.notes && <p className="mt-1 text-xs text-muted-foreground">{a.notes}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant={a.status === "cancelled" ? "outline" : "secondary"}>{STATUS_LABEL[a.status]}</Badge>
          {canAdjust && a.status !== "cancelled" && (
            <Button size="sm" variant="ghost" onClick={() => onAdjust(a)}>
              <SlidersHorizontal className="size-3.5" /> Ajustar ocupação
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DriverDashboard() {
  const { user } = useAuth();
  const driverId = user?.driverId ?? "";
  // Permissão interna "Pode criar eventos": quando desligada, a agenda é só de consulta.
  const canCreate = user?.driverCanCreateEvents !== false;
  const [view, setView] = useResponsiveCalendarView("workweek");
  const [anchor, setAnchor] = useState(startOfDay(new Date()));
  const { data: activities = [] } = useActivities(rangeFor(view, anchor));
  const { data: displayNames } = useDisplayNames();
  const { data: timeOff = [] } = useTimeOff();
  const { data: unavailability = [] } = useUnavailability();
  const { data: cities = [] } = useCities();
  const { data: drivers = [] } = useDrivers();
  const { data: administrators = [] } = useAdministrators();
  const { data: assistants = [] } = useAssistants();

  const [availOpen, setAvailOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<AvailabilityPeriod | null>(null);
  const [slotInit, setSlotInit] = useState<{ start: Date; end: Date } | null>(null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [pendingAdjust, setPendingAdjust] = useState<{ start: Date; end: Date } | null>(null);
  const visibleRange = rangeFor(view, anchor);

  // Abre o serviço indicado por uma notificação, no calendário já existente.
  useActivityFromSearch((a) => {
    setAnchor(startOfDay(new Date(a.start_datetime)));
    setPendingAdjust(null);
    setAdjustingId(a.id);
  });
  // always read the freshest row so the dialog never edits a stale snapshot
  const adjusting = activities.find((a) => a.id === adjustingId) ?? null;


  const { data: releases = [] } = useScheduleReleases();
  const data = useMemo(
    () => ({ activities, timeOff, unavailability, cities, releases }),
    [activities, timeOff, unavailability, cities, releases],
  );
  const me = useMemo(() => drivers.filter((d) => d.id === driverId), [drivers, driverId]);
  const periods = useMemo(() => availabilityPeriods(driverId, data), [driverId, data]);


  const today = startOfDay(new Date());
  const groups = useMemo(() => {
    const sorted = [...activities].sort(
      (a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime(),
    );
    return {
      today: sorted.filter((a) => isSameDay(new Date(a.start_datetime), today)),
      tomorrow: sorted.filter((a) => isSameDay(new Date(a.start_datetime), addDays(today, 1))),
      week: sorted.filter((a) => {
        const d = new Date(a.start_datetime);
        return d > addDays(today, 1) && d <= addDays(today, 7);
      }),
      upcoming: sorted.filter((a) => new Date(a.start_datetime) > addDays(today, 7)),
    };
  }, [activities, today]);


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl">A minha agenda</h1>
          <p className="text-sm text-muted-foreground">
            {canCreate
              ? "Pode criar eventos na sua agenda (férias, compromissos pessoais ou serviços de um Administrador) e ajustar a sua ocupação."
              : "Consulte os seus serviços atribuídos e ajuste a sua ocupação."}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <ReleaseScheduleButton />
          {canCreate && (
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                setEditingPeriod(null);
                setSlotInit(null);
                setAvailOpen(true);
              }}
            >
              <CalendarPlus className="size-4" /> Novo serviço
            </Button>
          )}
        </div>
      </div>



      <CalendarNav view={view} onViewChange={setView} anchor={anchor} onAnchorChange={setAnchor} />

      <WeekCalendar
        drivers={me}
        data={data}
        view={view}
        anchor={anchor}
        {...(canCreate
          ? {
              onSlotClick: (_driver: unknown, start: Date) => {
                // clicking an empty cell opens the unavailability form pre-filled (1 hour)
                setEditingPeriod(null);
                setSlotInit({ start, end: new Date(start.getTime() + 60 * 60 * 1000) });
                setAvailOpen(true);
              },
            }
          : {})}
        onExpandDay={(date) => {
          setAnchor(date);
          setView("week");
        }}
        onActivityClick={(a) => {
          setPendingAdjust(null);
          setAdjustingId(a.id);
        }}
        onTimeOffClick={(t) => {
          setSlotInit(null);
          setEditingPeriod(timeOffToPeriod(t));
          setAvailOpen(true);
        }}
        {...(canCreate
          ? {
              onAdjustRange: (a: Activity, start: Date, end: Date) => {
                // the drag only proposes a window - nothing is written until "Guardar ajuste"
                setPendingAdjust({ start, end });
                setAdjustingId(a.id);
              },
            }
          : {})}
      />
      {canCreate && (
        <p className="text-xs text-muted-foreground">
          Arraste as extremidades de um bloco para propor uma nova ocupação. A alteração só fica gravada depois de confirmar em “Guardar ajuste”.
        </p>
      )}



      {(
        [
          ["Hoje", groups.today],
          ["Amanhã", groups.tomorrow],
          ["Esta semana", groups.week],
          ["Próximas", groups.upcoming],
        ] as const
      ).map(([label, items]) => (
        <section key={label} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada agendado.</p>
          ) : (
            items.map((a) => (
              <ActivityCard
                key={a.id}
                a={a}
                 administratorName={a.event_kind === "administration" ? administrators.find((o) => o.id === a.administrator_id)?.name : undefined}
                assistantName={assistants.find((s) => s.id === a.assistant_id)?.name}
                createdByName={a.created_by ? displayNames?.[a.created_by] : undefined}
                driverColor={driverColorVar(a.driver_id ?? driverId, drivers)}
                canAdjust={canCreate}
                onAdjust={(act) => {
                  setPendingAdjust(null);
                  setAdjustingId(act.id);
                }}
              />
            ))

          )}
        </section>
      ))}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            A minha indisponibilidade
          </h2>
          {canCreate && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingPeriod(null);
                setSlotInit(null);
                setAvailOpen(true);
              }}
            >
              Adicionar
            </Button>
          )}
        </div>
        {periods.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sem períodos registados - está disponível salvo serviços atribuídos.
          </p>
        )}
        {periods.map((p) => (
          <div key={`${p.source}-${p.id}`} className="panel flex items-center justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {p.allDay
                  ? `${fmtDate(p.start)} → ${fmtDate(p.end)}`
                  : `${fmtDateTime(p.start)} – ${fmtTime(p.end)}`}
              </p>
              <p className="text-muted-foreground">
                {p.allDay ? (TIMEOFF_TYPE_LABEL[p.kind] ?? p.kind) : "Parcial"}
                {p.reason ? ` · ${p.reason}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{p.allDay ? "Dia inteiro" : "Horas"}</Badge>
              {canCreate && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingPeriod(p);
                    setSlotInit(null);
                    setAvailOpen(true);
                  }}
                >
                  <Pencil className="size-3.5" /> Editar
                </Button>
              )}
            </div>
          </div>
        ))}
      </section>

      <ActivityDialog
        open={Boolean(adjusting)}
        onOpenChange={(v) => {
          if (!v) {
            // closing without confirming discards the proposed window
            setAdjustingId(null);
            setPendingAdjust(null);
          }
        }}
        draft={null}
        activity={adjusting}
        drivers={me}
        data={data}
        cities={cities}
        canOverride={false}
        mode="adjust"
        readOnly={!canCreate}
        pendingAdjust={pendingAdjust}
      />


      <AvailabilityDialog
        open={availOpen}
        onOpenChange={(v) => {
          setAvailOpen(v);
          if (!v) {
            setEditingPeriod(null);
            setSlotInit(null);
          }
        }}
        driverId={driverId}
        allowService
        period={editingPeriod}
        initialSlot={slotInit}
      />
    </div>
  );
}
