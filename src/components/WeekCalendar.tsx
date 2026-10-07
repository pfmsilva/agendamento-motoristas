import { occupiedIntervals, useScheduleReleases, type ScheduleRelease } from "@/lib/schedule-releases";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/lib/auth";
import { useActivityNoteIds, useAdministratorNames, useCities, useEventTags } from "@/lib/data";
import { MessageSquareText } from "lucide-react";
import type { Activity, Driver, DriverDataset } from "@/lib/scheduling";
import {
  releasedActivitySegments,
  dateOverlapsRange,
  effectiveEnd,
  effectiveStart,
  fmtTime,
  initials,
  overlaps,
  driverColorVar,
  unavailableStyle,
  vacationStyle,
  garageStyle,
  isGarage,
  EVENT_TAG,
  SEGMENT_LABEL,
  segmentStyle,
  PENDING_DRIVER_ID,
  PENDING_DRIVER_LABEL,
  TIMEOFF_TYPE_LABEL,
} from "@/lib/scheduling";

/** Faixa do calendário a que o serviço pertence: o motorista, ou a faixa virtual "por atribuir". */
const EMPTY_RELEASES: ScheduleRelease[] = [];
const laneId = (a: Activity) => a.driver_id ?? PENDING_DRIVER_ID;
const laneColor = (a: Activity, drivers: Driver[]) =>
  a.driver_id ? driverColorVar(a.driver_id, drivers) : "var(--pending-lane)";

export type CalendarView = "day" | "workweek" | "week" | "month";

/** Linha de férias/ausência tal como vem do conjunto de dados do calendário. */
export type TimeOffRow = DriverDataset["timeOff"][number];

/** O calendário abre posicionado nesta hora; as 24 horas ficam sempre acessíveis. */
const INITIAL_SCROLL_HOUR = 8;
const HOUR_PX = 48;
const SNAP_MIN = 15;
const DAY_HEADER_HEIGHT = 64;
const ALL_DAY_CARD_HEIGHT = 22;
const ALL_DAY_GAP = 4;

type Props = {
  drivers: Driver[];
  data: DriverDataset;
  view: CalendarView;
  anchor: Date;
  onSlotClick?: ((driverId: string, start: Date) => void) | undefined;
  onActivityClick?: ((activity: Activity) => void) | undefined;
  /** clicar num bloco de férias/ausência abre o mesmo evento para edição */
  onTimeOffClick?: ((timeOff: TimeOffRow) => void) | undefined;
  /** month view: clicking a +N indicator opens the full week containing that day */
  onExpandDay?: ((date: Date) => void) | undefined;
  /** when set, occupation blocks can be resized by dragging their edges */
  onAdjustRange?: ((activity: Activity, start: Date, end: Date) => void) | undefined;
  /** limita quais atividades podem ser redimensionadas (por omissão, todas) */
  canAdjust?: ((activity: Activity) => boolean) | undefined;
  /** driver whose calendar is shown; when several drivers are passed, initials are rendered */
  activeDriverId?: string | undefined;
};

/** Abaixo desta largura a etiqueta longa não cabe: usa-se a versão curta e as linhas empilham. */
const NARROW_CARD_PX = 88;

type CalendarEventCardProps = {
  tag: string;
  /** etiqueta alternativa, mais curta, usada quando o bloco é estreito */
  narrowTag?: string | undefined;
  title: string;
  administrator?: string | undefined;
  meta?: string | undefined;
  /** partes da linha operacional: juntas numa linha se couber, empilhadas se não */
  metaParts?: string[] | undefined;
  /** Segunda linha: local do serviço/evento (visível para todos os perfis). */
  subMeta?: string | undefined;
  showSubMeta?: boolean | undefined;
  style?: CSSProperties | undefined;
  contentStyle?: CSSProperties | undefined;
  className?: string | undefined;
  titleText?: string | undefined;
  dark?: boolean | undefined;
  compact?: boolean | undefined;
  showTitle?: boolean | undefined;
  showMeta?: boolean | undefined;
  hasNote?: boolean | undefined;
  backdrop?: ReactNode;
  onClick?: (() => void) | undefined;
  children?: ReactNode;
};


