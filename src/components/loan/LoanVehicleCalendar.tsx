import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { pt } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Download, ListFilter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatDuration,
  loanIntervalOnDay,
  mergeLoanIntervals,
  minutesOnDay,
  loanStatus,
  LOAN_COLOR_CLASSES,
  LOAN_STATUS_LABEL,
  loanTypeLabel,
  ptTime,
  subtractLoanIntervals,
  type LoanInterval,
  type LoanEvent,
  type LoanEventType,
  type LoanVehicle,
} from "@/lib/loan-vehicles";

export type LoanView = "day" | "week" | "month";

const PLATE_W = 132;
const HOUR_W = 48;
const DAY_TIMELINE_W = HOUR_W * 24;
const BASE_ROW_H = 44;
const LANE_H = 42;

const eventClass = (event: LoanEvent, type?: LoanEventType) =>
  event.kind === "inspection"
    ? "cursor-pointer border border-dashed border-blue-strong bg-blue-pale text-blue-strong hover:border-blue-strong hover:shadow-sm"
    : event.kind === "allocation"
      ? event.permanent
        ? "cursor-pointer border border-blue-strong/40 bg-blue-viz text-primary-foreground hover:border-blue-strong"
        : "cursor-pointer border border-chart-5/60 bg-chart-5 text-primary-foreground hover:border-chart-5"
      : `cursor-pointer border hover:shadow-sm ${LOAN_COLOR_CLASSES[(type?.color_key ?? event.kind_color_snapshot ?? "neutral") as keyof typeof LOAN_COLOR_CLASSES] ?? LOAN_COLOR_CLASSES.neutral} ${type?.pattern === "dashed" || event.kind_pattern_snapshot === "dashed" ? "border-dashed" : ""}`;

function eventLabel(event: LoanEvent, eventTypes: LoanEventType[]) {
  return event.person_name ?? loanTypeLabel(event, eventTypes);
}

function eventPeriod(event: LoanEvent, segment?: LoanInterval) {
  if (event.permanent && segment) {
    return `Permanente · ${format(segment.start, "HH:mm")}–${format(segment.end, "HH:mm")}`;
  }
  return event.permanent ? "Permanente" : `${ptTime(event.start_datetime)}–${ptTime(event.end_datetime)}`;
}

function periodLabel(view: LoanView, anchor: Date) {
  if (view === "day") return format(anchor, "d 'de' MMMM 'de' yyyy", { locale: pt });
  if (view === "month") return format(anchor, "MMMM yyyy", { locale: pt });
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const end = addDays(start, 6);
  return `${format(start, "d", { locale: pt })}–${format(end, "d 'de' MMMM 'de' yyyy", { locale: pt })}`;
}

type VisibleEvent = { event: LoanEvent; interval: LoanInterval; segment: number };
type PositionedEvent = VisibleEvent & { lane: number };

function visibleEventsOnDay(events: LoanEvent[], day: Date, eventTypes: LoanEventType[] = []): VisibleEvent[] {
  const temporaryIntervals = events
    .filter((event) => !event.permanent && (eventTypes.find((type) => type.key === event.kind)?.allows_overlap_with_permanent ?? true))
    .map((event) => loanIntervalOnDay(event, day))
    .filter((interval): interval is LoanInterval => interval !== null);

  return events.flatMap((event) => {
    const interval = loanIntervalOnDay(event, day);
    if (!interval) return [];
    const segments = event.permanent ? subtractLoanIntervals(interval, temporaryIntervals) : [interval];
    return segments.map((segment, index) => ({ event, interval: segment, segment: index }));
  });
}

