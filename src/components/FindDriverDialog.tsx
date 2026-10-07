import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateInput } from "@/components/DateInput";
import { TimeInput } from "@/components/TimeInput";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CityCombobox } from "@/components/CityCombobox";
import { useDriverMonthlyWorkedMinutes, useTravelRoutes } from "@/lib/data";
import { occupiedIntervals } from "@/lib/schedule-releases";
import {
  AVAILABILITY_CLASS,
  AVAILABILITY_LABEL,
  CONFLICT_LABEL,
  cityTravelKey,
  computeOccupation,
  routeLabel,
  effectiveEnd,
  effectiveStart,
  evaluateAvailability,
  fmtDate,
  fmtDateTime,
  fmtMinutes,
  fmtTime,
  TIMEOFF_TYPE_LABEL,
  type AvailabilityResult,
  type AvailabilityStatus,
  type City,
  type Driver,
  type DriverDataset,
} from "@/lib/scheduling";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onClosed?: () => void;
  drivers: Driver[];
  data: DriverDataset;
  cities: City[];
  onPick: (
    driverId: string,
    start: Date,
    end: Date,
    cityId: string | null,
    originCityId: string | null,
  ) => void;
};

const ORDER: Record<AvailabilityStatus, number> = { AVAILABLE: 0, CONDITIONAL: 1, UNAVAILABLE: 2 };
const NEARBY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Subtle text colour per conflict kind - warnings stay calm, no boxes. */
const CONFLICT_TEXT: Record<keyof typeof CONFLICT_LABEL, string> = {
  timeoff: "text-leave",
  unavailability: "text-unavailable",
  activity: "text-conflict",
  conditional: "text-warning",
};

type NearbyCommitment = {
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  genericAdministration?: boolean;
};

function formatPeriod(item: NearbyCommitment) {
  if (item.allDay) return `${fmtDate(item.start)} - ${fmtDate(item.end)}`;
  if (fmtDate(item.start) === fmtDate(item.end)) {
    return `${fmtDate(item.start)}, ${fmtTime(item.start)} - ${fmtTime(item.end)}`;
  }
  return `${fmtDateTime(item.start)} - ${fmtDateTime(item.end)}`;
}

function formatCommitment(item: NearbyCommitment) {
  const title = item.genericAdministration ? item.title : `“${item.title}”`;
  return `${title}, ${formatPeriod(item)}`;
}

function nearbyCommitments(driverId: string, from: Date, to: Date, data: DriverDataset) {
  const items: NearbyCommitment[] = [];

  for (const activity of data.activities) {
    if (activity.driver_id !== driverId || activity.status === "cancelled") continue;
    const genericAdministration = activity.event_kind === "administration";
    for (const interval of occupiedIntervals(data.releases, activity, effectiveStart(activity), effectiveEnd(activity))) {
      items.push({
        title: genericAdministration ? "Serviço Administração" : activity.title,
        start: interval.start,
        end: interval.end,
        genericAdministration,
      });
    }
  }

  for (const item of data.unavailability) {
    if (item.driver_id !== driverId || item.status !== "active") continue;
    items.push({
      title: item.reason || "Indisponibilidade pessoal",
      start: new Date(item.start_datetime),
      end: new Date(item.end_datetime),
    });
  }

  for (const item of data.timeOff) {
    if (item.driver_id !== driverId || item.status !== "approved") continue;
    const start = new Date(`${item.start_date}T00:00:00`);
    const end = new Date(`${item.end_date}T23:59:59`);
    items.push({
      title: TIMEOFF_TYPE_LABEL[item.type] ?? "Ausência",
      start,
      end,
      allDay: true,
    });
  }

  const previous = items
    .filter((item) => item.end <= from && from.getTime() - item.end.getTime() <= NEARBY_WINDOW_MS)
    .sort((a, b) => b.end.getTime() - a.end.getTime())[0];
  const next = items
    .filter((item) => item.start >= to && item.start.getTime() - to.getTime() <= NEARBY_WINDOW_MS)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];

  return { previous, next };
}