/** One structural language for every event; colour and pattern remain variant-specific. */
function CalendarEventCard({
  tag,
  narrowTag,
  title,
  administrator,
  meta,
  metaParts,
  subMeta,
  showSubMeta = true,

  style,
  contentStyle,
  className = "",
  titleText,
  dark = false,
  compact = false,
  showTitle = true,
  showMeta = true,
  hasNote = false,
  backdrop,
  onClick,
  children,
}: CalendarEventCardProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setNarrow(w > 0 && w < NARROW_CARD_PX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visibleTag = narrow && narrowTag ? narrowTag : tag;
  /** Sem reticências: em blocos estreitos as partes empilham em linhas próprias. */
  const lines = metaParts?.filter(Boolean) ?? (meta ? [meta] : []);
  const metaLines = narrow ? lines : lines.length > 0 ? [lines.join(" · ")] : [];

  const shared = `overflow-hidden rounded-md border text-left ${onClick ? "cursor-pointer" : "pointer-events-none"} ${className}`;
  const content = (
    <>
      {backdrop}
      <div
        className={`relative z-10 min-w-0 overflow-hidden ${compact ? "flex items-center gap-1 px-1" : "flex flex-col items-start gap-0.5 px-1.5 py-1"}`}
        style={contentStyle}
      >
        <span className="flex min-w-0 max-w-full shrink-0 items-center gap-1">
          <span
            className={`inline-flex h-3.5 min-w-0 max-w-full items-center truncate rounded-sm border border-current px-1 text-[8px] font-semibold uppercase leading-none ${
              dark ? "border-surface/70 bg-surface/15 text-surface" : "bg-surface/65"
            }`}
          >
            {visibleTag}
          </span>
          {hasNote && (
            <span
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-primary/40 bg-surface text-primary shadow-sm"
              title="Tem uma nota"
              aria-label="Tem uma nota"
            >
              <MessageSquareText className="size-2.5" aria-hidden />
            </span>
          )}
        </span>
        {showTitle && (
          <span
            className={`${compact ? "min-w-0 flex-1 truncate" : "min-w-0 max-w-full whitespace-normal break-words"} text-[11px] font-semibold leading-tight ${
              dark ? "text-surface drop-shadow-sm" : ""
            }`}
          >
            {title}
          </span>
        )}
        {administrator && (
          <span className={`min-w-0 max-w-full whitespace-normal break-words text-[9px] font-medium leading-tight ${dark ? "text-surface/90 drop-shadow-sm" : "opacity-75"}`}>
            {administrator}
          </span>
        )}
        {showMeta &&
          !compact &&
          metaLines.map((line, i) => (
            <span
              key={i}
              className={`min-w-0 max-w-full whitespace-normal break-words text-[9px] font-medium leading-tight ${dark ? "text-surface/90 drop-shadow-sm" : "opacity-75"}`}
            >
              {line}
            </span>
          ))}
        {showSubMeta && subMeta && !compact && (
          <span
            className={`min-w-0 max-w-full whitespace-normal break-words text-[9px] font-medium leading-tight ${dark ? "text-surface/80 drop-shadow-sm" : "opacity-70"}`}
          >
            {subMeta}
          </span>
        )}

      </div>
      {children}
    </>
  );

  if (onClick) {
    return (
      <button
        ref={(el) => {
          rootRef.current = el;
        }}
        type="button"
        onClick={onClick}
        style={style}
        className={shared}
        title={titleText}
      >
        {content}
      </button>
    );
  }
  return (
    <div
      ref={(el) => {
        rootRef.current = el;
      }}
      style={style}
      className={shared}
      title={titleText}
    >
      {content}
    </div>
  );
}


export function rangeFor(view: CalendarView, anchor: Date) {
  if (view === "day") return { from: startOfDay(anchor), to: addDays(startOfDay(anchor), 1) };
  if (view === "workweek") {
    const from = startOfWeek(anchor, { weekStartsOn: 1 });
    return { from, to: endOfDay(addDays(from, 4)) }; // segunda → sexta
  }
  if (view === "week")
    return {
      from: startOfWeek(anchor, { weekStartsOn: 1 }),
      to: endOfWeek(anchor, { weekStartsOn: 1 }),
    };
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
}

export function daysFor(view: CalendarView, anchor: Date) {
  if (view === "day") return [startOfDay(anchor)];
  if (view === "workweek") {
    const s = startOfWeek(anchor, { weekStartsOn: 1 });
    return Array.from({ length: 5 }, (_, i) => addDays(s, i));
  }
  if (view === "week") {
    const s = startOfWeek(anchor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }
  const s = startOfMonth(anchor);
  const e = endOfMonth(anchor);
  return Array.from({ length: e.getDate() }, (_, i) => addDays(s, i));
}

/**
 * Time grid: hours are always the vertical axis on the left, days are the
 * horizontal axis on top. Header and body share one CSS grid, so columns can
 * never drift, and both the hour labels and the day columns are laid out from
 * the same HOUR_PX row height, so labels always sit on their grid line.
 */
export function WeekCalendar({ drivers, data, view, anchor, onSlotClick, onActivityClick, onTimeOffClick, onExpandDay, onAdjustRange, canAdjust }: Props) {
  const days = useMemo(() => daysFor(view, anchor), [view, anchor]);
  const driverIds = useMemo(() => new Set(drivers.map((d) => d.id)), [drivers]);
  const multi = drivers.length > 1;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  const visibleTimeOff = useVisibleTimeOff(data.timeOff);
  const eventTagNames = useEventTagNames();
  const { data: noteActivityIds = [] } = useActivityNoteIds();
  const noteActivityIdSet = useMemo(() => new Set(noteActivityIds), [noteActivityIds]);
  const { data: releases = EMPTY_RELEASES } = useScheduleReleases();
  const lookups = useCardLookups();
  const stableActivityClick = useStableCallback(onActivityClick);
  const stableAdjustRange = useStableCallback(onAdjustRange);
  const stableCanAdjust = useStableCallback(canAdjust);

  /**
   * A grelha cobre sempre as 24 horas do dia (00:00–24:00), sem adicionar nem
   * remover horas conforme os eventos. Apenas a posição inicial de scroll é
   * controlada: o calendário abre junto das 08:00, ficando possível percorrer
   * todo o dia para cima e para baixo.
   */
  const startHour = 0;
  const endHour = 24;

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const bodyHeight = hours.length * HOUR_PX;


  const dayPlans = useMemo(() => {
    return days.map((day) => {
      const from = startOfDay(day);
      const to = addDays(from, 1);
      const acts = data.activities.filter(
        (a) =>
          driverIds.has(laneId(a)) &&
          a.status !== "cancelled" &&
          overlaps(effectiveStart(a), effectiveEnd(a), from, to),
      );
      const leave = visibleTimeOff.filter(
        (t) =>
          driverIds.has(t.driver_id) &&
          t.status === "approved" &&
          dateOverlapsRange(t.start_date, t.end_date, from, to),
      );
      const unav = data.unavailability.filter(
        (u) =>
          driverIds.has(u.driver_id) &&
          u.status === "active" &&
          overlaps(u.start_datetime, u.end_datetime, from, to),
      );
      const layout = layoutActivities(acts, releases);
      return { day, from, to, leave, unav, layout };
    });
  }, [days, data.activities, visibleTimeOff, data.unavailability, driverIds, releases]);

  const maxAllDayEvents = Math.max(0, ...dayPlans.map((plan) => plan.leave.length));
  const allDayHeight = Math.max(
    ALL_DAY_CARD_HEIGHT + ALL_DAY_GAP * 2,
    maxAllDayEvents * (ALL_DAY_CARD_HEIGHT + ALL_DAY_GAP) + ALL_DAY_GAP,
  );

  // Posição inicial: abre junto das 08:00, com cabeçalhos e eventos de dia inteiro fixos acima.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(
      0,
      DAY_HEADER_HEIGHT + allDayHeight + (INITIAL_SCROLL_HOUR - startHour) * HOUR_PX - HOUR_PX,
    );
  }, [allDayHeight, startHour, view, anchor]);

  if (view === "month") {
    return (
      <MonthGrid
        drivers={drivers}
        data={data}
        anchor={anchor}
        onSlotClick={onSlotClick}
        onActivityClick={onActivityClick}
        onTimeOffClick={onTimeOffClick}
        onExpandDay={onExpandDay}
        noteActivityIds={noteActivityIdSet}
      />
    );
  }

  const globalMaxLanes = Math.max(1, ...dayPlans.map((p) => p.layout.maxLanes));
  // Em ecrãs pequenos as colunas e o eixo das horas encolhem, para caber mais dia por ecrã
  // sem tornar o texto ilegível; o deslize horizontal fica dentro do calendário.
  const dayMinRem = isMobile
    ? Math.min(16, Math.max(7, globalMaxLanes * 4))
    : Math.min(28, Math.max(8, globalMaxLanes * 5));
  const cols = `${isMobile ? "3.25rem" : "4.5rem"} repeat(${days.length}, minmax(${dayMinRem}rem, 1fr))`;

  return (
    <div className="panel overflow-hidden">
      <div ref={scrollRef} className="max-h-[70dvh] overflow-auto overscroll-contain sm:max-h-[620px]">

        <div className="grid min-w-max" style={{ gridTemplateColumns: cols }}>
          {/* ── header row: empty corner + day columns ── */}
          <div className="sticky left-0 top-0 z-50 h-16 border-b border-r-2 border-grid-divider bg-surface" />
          {days.map((d, i) => {
            const today = isSameDay(d, new Date());
            return (
              <div
                key={d.toISOString()}
                className={`sticky top-0 z-40 h-16 border-b border-r-2 border-grid-divider bg-surface px-2 py-2 text-center last:border-r-0 ${
                  today ? "bg-blue-pale" : ""
                }`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {d.toLocaleDateString("pt-PT", { weekday: "short" }).replace(".", "")}
                </p>
                <p
                  className={`mx-auto mt-1 flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
                    today ? "bg-primary text-primary-foreground" : "text-foreground"
                  }`}
                >
                  {d.getDate()}
                </p>
              </div>
            );
          })}

          {/* Barras de dia inteiro ficam fixas sob os cabeçalhos; célula do eixo sem rótulo. */}
          <div
            className="sticky left-0 z-50 border-b border-r-2 border-grid-divider bg-surface"
            style={{ height: allDayHeight, top: DAY_HEADER_HEIGHT }}
          />
          {dayPlans.map(({ day, leave }, dayIdx) => (
            <div
              key={`all-day-${day.toISOString()}`}
              className="sticky z-30 border-b border-r-2 border-grid-divider bg-surface last:border-r-0"
              style={{ height: allDayHeight, top: DAY_HEADER_HEIGHT }}
            >
              {leave.map((t, eventIdx) => {
                const driver = drivers.find((d) => d.id === t.driver_id);
                const color = driverColorVar(t.driver_id, drivers);
                const leaveTag = t.tag_id ? eventTagNames[t.tag_id] || EVENT_TAG.vacation : EVENT_TAG.vacation;
                const title = t.reason || TIMEOFF_TYPE_LABEL[t.type] || leaveTag;
                const continuesBefore = dayIdx > 0 && dateOverlapsRange(t.start_date, t.end_date, days[dayIdx - 1] ?? day, day);
                const nextDay = days[dayIdx + 1];
                const continuesAfter = Boolean(
                  nextDay && dateOverlapsRange(t.start_date, t.end_date, nextDay, addDays(nextDay, 1)),
                );

                return (
                  <CalendarEventCard
                    key={t.id}
                    compact
                    style={{
                      top: ALL_DAY_GAP + eventIdx * (ALL_DAY_CARD_HEIGHT + ALL_DAY_GAP),
                      height: ALL_DAY_CARD_HEIGHT,
                      ...vacationStyle(color),
                      left: continuesBefore ? 0 : 4,
                      right: continuesAfter ? 0 : 4,
                    }}
                    className={`absolute ${continuesBefore ? "rounded-l-none border-l-0" : ""} ${continuesAfter ? "rounded-r-none border-r-0" : ""}`}
                    tag={leaveTag}
                    title={driver ? driver.name : title}
                    titleText={`${leaveTag}${driver ? ` · ${driver.name}` : ""}${t.reason ? ` · ${t.reason}` : ""}`}
                    {...(onTimeOffClick ? { onClick: () => onTimeOffClick(t) } : {})}
                  />
                );
              })}
            </div>
          ))}

          {/* ── hours axis (left) ── */}
          <div className="sticky left-0 z-30 border-r border-border bg-surface" style={{ height: bodyHeight }}>
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR_PX }} className="relative">
                <span
                  className={`absolute right-2 top-0 bg-surface pl-1 text-[11px] font-medium leading-none tabular-nums text-muted-foreground ${
                    h === startHour ? "translate-y-1/2" : "-translate-y-1/2"
                  }`}
                >
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>


          {/* ── day columns ── */}
          {dayPlans.map(({ day, from, unav, layout }) => {
            return (
              <div
                key={day.toISOString()}
                className="relative z-0 border-r-2 border-grid-divider last:border-r-0 bg-surface"
                style={{ height: bodyHeight }}
              >
                {hours.map((h) => {
                  const slot = new Date(from);
                  slot.setHours(h, 0, 0, 0);
                  return (
                    <button
                      key={h}
                      type="button"
                      style={{ height: HOUR_PX }}
                      onClick={() => onSlotClick?.(drivers[0]?.id ?? "", slot)}
                      className="block w-full border-t border-border/70 transition-colors first:border-t-0 hover:bg-primary/5"
                      aria-label={`Selecionar ${slot.toLocaleString("pt-PT")}`}
                    />
                  );
                })}

                {unav.map((u) => {
                  const driver = drivers.find((d) => d.id === u.driver_id);
                  return (
                    <CalendarEventCard
                      key={u.id}
                      style={{
                        ...blockStyle(new Date(u.start_datetime), new Date(u.end_datetime), from, startHour),
                        ...unavailableStyle(driverColorVar(u.driver_id, drivers)),
                      }}
                      className="absolute inset-x-1"
                      tag={EVENT_TAG.personal}
                      title={u.reason || EVENT_TAG.personal}
                      meta={`${fmtTime(u.start_datetime)}–${fmtTime(u.end_datetime)}${driver ? ` · ${driver.name}` : ""}`}
                      showTitle={blockStyle(new Date(u.start_datetime), new Date(u.end_datetime), from, startHour).height >= 28}
                      showMeta={blockStyle(new Date(u.start_datetime), new Date(u.end_datetime), from, startHour).height >= 43}
                      titleText={`${EVENT_TAG.personal}${driver ? ` · ${driver.name}` : ""}${u.reason ? ` · ${u.reason}` : ""}`}
                    />
                  );
                })}

                {layout.items.map(({ activity: a, leftPct, widthPct }) => (
                  <ActivityBlock
                    key={a.id}
                    activity={a}
                    dayStart={from}
                    startHour={startHour}
                    leftPct={leftPct}
                    widthPct={widthPct}
                    driverName={a.driver_id ? (drivers.find((d) => d.id === a.driver_id)?.name ?? "") : ""}
                    color={laneColor(a, drivers)}
                    onClick={stableActivityClick}
                    onAdjustRange={stableAdjustRange}
                    canAdjust={stableCanAdjust}
                    hasNote={noteActivityIdSet.has(a.id)}
                    releases={releases}
                    lookups={lookups}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <OccupationLegend drivers={drivers} />
    </div>
  );
}

function blockStyle(start: Date, end: Date, dayStart: Date, startHour: number) {
  const dayEnd = addDays(dayStart, 1);
  const s = start < dayStart ? dayStart : start;
  const e = end > dayEnd ? dayEnd : end;
  const top = (hoursOf(s, dayStart) - startHour) * HOUR_PX;
  const height = Math.max((hoursOf(e, dayStart) - hoursOf(s, dayStart)) * HOUR_PX, 14);
  return { top: Math.max(top, 0), height };
}

function hoursOf(d: Date, dayStart: Date) {
  const diff = (d.getTime() - dayStart.getTime()) / 3600000;
  return Math.min(Math.max(diff, 0), 24);
}

/**
 * Side-by-side layout (Google-Calendar style). Two activities only share the
 * width when their OCCUPIED time actually overlaps (freed intervals excluded).
 * Activities that never overlap anything keep the full day-column width.
 */
function layoutActivities(acts: Activity[], releases: ScheduleRelease[]) {
  const items = acts
    .map((a) => ({ a, iv: occupiedIntervals(releases, a, effectiveStart(a), effectiveEnd(a)).map((i) => [i.start.getTime(), i.end.getTime()] as const) }))
    .sort((x, y) => (x.iv[0]?.[0] ?? 0) - (y.iv[0]?.[0] ?? 0));
  const hit = (p: typeof items[number], q: typeof items[number]) =>
    p.iv.some(([s1, e1]) => q.iv.some(([s2, e2]) => s1 < e2 && s2 < e1));

  // Clusters = connected components of the real-overlap graph.
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) if (hit(items[i]!, items[j]!)) parent[find(i)] = find(j);
  const clusters = new Map<number, number[]>();
  items.forEach((_, i) => clusters.set(find(i), [...(clusters.get(find(i)) ?? []), i]));

  const out = new Map<string, { leftPct: number; widthPct: number }>();
  let maxLanes = 1;
  for (const members of clusters.values()) {
    const lanes: number[][] = [];
    const laneOf = new Map<number, number>();
    for (const i of members) {
      let l = lanes.findIndex((lane) => !lane.some((j) => hit(items[i]!, items[j]!)));
      if (l === -1) { l = lanes.length; lanes.push([]); }
      lanes[l]!.push(i);
      laneOf.set(i, l);
    }
    maxLanes = Math.max(maxLanes, lanes.length);
    const w = 100 / lanes.length;
    for (const i of members) {
      const l = laneOf.get(i)!;
      let span = 1;
      for (let k = l + 1; k < lanes.length && !lanes[k]!.some((j) => hit(items[i]!, items[j]!)); k++) span++;
      out.set(items[i]!.a.id, { leftPct: l * w, widthPct: span * w });
    }
  }

  return {
    maxLanes,
    items: items.map(({ a }) => ({ activity: a, leftPct: out.get(a.id)?.leftPct ?? 0, widthPct: out.get(a.id)?.widthPct ?? 100 })),
  };
}

/**
 * Férias no calendário: apenas Proprietário e Gestor veem as dos motoristas.
 * Assistente, Administrador não veem nenhuma e o Motorista vê apenas as suas.
 * A disponibilidade continua a ser calculada com todos os registos - isto é só
 * visibilidade.
 */
function useVisibleTimeOff(timeOff: DriverDataset["timeOff"]) {
  const { user } = useAuth();
  const role = user?.role;
  const myDriverId = user?.driverId ?? null;
  return useMemo(() => {
    if (role === "assistant" || role === "administrator") return [];
    if (role === "driver") return timeOff.filter((t) => t.driver_id === myDriverId);
    return timeOff;
  }, [timeOff, role, myDriverId]);
}

/** Gestor e Proprietário veem apenas a etiqueta genérica "Administração" nos cartões de serviço. */
function useGenericAdminLabel() {
  const { user } = useAuth();
  return user?.role === "owner" || user?.role === "manager";
}

/** Mapa id → nome de cidade para mostrar o local nos cartões. */
function useCityNames() {
  const { data: cities = [] } = useCities();
  return useMemo(() => Object.fromEntries(cities.map((c) => [c.id, c.name])), [cities]);
}

function useEventTagNames() {
  const { data: tags = [] } = useEventTags();
  return useMemo(() => Object.fromEntries(tags.map((tag) => [tag.id, tag.label])), [tags]);
}

function useAdminTagId() {
  const { data: tags = [] } = useEventTags();
  return tags.find((tag) => tag.system_key === "admin")?.id ?? null;
}

type CardLookups = {
  adminNames: Record<string, string>;
  cityNames: Record<string, string>;
  eventTagNames: Record<string, string>;
  adminTagId: string | null;
  genericAdminLabel: boolean;
  driverCalendar: boolean;
};

function useCardLookups(): CardLookups {
  const adminNames = useAdministratorNames();
  const cityNames = useCityNames();
  const eventTagNames = useEventTagNames();
  const adminTagId = useAdminTagId();
  const genericAdminLabel = useGenericAdminLabel();
  const { user } = useAuth();
  const driverCalendar = user?.role === "driver";
  return useMemo(
    () => ({ adminNames, cityNames, eventTagNames, adminTagId, genericAdminLabel, driverCalendar }),
    [adminNames, cityNames, eventTagNames, adminTagId, genericAdminLabel, driverCalendar],
  );
}

/** Callback com identidade estável que chama sempre a versão mais recente (evita re-render dos cartões). */
function useStableCallback<T extends (...args: never[]) => unknown>(fn: T | undefined): T | undefined {
  const ref = useRef(fn);
  ref.current = fn;
  const stable = useCallback((...args: Parameters<T>) => ref.current?.(...args), []) as unknown as T;
  return fn ? stable : undefined;
}

const ActivityBlock = memo(function ActivityBlock({
  activity,
  dayStart,
  startHour,
  leftPct,
  widthPct,
  driverName,
  color,
  onClick,
  onAdjustRange,
  canAdjust,
  hasNote,
  releases,
  lookups,
}: {
  activity: Activity;
  dayStart: Date;
  startHour: number;
  leftPct: number;
  widthPct: number;
  driverName: string;
  color: string;
  onClick?: ((a: Activity) => void) | undefined;
  onAdjustRange?: ((a: Activity, start: Date, end: Date) => void) | undefined;
  canAdjust?: ((a: Activity) => boolean) | undefined;
  hasNote: boolean;
  releases: ScheduleRelease[];
  lookups: CardLookups;
}) {
  const baseS = effectiveStart(activity);
  const baseE = effectiveEnd(activity);
  const svcS = new Date(activity.start_datetime);
  const svcE = new Date(activity.end_datetime);
  const [drag, setDrag] = useState<{ edge: "start" | "end"; minutes: number } | null>(null);
  const dragRef = useRef<{ edge: "start" | "end"; y0: number } | null>(null);
  /** set on pointerup after a real drag so the synthetic click doesn't also fire */
  const justDragged = useRef(false);



  const effS = drag?.edge === "start" ? new Date(baseS.getTime() + drag.minutes * 60000) : baseS;
  const effE = drag?.edge === "end" ? new Date(baseE.getTime() + drag.minutes * 60000) : baseE;

  const box = blockStyle(effS, effE, dayStart, startHour);
  const totalMs = effE.getTime() - effS.getTime();
  const segments = drag
    ? previewSegments(activity, effS, effE, releases)
    : releasedActivitySegments(activity, releases);

  const positioned = segments.map((s) => ({
    ...s,
    share: totalMs > 0 ? ((s.end.getTime() - s.start.getTime()) / totalMs) * 100 : 100,
    top: totalMs > 0 ? ((s.start.getTime() - effS.getTime()) / totalMs) * 100 : 0,
  }));
  /** Troços contíguos que restam depois das libertações: cada um é parte do mesmo serviço. */
  const occupiedGroups: { start: Date; end: Date; segments: typeof positioned }[] = [];
  for (const s of [...positioned].sort((l, r) => l.top - r.top)) {
    const last = occupiedGroups[occupiedGroups.length - 1];
    if (last && last.end.getTime() === s.start.getTime()) {
      last.end = s.end;
      last.segments.push(s);
    } else occupiedGroups.push({ start: s.start, end: s.end, segments: [s] });
  }

  const width = `calc(${widthPct}% - 4px)`;
  const left = `calc(${leftPct}% + 2px)`;
  const resizable = Boolean(onAdjustRange) && (canAdjust?.(activity) ?? true);
  const garage = isGarage(activity);
  /** Mapas partilhados, calculados uma vez pelo calendário (não por cartão). */
  const { adminNames, cityNames, eventTagNames, adminTagId, genericAdminLabel, driverCalendar } = lookups;
  /** O mesmo motorista trabalha para vários Administradores: identificar sempre a quem pertence. */
  const adminName =
    !genericAdminLabel && activity.administrator_id ? adminNames[activity.administrator_id] : undefined;
  const serviceAdministrator = driverCalendar && activity.event_kind === "administration" ? adminName : undefined;
  /** Gestor e Proprietário: blocos de Administração mostram só etiqueta, horas, motorista e local. */
  const privateAdminBlock = genericAdminLabel && activity.tag_id === adminTagId;
  const location = activity.city_id ? cityNames[activity.city_id] : activity.destination || undefined;

  function clampMinutes(edge: "start" | "end", raw: number) {
    const snapped = Math.round(raw / SNAP_MIN) * SNAP_MIN;
    if (edge === "start") {
      const maxForward = (svcS.getTime() - baseS.getTime()) / 60000; // cannot start after the service
      return Math.min(snapped, maxForward);
    }
    const minBackward = (svcE.getTime() - baseE.getTime()) / 60000; // cannot end before the service
    return Math.max(snapped, minBackward);
  }

  function startDrag(edge: "start" | "end", e: React.PointerEvent) {
    if (!onAdjustRange) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { edge, y0: e.clientY };
    setDrag({ edge, minutes: 0 });
    const move = (ev: PointerEvent) => {
      const ref = dragRef.current;
      if (!ref) return;
      const minutes = clampMinutes(ref.edge, ((ev.clientY - ref.y0) / HOUR_PX) * 60);
      setDrag({ edge: ref.edge, minutes });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const ref = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!ref) return;
      const minutes = clampMinutes(ref.edge, ((ev.clientY - ref.y0) / HOUR_PX) * 60);
      if (minutes === 0) return;
      justDragged.current = true;
      window.setTimeout(() => {
        justDragged.current = false;
      }, 400);
      const nextS = ref.edge === "start" ? new Date(baseS.getTime() + minutes * 60000) : baseS;
      const nextE = ref.edge === "end" ? new Date(baseE.getTime() + minutes * 60000) : baseE;
      onAdjustRange(activity, nextS, nextE);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const configuredTag = activity.tag_id ? eventTagNames[activity.tag_id] : undefined;
  const baseTag = configuredTag || (garage ? EVENT_TAG.garage : adminName || EVENT_TAG.administration);
  /** Eventos sujeitos a aprovação ficam identificados até haver decisão. */
  const pendingApproval = activity.approval_status === "pending";
  const eventTag = pendingApproval ? `${baseTag} · Pendente de aprovação` : baseTag;
  /** Blocos curtos: etiqueta abreviada em vez de reticências. */
  const narrowTag = pendingApproval
    ? "Pendente"
    : configuredTag || (garage ? EVENT_TAG.garage : adminName ? (adminName.split(" ")[0] ?? adminName) : "Admin");
  return (
    <>
      {occupiedGroups.map((group, groupIndex) => {
        const groupBox = blockStyle(group.start, group.end, dayStart, startHour);
        const groupMs = group.end.getTime() - group.start.getTime();
        const segmentTime = `${fmtTime(group.start)}–${fmtTime(group.end)}`;
        const cardStyle: CSSProperties = {
          ...groupBox,
          width,
          left,
          borderColor: drag
            ? undefined
            : garage
              ? color
              : `color-mix(in srgb, ${color} 70%, transparent)`,
        };
        return (
          <CalendarEventCard
            key={`${activity.id}-${group.start.toISOString()}-${group.end.toISOString()}`}
            onClick={() => {
              if (drag || justDragged.current) return;
              onClick?.(activity);
            }}
            style={cardStyle}
            className={`group absolute ${drag ? "border-primary ring-2 ring-primary/30" : ""} ${pendingApproval ? "border-dashed" : ""}`}
            titleText={
              privateAdminBlock
                ? `${eventTag} · ${segmentTime} · ${driverName || PENDING_DRIVER_LABEL}${location ? ` · ${location}` : ""}`
                : `${eventTag} · ${activity.title}${serviceAdministrator ? ` · ${serviceAdministrator}` : ""} · ${segmentTime} · ${driverName || PENDING_DRIVER_LABEL}${location ? ` · ${location}` : ""}`
            }
            tag={eventTag}
            narrowTag={narrowTag}
            title={activity.title}
            administrator={serviceAdministrator}
            metaParts={serviceAdministrator ? [segmentTime] : [segmentTime, driverName || PENDING_DRIVER_LABEL]}
            subMeta={location}
            dark={!garage}
            compact={!serviceAdministrator && groupBox.height < 38}
            showTitle={!privateAdminBlock && groupBox.height >= 14}
            showMeta={groupBox.height >= 51}
            showSubMeta={groupBox.height >= 64}
            hasNote={hasNote}
            contentStyle={{ color: garage ? garageStyle(color).color : undefined }}
            backdrop={
              <div className="absolute inset-0">
                {group.segments.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      insetInline: 0,
                      top: `${groupMs > 0 ? ((s.start.getTime() - group.start.getTime()) / groupMs) * 100 : 0}%`,
                      height: `${groupMs > 0 ? ((s.end.getTime() - s.start.getTime()) / groupMs) * 100 : 100}%`,
                      ...(garage && s.kind === "service" ? garageStyle(color) : segmentStyle(s.kind, color)),
                    }}
                    aria-label={garage && s.kind === "service" ? EVENT_TAG.garage : SEGMENT_LABEL[s.kind]}
                  />
                ))}
              </div>
            }
          >
            {resizable && groupIndex === 0 && (
              <div
                onPointerDown={(e) => startDrag("start", e)}
                className="absolute inset-x-0 top-0 z-20 flex h-4 cursor-ns-resize touch-none items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                aria-label="Alargar início da ocupação"
              >
                <span className="h-0.5 w-6 rounded-full bg-surface/80" />
              </div>
            )}
            {resizable && groupIndex === occupiedGroups.length - 1 && (
              <div
                onPointerDown={(e) => startDrag("end", e)}
                className="absolute inset-x-0 bottom-0 z-20 flex h-4 cursor-ns-resize touch-none items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                aria-label="Alargar fim da ocupação"
              >
                <span className="h-0.5 w-6 rounded-full bg-surface/80" />
              </div>
            )}
          </CalendarEventCard>
        );
      })}
    </>
  );
});

/** Segments for a live drag preview, using a provisional occupation window. */
function previewSegments(a: Activity, effS: Date, effE: Date, releases: ScheduleRelease[]) {
  return releasedActivitySegments({
    ...a,
    driver_adjusted_start: effS.toISOString(),
    driver_adjusted_end: effE.toISOString(),
  }, releases);
}


function MonthGrid({
  drivers,
  data,
  anchor,
  onSlotClick,
  onActivityClick,
  onTimeOffClick,
  onExpandDay,
  noteActivityIds,
}: {
  drivers: Driver[];
  data: DriverDataset;
  anchor: Date;
  onSlotClick?: ((driverId: string, start: Date) => void) | undefined;
  onActivityClick?: ((a: Activity) => void) | undefined;
  onTimeOffClick?: ((t: TimeOffRow) => void) | undefined;
  onExpandDay?: ((date: Date) => void) | undefined;
  noteActivityIds: Set<string>;
}) {
  const adminNames = useAdministratorNames();
  const cityNames = useCityNames();
  const eventTagNames = useEventTagNames();
  const adminTagId = useAdminTagId();
  const genericAdminLabel = useGenericAdminLabel();
  const { user } = useAuth();
  const driverCalendar = user?.role === "driver";
  const visibleTimeOff = useVisibleTimeOff(data.timeOff);
  const first = startOfMonth(anchor);

  const gridStart = startOfWeek(first, { weekStartsOn: 1 });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const ids = new Set(drivers.map((d) => d.id));
  const multi = drivers.length > 1;

  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-7 border-b text-center text-[11px] uppercase tracking-wide text-muted-foreground">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
          <div
            key={d}
            className="border-r-2 border-grid-divider bg-surface px-2 py-2 last:border-r-0"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const from = startOfDay(d);
          const to = addDays(from, 1);
          const acts = data.activities.filter(
            (a) =>
              ids.has(laneId(a)) &&
              a.status !== "cancelled" &&
              overlaps(effectiveStart(a), effectiveEnd(a), from, to),
          );
          const leave = visibleTimeOff.filter(
            (t) => ids.has(t.driver_id) && t.status === "approved" && dateOverlapsRange(t.start_date, t.end_date, from, to),
          );
          const unav = data.unavailability.filter(
            (u) => ids.has(u.driver_id) && u.status === "active" && overlaps(u.start_datetime, u.end_datetime, from, to),
          );
          const entries = [
            ...acts.map((activity) => ({ kind: "activity" as const, activity })),
            ...leave.map((period) => ({ kind: "leave" as const, period })),
            ...unav.map((period) => ({ kind: "unavailability" as const, period })),
          ];
          const other = d.getMonth() !== anchor.getMonth();
          const slot = new Date(from);
          slot.setHours(9, 0, 0, 0);
          const colIdx = i % 7;
          return (
            <div
              key={d.toISOString()}
              className={`relative min-h-16 border-b sm:min-h-24 border-r-2 border-grid-divider bg-surface p-1 last:border-r-0 ${
                other ? "bg-surface-2/80 text-muted-foreground" : ""
              } ${isSameDay(d, new Date()) ? "ring-1 ring-inset ring-primary/30" : ""}`}
            >
              {/* Toda a área livre do dia abre o «Novo serviço» (mesmo fluxo do botão). */}
              {onSlotClick && (
                <button
                  type="button"
                  aria-label={`Novo evento em ${d.getDate()}`}
                  onClick={() => onSlotClick(drivers[0]?.id ?? "", slot)}
                  className="absolute inset-0 z-0 h-full w-full cursor-pointer"
                />
              )}
              <div className="pointer-events-none relative z-10 mb-1 block w-full text-left text-[11px] font-semibold">
                {d.getDate()}
              </div>
              <div className="pointer-events-none relative z-10 space-y-0.5 [&_button]:pointer-events-auto [&>*]:pointer-events-auto">

                {entries.slice(0, 3).map((entry) => {
                  if (entry.kind === "leave") {
                    const t = entry.period;
                    const driver = drivers.find((x) => x.id === t.driver_id);
                    const leaveTag = t.tag_id ? eventTagNames[t.tag_id] || EVENT_TAG.vacation : EVENT_TAG.vacation;
                    const title = t.reason || TIMEOFF_TYPE_LABEL[t.type] || leaveTag;
                    return (
                      <CalendarEventCard
                        key={`leave-${t.id}`}
                        compact
                        tag={leaveTag}
                        title={title}
                        showMeta={false}
                        titleText={`${leaveTag} · ${title}${driver ? ` · ${driver.name}` : ""}`}
                        style={vacationStyle(driverColorVar(t.driver_id, drivers))}
                        className="block w-full"
                        {...(onTimeOffClick ? { onClick: () => onTimeOffClick(t) } : {})}
                      />
                    );
                  }
                  if (entry.kind === "unavailability") {
                    const u = entry.period;
                    return (
                      <CalendarEventCard
                        key={`unavailability-${u.id}`}
                        compact
                        tag={EVENT_TAG.personal}
                        title={u.reason || `${fmtTime(u.start_datetime)}–${fmtTime(u.end_datetime)}`}
                        showMeta={false}
                        titleText={`${EVENT_TAG.personal}${u.reason ? ` · ${u.reason}` : ""}`}
                        style={unavailableStyle(driverColorVar(u.driver_id, drivers))}
                        className="block w-full"
                      />
                    );
                  }
                  const a = entry.activity;
                  const driver = drivers.find((x) => x.id === laneId(a));
                  const driverLabel = driver?.name || PENDING_DRIVER_LABEL;
                  const adminLabel =
                    !genericAdminLabel && a.administrator_id ? adminNames[a.administrator_id] : undefined;
                  const garage = isGarage(a);
                   const serviceAdministrator = driverCalendar && a.event_kind === "administration" ? adminLabel : undefined;
                  const configuredTag = a.tag_id ? eventTagNames[a.tag_id] : undefined;
                  const eventTag = configuredTag || (garage ? EVENT_TAG.garage : adminLabel || EVENT_TAG.administration);
                  const color = laneColor(a, drivers);
                  /** Gestor e Proprietário: blocos de Administração mostram só etiqueta, horas, motorista e local. */
                   const privateAdminBlock = genericAdminLabel && a.tag_id === adminTagId;
                  const location = a.city_id ? cityNames[a.city_id] : a.destination || undefined;
                  const compactTitle = privateAdminBlock
                    ? `${fmtTime(a.start_datetime)}${location ? ` · ${location}` : ""}`
                    : `${a.title} · ${fmtTime(a.start_datetime)}${location ? ` · ${location}` : ""}`;

                  return (
                    <CalendarEventCard
                      key={a.id}
                      onClick={() => onActivityClick?.(a)}
                      compact={!serviceAdministrator}
                      tag={eventTag}
                      title={compactTitle}
                      administrator={serviceAdministrator}
                      showMeta={false}
                      hasNote={noteActivityIds.has(a.id)}
                      dark={!garage}
                      titleText={
                        privateAdminBlock
                          ? `${eventTag} · ${fmtTime(a.start_datetime)}–${fmtTime(a.end_datetime)} · ${driverLabel}${location ? ` · ${location}` : ""}`
                          : `${adminLabel ? `${adminLabel} · ` : ""}${a.title} · ${fmtTime(a.start_datetime)}–${fmtTime(a.end_datetime)} · ${driverLabel}${location ? ` · ${location}` : ""}`
                      }
                      style={garage ? garageStyle(color) : { ...segmentStyle("service", color), borderColor: color }}
                      className="block w-full"
                    />
                  );
                })}
                {entries.length > 3 && (
                  <button
                    type="button"
                    onClick={() => onExpandDay?.(from)}
                    title="Ver a semana completa deste dia"
                    className="rounded px-1 text-[10px] font-medium text-primary hover:bg-muted hover:underline"
                  >
                    +{entries.length - 3}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <OccupationLegend drivers={drivers} />
    </div>
  );
}

/**
 * Legend. Driver swatches use the very same `driverColorVar` + `segmentStyle`
 * helpers as the calendar blocks, so a colour can never drift between the two.
 */
export function OccupationLegend({ drivers = [] }: { drivers?: Driver[] }) {
  return (
    <div className="space-y-2 border-t bg-surface-2 px-4 py-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={segmentStyle("service", "var(--driver-1)")} /> {EVENT_TAG.administration}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={segmentStyle("travel", "var(--driver-1)")} /> Deslocação calculada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={segmentStyle("adjust", "var(--driver-1)")} /> Ajuste do motorista
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border" style={garageStyle("var(--driver-1)")} /> {EVENT_TAG.garage}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border" style={vacationStyle("var(--driver-1)")} /> {EVENT_TAG.vacation}
        </span>
      </div>
      {drivers.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-2">
          {drivers.map((d) => (
            <span key={d.id} className="flex items-center gap-1.5">
              <span
                className="size-3 rounded-sm"
                style={segmentStyle(
                  "service",
                  d.id === PENDING_DRIVER_ID ? "var(--pending-lane)" : driverColorVar(d.id, drivers),
                )}
                aria-hidden
              />
              {d.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