function placeInLanes(events: LoanEvent[], day: Date, eventTypes: LoanEventType[]) {
  const sorted = visibleEventsOnDay(events, day, eventTypes).sort(
    (a, b) => a.interval.start - b.interval.start || Number(a.event.permanent) - Number(b.event.permanent),
  );
  const laneEnds: number[] = [];
  const positioned: PositionedEvent[] = [];

  for (const visible of sorted) {
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= visible.interval.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = visible.interval.end;
    positioned.push({ ...visible, lane });
  }

  return { positioned, laneCount: Math.max(1, laneEnds.length) };
}

export function LoanVehicleCalendar({
  view,
  onViewChange,
  anchor,
  onAnchorChange,
  vehicles,
  events,
  eventTypes,
  onOpenEvent,
  onEmptyCell,
  onDayDetail,
  onExport,
}: {
  view: LoanView;
  onViewChange: (view: LoanView) => void;
  anchor: Date;
  onAnchorChange: (date: Date) => void;
  vehicles: LoanVehicle[];
  events: LoanEvent[];
  eventTypes: LoanEventType[];
  onOpenEvent: (event: LoanEvent) => void;
  onEmptyCell: (vehicleId: string, date: Date, view: LoanView) => void;
  onDayDetail: (vehicleId: string, date: Date) => void;
  onExport: (events: LoanEvent[], period: { from: string; to: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [plateFilter, setPlateFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const active = useMemo(() => events.filter((event) => !event.cancelled), [events]);

  const step = (direction: number) =>
    onAnchorChange(
      view === "month"
        ? addMonths(anchor, direction)
        : addDays(anchor, view === "week" ? 7 * direction : direction),
    );

  const days = useMemo(() => {
    if (view === "day") return [startOfDay(anchor)];
    if (view === "week") {
      const start = startOfWeek(anchor, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, index) => addDays(start, index));
    }
    const start = startOfMonth(anchor);
    return Array.from({ length: endOfMonth(anchor).getDate() }, (_, index) => addDays(start, index));
  }, [view, anchor]);

  const periodStart = days[0]?.getTime() ?? startOfDay(anchor).getTime();
  const periodEnd = addDays(days[days.length - 1] ?? startOfDay(anchor), 1).getTime();
  const periodEvents = useMemo(
    () => active.filter((event) => new Date(event.start_datetime).getTime() < periodEnd && new Date(event.end_datetime).getTime() > periodStart),
    [active, periodEnd, periodStart],
  );
  const people = useMemo(
    () => Array.from(new Set(active.map((event) => event.person_name?.trim()).filter((name): name is string => Boolean(name)))).sort((a, b) => a.localeCompare(b, "pt-PT")),
    [active],
  );
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT");
  const normalizedQuery = normalize(query.trim());
  const hasFilters = Boolean(query.trim()) || plateFilter !== "all" || personFilter !== "all" || statusFilter !== "all" || kindFilter !== "all";
  const eventMatchesFilters = (event: LoanEvent) => {
    if (personFilter !== "all" && event.person_name !== personFilter) return false;
    if (kindFilter !== "all" && event.kind !== kindFilter) return false;
    if (statusFilter !== "all" && statusFilter !== "available" && loanStatus(event) !== statusFilter) return false;
    return true;
  };
  const filteredEvents = useMemo(
    () => active.filter((event) => eventMatchesFilters(event)),
    [active, kindFilter, personFilter, statusFilter],
  );
  const filteredVehicles = useMemo(() => vehicles.filter((vehicle) => {
    if (plateFilter !== "all" && vehicle.id !== plateFilter) return false;
    const vehiclePeriodEvents = periodEvents.filter((event) => event.vehicle_id === vehicle.id);
    if (statusFilter === "available") {
      if (vehiclePeriodEvents.length > 0 || personFilter !== "all" || kindFilter !== "all") return false;
    } else if ((personFilter !== "all" || kindFilter !== "all" || statusFilter !== "all") && !vehiclePeriodEvents.some(eventMatchesFilters)) {
      return false;
    }
    if (!normalizedQuery) return true;
    const vehicleText = normalize([vehicle.plate, vehicle.brand, vehicle.model].filter(Boolean).join(" "));
    if (vehicleText.includes(normalizedQuery)) return true;
    return vehiclePeriodEvents.some((event) => normalize([
      eventLabel(event, eventTypes),
      event.person_name,
      event.notes,
      loanTypeLabel(event, eventTypes),
      event.permanent ? "permanente" : "temporária",
      LOAN_STATUS_LABEL[loanStatus(event)],
    ].filter(Boolean).join(" ")).includes(normalizedQuery));
  }), [vehicles, plateFilter, personFilter, kindFilter, statusFilter, normalizedQuery, periodEvents, eventTypes]);

  const clearFilters = () => {
    setQuery("");
    setPlateFilter("all");
    setPersonFilter("all");
    setStatusFilter("all");
    setKindFilter("all");
  };

  const eventsOf = (vehicleId: string, day: Date) =>
    filteredEvents.filter(
      (event) => event.vehicle_id === vehicleId && minutesOnDay(event, startOfDay(day)) > 0,
    );

  const selectedDay = days[0] ?? startOfDay(anchor);

  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 lg:flex lg:flex-wrap">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="Seguinte">
            <ChevronRight className="size-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="min-w-0 gap-2 px-2 text-sm font-semibold first-letter:uppercase">
                <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{periodLabel(view, anchor)}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={anchor}
                defaultMonth={anchor}
                captionLayout="dropdown"
                startMonth={new Date(2020, 0)}
                endMonth={new Date(2035, 11)}
                onSelect={(date) => date && onAnchorChange(startOfDay(date))}
              />
            </PopoverContent>
          </Popover>
        </div>
        <Tabs value={view} onValueChange={(value) => onViewChange(value as LoanView)} className="shrink-0 lg:ml-auto">
          <TabsList>
            <TabsTrigger value="day">Dia</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="month">Mês</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Pesquisar matrícula, pessoa ou evento" aria-label="Pesquisar viaturas e eventos" />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="shrink-0">
              <ListFilter className="size-4" />
              Filtros{[plateFilter, personFilter, statusFilter, kindFilter].filter((value) => value !== "all").length ? ` · ${[plateFilter, personFilter, statusFilter, kindFilter].filter((value) => value !== "all").length}` : ""}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] space-y-3 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="loan-plate-filter">Matrícula</Label>
              <Select value={plateFilter} onValueChange={setPlateFilter}>
                <SelectTrigger id="loan-plate-filter"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas as matrículas</SelectItem>{vehicles.map((vehicle) => <SelectItem key={vehicle.id} value={vehicle.id}>{vehicle.plate}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-person-filter">Pessoa alocada</Label>
              <Select value={personFilter} onValueChange={setPersonFilter}>
                <SelectTrigger id="loan-person-filter"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas as pessoas</SelectItem>{people.map((person) => <SelectItem key={person} value={person}>{person}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-status-filter">Estado / disponibilidade</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="loan-status-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os estados</SelectItem>
                  <SelectItem value="available">Disponível no período</SelectItem>
                  <SelectItem value="scheduled">Agendada</SelectItem>
                  <SelectItem value="ongoing">Em curso</SelectItem>
                  <SelectItem value="done">Concluída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-kind-filter">Tipo de evento</Label>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger id="loan-kind-filter"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{eventTypes.filter((type) => type.active).map((type) => <SelectItem key={type.key} value={type.key}>{type.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="sm" className="w-full" onClick={clearFilters} disabled={!hasFilters}><X className="size-4" />Limpar filtros</Button>
          </PopoverContent>
        </Popover>
        {hasFilters && <Button variant="ghost" size="sm" className="shrink-0" onClick={clearFilters}><X className="size-4" />Limpar filtros</Button>}
        <Button variant="outline" className="shrink-0" disabled={!periodEvents.length} onClick={() => onExport(periodEvents.filter(eventMatchesFilters).filter((event) => filteredVehicles.some((vehicle) => vehicle.id === event.vehicle_id)), { from: format(days[0] ?? anchor, "yyyy-MM-dd"), to: format(days[days.length - 1] ?? anchor, "yyyy-MM-dd") })}><Download className="size-4" />Exportar Excel</Button>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-blue-viz" /> Alocação permanente</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-chart-5" /> Alocação temporária</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm border-2 border-dashed border-blue-strong bg-blue-pale" /> Inspeção</span>
      </div>

      <div className="panel w-full min-w-0 overflow-auto" style={{ maxHeight: "70vh" }}>
        {filteredVehicles.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma viatura corresponde aos filtros.</p>}
        {view === "day" && (
          <DayGrid day={selectedDay} vehicles={filteredVehicles} eventsOf={eventsOf} eventTypes={eventTypes} onOpenEvent={onOpenEvent} onEmptyCell={onEmptyCell} />
        )}
        {view === "week" && (
          <WeekGrid days={days} vehicles={filteredVehicles} eventsOf={eventsOf} eventTypes={eventTypes} onOpenEvent={onOpenEvent} onEmptyCell={onEmptyCell} onDayDetail={onDayDetail} />
        )}
        {view === "month" && (
          <MonthGrid days={days} vehicles={filteredVehicles} eventsOf={eventsOf} eventTypes={eventTypes} onEmptyCell={onEmptyCell} />
        )}
      </div>
    </div>
  );
}

type GridProps = {
  vehicles: LoanVehicle[];
  eventsOf: (vehicleId: string, day: Date) => LoanEvent[];
  eventTypes: LoanEventType[];
  onOpenEvent: (event: LoanEvent) => void;
  onEmptyCell: (vehicleId: string, date: Date, view: LoanView) => void;
};

function PlateCell({ vehicle, height = BASE_ROW_H }: { vehicle: LoanVehicle; height?: number }) {
  return (
    <div className="sticky left-0 z-20 flex items-center border-r border-b border-border bg-card px-2 text-xs font-semibold" style={{ height }} title={[vehicle.brand, vehicle.model].filter(Boolean).join(" ")}>
      <span className="truncate">{vehicle.plate}</span>
    </div>
  );
}

function DayGrid({ day, vehicles, eventsOf, eventTypes, onOpenEvent, onEmptyCell }: GridProps & { day: Date }) {
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(startOfDay(day), 1).getTime();
  const template = `${PLATE_W}px minmax(${DAY_TIMELINE_W}px, 1fr)`;
  const minuteOfDay = (timestamp: number) => {
    if (timestamp <= dayStart) return 0;
    if (timestamp >= dayEnd) return 24 * 60;
    const value = new Date(timestamp);
    return value.getHours() * 60 + value.getMinutes() + value.getSeconds() / 60;
  };

  return (
    <div className="w-full" style={{ minWidth: PLATE_W + DAY_TIMELINE_W }}>
      <div className="sticky top-0 z-30 grid bg-surface-2" style={{ gridTemplateColumns: template }}>
        <div className="sticky left-0 z-40 border-r border-b border-border bg-surface-2 px-2 py-2 text-xs font-semibold uppercase text-muted-foreground">Matrícula</div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
          {hours.map((hour) => <div key={hour} className="border-r border-b border-border py-2 text-center text-[11px] text-muted-foreground">{String(hour).padStart(2, "0")}:00</div>)}
        </div>
      </div>
      {vehicles.map((vehicle) => {
        const items = eventsOf(vehicle.id, day);
        const { positioned, laneCount } = placeInLanes(items, day, eventTypes);
        const rowHeight = Math.max(BASE_ROW_H, laneCount * LANE_H + 6);
        return (
          <div key={vehicle.id} className="grid" style={{ gridTemplateColumns: template }}>
            <PlateCell vehicle={vehicle} height={rowHeight} />
            <div className="relative border-b border-border" style={{ height: rowHeight }}>
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                {hours.map((hour) => (
                  <Button key={hour} variant="ghost" className="h-full min-w-0 rounded-none border-r border-border/60 p-0" aria-label={`Nova alocação ${vehicle.plate} às ${String(hour).padStart(2, "0")}:00`} onClick={() => {
                    const date = new Date(day);
                    date.setHours(hour, 0, 0, 0);
                    onEmptyCell(vehicle.id, date, "day");
                  }} />
                ))}
              </div>
              {positioned.map(({ event, interval, lane, segment }) => {
                const start = interval.start;
                const end = interval.end;
                const startMinute = minuteOfDay(start);
                const endMinute = minuteOfDay(end);
                const left = (startMinute / (24 * 60)) * 100;
                const width = ((endMinute - startMinute) / (24 * 60)) * 100;
                const durationMinutes = Math.round((end - start) / 60000);
                 const label = eventLabel(event, eventTypes);
                 const type = eventTypes.find((item) => item.key === event.kind);
                const details = eventPeriod(event, interval);
                return (
                  <Button key={`${event.id}-${segment}`} variant="calendarEvent" onClick={() => onOpenEvent(event)} className={`absolute z-10 flex min-w-0 flex-col items-start justify-center overflow-hidden rounded-md px-1 py-0.5 text-left text-[11px] leading-[1.15] ${eventClass(event, type)}`} style={{ left: `${left}%`, width: `${width}%`, top: 3 + lane * LANE_H, height: LANE_H - 5 }} title={`${label} · ${details}`}>
                    <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap font-semibold">{label}</span>
                    {durationMinutes >= 75 && <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap opacity-90">{details}</span>}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekGrid({ days, vehicles, eventsOf, eventTypes, onOpenEvent, onEmptyCell, onDayDetail }: GridProps & { days: Date[]; onDayDetail: (vehicleId: string, day: Date) => void }) {
  const template = `${PLATE_W}px repeat(7, minmax(112px, 1fr))`;
  return (
    <div className="w-full min-w-[916px]">
      <div className="sticky top-0 z-30 grid bg-surface-2" style={{ gridTemplateColumns: template }}>
        <div className="sticky left-0 z-40 border-r border-b border-border bg-surface-2 px-2 py-2 text-xs font-semibold uppercase text-muted-foreground">Matrícula</div>
        {days.map((day) => <div key={day.toISOString()} className="border-r border-b border-border py-2 text-center text-[11px] capitalize text-muted-foreground">{format(day, "EEE d", { locale: pt })}</div>)}
      </div>
      {vehicles.map((vehicle) => {
        const rowHeight = Math.max(BASE_ROW_H, ...days.map((day) => {
           const count = visibleEventsOnDay(eventsOf(vehicle.id, day), day, eventTypes).length;
          return Math.min(count, 2) * 34 + (count > 2 ? 18 : 0) + 4;
        }));
        return (
          <div key={vehicle.id} className="grid" style={{ gridTemplateColumns: template }}>
            <PlateCell vehicle={vehicle} height={rowHeight} />
            {days.map((day) => {
               const items = visibleEventsOnDay(eventsOf(vehicle.id, day), day, eventTypes);
              const shown = items.slice(0, 2);
              const extra = items.length - shown.length;
              return (
                <div key={day.toISOString()} className="min-w-0 space-y-1 border-r border-b border-border p-0.5" style={{ height: rowHeight }}>
                  {items.length === 0 ? (
                    <Button variant="ghost" className="h-full w-full rounded-sm p-0" aria-label={`Novo registo ${vehicle.plate} em ${format(day, "dd/MM/yyyy")}`} onClick={() => onEmptyCell(vehicle.id, startOfDay(day), "week")} />
                  ) : (
                    <>
                       {shown.map(({ event, interval, segment }) => {
                         const label = eventLabel(event, eventTypes);
                         const type = eventTypes.find((item) => item.key === event.kind);
                         const details = eventPeriod(event, interval);
                         return (
                            <Button key={`${event.id}-${segment}`} variant="calendarEvent" onClick={() => onOpenEvent(event)} className={`flex h-[30px] w-full min-w-0 flex-col items-start justify-center overflow-hidden rounded-sm px-1 py-0.5 text-left text-[10px] leading-[1.1] ${eventClass(event, type)}`} title={`${label} · ${details}`}>
                             <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap font-semibold">{label}</span>
                             <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap opacity-90">{details}</span>
                           </Button>
                         );
                       })}
                       {extra > 0 && <Button variant="link" className="h-4 px-1 text-[10px]" onClick={() => onDayDetail(vehicle.id, startOfDay(day))}>+{extra}</Button>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({ days, vehicles, eventsOf, onEmptyCell, eventTypes }: Omit<GridProps, "onOpenEvent"> & { days: Date[] }) {
  const template = `${PLATE_W}px repeat(${days.length}, minmax(24px, 1fr))`;
  return (
    <TooltipProvider delayDuration={120}>
      <div className="w-full" style={{ minWidth: PLATE_W + days.length * 24 }}>
        <div className="sticky top-0 z-30 grid bg-surface-2" style={{ gridTemplateColumns: template }}>
          <div className="sticky left-0 z-40 border-r border-b border-border bg-surface-2 px-2 py-2 text-xs font-semibold uppercase text-muted-foreground">Matrícula</div>
          {days.map((day) => <div key={day.toISOString()} className="border-r border-b border-border py-2 text-center text-[10px] text-muted-foreground">{format(day, "d")}</div>)}
        </div>
        {vehicles.map((vehicle) => (
          <div key={vehicle.id} className="grid" style={{ gridTemplateColumns: template }}>
            <PlateCell vehicle={vehicle} height={32} />
            {days.map((day) => {
              const items = eventsOf(vehicle.id, day);
              const dayStart = startOfDay(day);
               const visible = visibleEventsOnDay(items, dayStart, eventTypes);
               const allocMin = visible.filter(({ event }) => event.kind === "allocation").reduce((sum, { interval }) => sum + Math.round((interval.end - interval.start) / 60000), 0);
               const inspMin = visible.filter(({ event }) => event.kind === "inspection").reduce((sum, { interval }) => sum + Math.round((interval.end - interval.start) / 60000), 0);
               const total = mergeLoanIntervals(visible.map(({ interval }) => interval)).reduce((sum, interval) => sum + Math.round((interval.end - interval.start) / 60000), 0);
               const intensity = total === 0 ? "bg-card" : total < 240 ? "bg-blue-pale" : total < 720 ? "bg-blue-light" : total < 1080 ? "bg-blue-support" : "bg-blue-viz";
              return (
                <Tooltip key={day.toISOString()}>
                  <TooltipTrigger asChild>
                    <Button variant="calendarEvent" className={`h-8 min-w-0 rounded-none border-r border-b border-border p-0 hover:outline hover:outline-1 hover:outline-primary ${intensity} ${isSameDay(day, new Date()) ? "ring-1 ring-inset ring-primary/40" : ""}`} aria-label={`${vehicle.plate} ${format(day, "dd/MM/yyyy")} — ${formatDuration(total)} ocupada`} onClick={() => onEmptyCell(vehicle.id, dayStart, "month")} />
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    <p className="font-semibold">{vehicle.plate}</p><p>{format(day, "dd/MM/yyyy")}</p>
                    <p>Ocupação total: {formatDuration(total)}</p><p>Alocações: {formatDuration(allocMin)}</p><p>Inspeção: {formatDuration(inspMin)}</p>
                    <p>{items.filter((event) => event.kind === "allocation").length} alocações · {items.filter((event) => event.kind === "inspection").length} inspeções</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}