export function FindDriverDialog({ open, onOpenChange, onClosed, drivers, data, cities, onPick }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("18:00");
  // Rota completa: a ocupação segue a mesma lógica do formulário "Novo serviço".
  const [originCityId, setOriginCityId] = useState("");
  const [cityId, setCityId] = useState("");
  const [roundTrip, setRoundTrip] = useState(true);
  const [debouncedCriteria, setDebouncedCriteria] = useState({
    date,
    startTime,
    endTime,
    originCityId,
    cityId,
    roundTrip,
  });

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedCriteria({ date, startTime, endTime, originCityId, cityId, roundTrip }),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [date, startTime, endTime, originCityId, cityId, roundTrip]);

  const serviceStart = new Date(`${debouncedCriteria.date}T${debouncedCriteria.startTime}`);
  const serviceEnd = new Date(`${debouncedCriteria.date}T${debouncedCriteria.endTime}`);
  const city = cities.find((c) => c.id === debouncedCriteria.cityId) ?? null;
  const originCity = cities.find((c) => c.id === debouncedCriteria.originCityId) ?? null;
  const { data: travelRoutes = [] } = useTravelRoutes();
  const occ = computeOccupation(
    serviceStart,
    serviceEnd,
    originCity,
    city,
    travelRoutes,
    debouncedCriteria.roundTrip,
  );
  const travelIncluded = occ.travelMinutes !== null && occ.travelMinutes > 0;
  const routeName =
    originCity && city ? routeLabel(cityTravelKey(originCity), cityTravelKey(city), cities) : null;
  const validCriteria =
    /^\d{4}-\d{2}-\d{2}$/.test(debouncedCriteria.date) &&
    !Number.isNaN(serviceStart.getTime()) &&
    !Number.isNaN(serviceEnd.getTime()) &&
    serviceEnd > serviceStart &&
    Boolean(debouncedCriteria.originCityId) &&
    Boolean(debouncedCriteria.cityId);
  const monthlyHours = useDriverMonthlyWorkedMinutes(debouncedCriteria.date, open && validCriteria);

  const results = useMemo(
    () =>
      validCriteria
        ? drivers
      .filter((d) => d.active)
      .map((d) => ({
        driver: d,
        res: evaluateAvailability(d.id, occ.start, occ.end, data, {
          travelUnknown: occ.travelUnknown,
          cityName: city?.name ?? null,
        }),
      }))
      // Disponíveis primeiro, ordenados pelas horas do mês (ascendente, estável);
      // os restantes grupos mantêm a ordem de prioridade existente.
      .sort((a, b) => {
        if (a.res.status !== b.res.status) return ORDER[a.res.status] - ORDER[b.res.status];
        if (a.res.status === "AVAILABLE") {
          const aMinutes = monthlyHours.data?.[a.driver.id] ?? 0;
          const bMinutes = monthlyHours.data?.[b.driver.id] ?? 0;
          return aMinutes - bMinutes;
        }
        return 0;
      })
        : [],
    [city?.name, data, drivers, monthlyHours.data, occ.end, occ.start, occ.travelUnknown, validCriteria],
  );

  return (
    <Dialog modal={false} open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-4xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClosed?.();
        }}
      >
        <DialogHeader>
          <DialogTitle>Encontrar motorista disponível</DialogTitle>
          <DialogDescription>
            Indique o horário do serviço e a rota. A disponibilidade considera a deslocação da origem ao destino.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="fd-date">Data</Label>
            <DateInput id="fd-date" value={date} onChange={(v) => setDate(v)} />
          </div>
          <div>
            <Label htmlFor="fd-start">Início do serviço</Label>
            <TimeInput id="fd-start" value={startTime} onChange={setStartTime} />
          </div>
          <div>
            <Label htmlFor="fd-end">Fim do serviço</Label>
            <TimeInput id="fd-end" value={endTime} onChange={setEndTime} />
          </div>
          <div className="grid gap-3 sm:col-span-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="fd-origin-city">Origem</Label>
              <CityCombobox
                id="fd-origin-city"
                cities={cities}
                value={originCityId}
                onChange={setOriginCityId}
                placeholder="Selecionar origem"
              />
            </div>
            <div>
              <Label htmlFor="fd-city">Destino</Label>
              <CityCombobox
                id="fd-city"
                cities={cities}
                value={cityId}
                onChange={setCityId}
                placeholder="Selecionar destino"
              />
            </div>
          </div>
          <div className="sm:col-span-3 flex items-start gap-2 rounded-md border bg-surface-2 p-3">
            <Checkbox
              id="fd-round-trip"
              checked={roundTrip}
              onCheckedChange={(v) => setRoundTrip(v === true)}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="fd-round-trip" className="cursor-pointer">Ida e volta</Label>
              <p className="text-xs text-muted-foreground">
                Considera a deslocação de ida e de regresso. Desative para reservar apenas a ida.
              </p>
            </div>
          </div>
        </div>

        {validCriteria ? <div className="rounded-md border bg-surface-2 p-3 text-sm">
          <p className="font-semibold text-foreground">Ocupação prevista</p>
          <p className="mt-1 text-muted-foreground">
            {fmtDate(serviceStart)}, {fmtTime(serviceStart)} - {fmtTime(serviceEnd)}
          </p>
          {travelIncluded && occ.travelMinutes !== null && (
            <p className="mt-1 text-xs text-muted-foreground">
              Inclui {fmtMinutes(occ.travelMinutes)} de deslocação{" "}
              {debouncedCriteria.roundTrip ? "em cada sentido" : "apenas na ida"}. Ocupação total: {fmtDateTime(occ.start)} - {fmtDateTime(occ.end)}.
            </p>
          )}
          {occ.travelUnknown && (
            <p className="mt-1 text-xs text-busy">
              {routeName
                ? `Tempo de deslocação não configurado para ${routeName}.`
                : "O tempo de deslocação ainda não está configurado."}
            </p>
          )}
        </div> : <p className="rounded-md border border-warning/40 bg-warning-soft p-3 text-sm text-warning">Indique um período válido, a origem e o destino.</p>}

        {validCriteria && (
          <div className="space-y-3">
            {monthlyHours.isPending && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> A calcular as horas mensais…
              </p>
            )}
            {monthlyHours.isError && (
              <p className="rounded-md border border-conflict/40 bg-conflict-soft p-3 text-sm text-conflict">
                Não foi possível calcular as horas mensais. Tente novamente.
              </p>
            )}
            {results.map(({ driver, res }) => {
              const nearby = nearbyCommitments(driver.id, occ.start, occ.end, data);
              // "A confirmar" resume-se a uma linha; os bloqueios continuam agrupados por tipo.
              const conflictGroups =
                res.status === "CONDITIONAL"
                  ? ([["conditional", res.reasons]] as [string, string[]][])
                  : Object.entries(
                      res.conflicts.reduce<Record<string, string[]>>((groups, conflict) => {
                        (groups[conflict.kind] ??= []).push(conflict.message);
                        return groups;
                      }, {}),
                    );

              return (
                <article key={driver.id} className="rounded-md border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${AVAILABILITY_CLASS[res.status]}`}
                      >
                        {AVAILABILITY_LABEL[res.status]}
                      </span>
                      <h3 className="min-w-0 truncate text-sm font-semibold">{driver.name}</h3>
                      </div>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        Horas no mês: {monthlyHours.data ? fmtMinutes(monthlyHours.data[driver.id] ?? 0) : "—"}
                      </p>
                    </div>
                    <Button
                      className="h-8 w-44 shrink-0"
                      size="sm"
                      variant={res.status === "UNAVAILABLE" ? "outline" : "default"}
                      onClick={() =>
                        onPick(
                          driver.id,
                          serviceStart,
                          serviceEnd,
                          debouncedCriteria.cityId || null,
                          debouncedCriteria.originCityId || null,
                        )
                      }
                    >
                      {res.status === "UNAVAILABLE" ? "Escolher mesmo assim" : "Usar este motorista"}
                    </Button>
                  </div>

                  {conflictGroups.length > 0 && (
                    <ul className="mt-2.5 space-y-1">
                      {conflictGroups.map(([kind, messages]) => {
                        const conflictKind = kind as keyof typeof CONFLICT_LABEL;
                        return (
                          <li key={kind} className="flex items-start gap-1.5 text-xs">
                            <AlertTriangle className={`mt-0.5 size-3.5 shrink-0 ${CONFLICT_TEXT[conflictKind]}`} />
                            <span className="min-w-0 break-words text-muted-foreground">
                              <span className={`font-semibold ${CONFLICT_TEXT[conflictKind]}`}>
                                {CONFLICT_LABEL[conflictKind]}
                              </span>
                              {" - "}
                              {messages.join(" · ")}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {(nearby.previous || nearby.next) && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {nearby.previous && (
                        <>
                          Anterior: {formatCommitment(nearby.previous)}
                        </>
                      )}
                      {nearby.previous && nearby.next && " · "}
                      {nearby.next && <>Próximo: {formatCommitment(nearby.next)}</>}
                    </p>
                  )}
                  {!nearby.previous && !nearby.next && conflictGroups.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">Sem compromissos próximos deste período.</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
