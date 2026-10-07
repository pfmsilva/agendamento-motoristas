import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, LockKeyhole, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/lib/auth";
import { PendingCitiesDot } from "@/components/AppShell";
import {
  useActivities,
  useCities,
  useDeleteTravelRoute,
  useMissingRoutes,
  usePendingCitiesCount,
  useSaveCity,
  useSaveTravelRoute,
  useSetCityActive,
  useTravelRoutes,
} from "@/lib/data";
import {
  cityTravelKey,
  isLisbonArea,
  LISBON_LOCAL_MINUTES,
  LISBON_ZONE_KEY,
  LISBON_ZONE_LABEL,
  orderedRouteKeys,
  type City,
} from "@/lib/scheduling";

import { AuditPanel } from "@/components/AuditPanel";
import { UsersPanel } from "@/components/admin/UsersPanel";
import { PriorityListsPanel } from "@/components/admin/PriorityListsPanel";
import { AdjustReasonsPanel } from "@/components/admin/AdjustReasonsPanel";
import { EventKindsPanel } from "@/components/admin/EventKindsPanel";
import { LoanVehicleEventTypesPanel } from "@/components/admin/LoanVehicleEventTypesPanel";
import { errorMessagePt } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/admin")({
  // `?tab=cities` lets the "new destination" notification open the right area.
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search["tab"] === "string" ? { tab: search["tab"] } : {},
  head: () => ({
    meta: [
      { title: "Administração · Gestão de Frota" },
      {
        name: "description",
        content: "Faça a gestão de utilizadores, listas de prioridade, cidades e deslocações.",
      },
      { property: "og:title", content: "Administração · Gestão de Frota" },
      {
        property: "og:description",
        content: "Faça a gestão de utilizadores, listas de prioridade, cidades e deslocações.",
      },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = useAuth();
  const { tab } = Route.useSearch();
  const isOwner = user?.role === "owner";
  const canManageTypes = isOwner || user?.role === "manager";
  const pendingCities = usePendingCitiesCount();

  if (user?.role !== "manager" && !isOwner) {
    return (
      <div className="panel p-8 text-center">
        <h1 className="text-lg font-semibold">Acesso restrito</h1>
        <p className="mt-1 text-sm text-muted-foreground">Não tem acesso à administração.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Administração</h1>
        <p className="text-sm text-muted-foreground">
          {isOwner
            ? "Utilizadores, listas de prioridade, cidades e histórico de alterações."
            : "Listas de prioridade, cidades e tempos de deslocação."}
        </p>
      </div>

      <Tabs defaultValue={tab ?? (isOwner ? "users" : "cities")}>

        <TabsList>
          <TabsTrigger
            value="cities"
            className={`relative ${pendingCities > 0 ? "pr-5" : ""}`}
          >
            Cidades e deslocações
            <PendingCitiesDot count={pendingCities} />
          </TabsTrigger>
          {isOwner && <TabsTrigger value="reasons">Motivos de ajuste</TabsTrigger>}
          {canManageTypes && <TabsTrigger value="tags">Tipos de evento</TabsTrigger>}
          <TabsTrigger value="priorities">Administradores</TabsTrigger>
          {isOwner && <TabsTrigger value="users">Utilizadores</TabsTrigger>}
          {isOwner && <TabsTrigger value="audit">Auditoria</TabsTrigger>}
        </TabsList>

        {canManageTypes && (
          <TabsContent value="tags" className="mt-4">
            <div className="space-y-6"><EventKindsPanel /><LoanVehicleEventTypesPanel /></div>
          </TabsContent>
        )}

        {isOwner && (
          <TabsContent value="users" className="mt-4">
            <UsersPanel />
          </TabsContent>
        )}

        <TabsContent value="cities" className="mt-4">
          <CitiesPanel />
        </TabsContent>

        <TabsContent value="priorities" className="mt-4">
          <PriorityListsPanel />
        </TabsContent>

        {isOwner && (
          <TabsContent value="reasons" className="mt-4">
            <AdjustReasonsPanel />
          </TabsContent>
        )}

        {isOwner && (
          <TabsContent value="audit" className="mt-4">
            <AuditPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function CitiesPanel() {
  const { data: cities = [] } = useCities();
  const { data: activities = [] } = useActivities();
  const saveCity = useSaveCity();
  const [name, setName] = useState("");

  const sortedCities = useMemo(
    () => cities.filter((city) => city.active).sort((a, b) => a.name.localeCompare(b.name, "pt-PT")),
    [cities],
  );

  const add = async () => {
    if (!name.trim()) return;
    try {
      await saveCity.mutateAsync({
        values: {
          name: name.trim(),
          travel_minutes: 0,
          outbound_minutes: 0,
          return_minutes: 0,
        },
      });
      toast.success("Local adicionado");
      setName("");
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível guardar"));
    }
  };

  return (
    <div className="space-y-6">
      <section className="panel space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold">Locais</h2>
          <p className="text-xs text-muted-foreground">
            Locais disponíveis como origem e destino dos serviços. Os tempos de deslocação são
            configurados por rota, na secção seguinte.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label>Local</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-48"
              placeholder="Braga"
            />
          </div>
          <Button onClick={add} disabled={!name.trim() || saveCity.isPending}>
            Adicionar
          </Button>
        </div>

        <ul className="divide-y text-sm">
          {sortedCities.map((c) => (
            <CityRow key={c.id} city={c} uses={activities.filter((a) => a.city_id === c.id).length} />
          ))}
          {sortedCities.length === 0 && (
            <li className="py-2 text-muted-foreground">Sem locais configurados.</li>
          )}
        </ul>
      </section>

      <TravelRoutesPanel />
    </div>
  );
}

function CityRow({ city, uses }: { city: City; uses: number }) {
  const setActive = useSetCityActive();

  const remove = async () => {
    try {
      await setActive.mutateAsync({ id: city.id, active: false });
      toast.success(
        uses > 0
          ? `Local removido. ${uses} serviço(s) histórico(s) mantêm o local.`
          : "Local removido.",
      );
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível remover o local"));
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <div className="flex min-w-56 flex-1 flex-wrap items-center gap-2 text-left">
        <span className="font-medium">{city.name}</span>
        {isLisbonArea(city) && (
          <Badge variant="outline">Zona de Lisboa · 1h fixa</Badge>
        )}
        {uses > 0 && (
          <span className="text-xs text-muted-foreground">{uses} serviço(s) no histórico</span>
        )}
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="w-[86px]"
        disabled={setActive.isPending || city.is_system}
        onClick={() => void remove()}
      >
        Remover
      </Button>
    </li>
  );
}

type MatrixLocation = {
  key: string;
  label: string;
};

type RouteMatrixFilter = "all" | "configured" | "missing";

const MATRIX_COLUMN_LIMIT = 7;

function formatMatrixTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}h${String(mins).padStart(2, "0")}`;
}

function matrixRouteKey(keyA: string, keyB: string) {
  return orderedRouteKeys(keyA, keyB).join("|");
}

/** Matriz dos tempos de deslocação por rota: cada valor aplica-se nos dois sentidos. */
function TravelRoutesPanel() {
  const { data: cities = [] } = useCities();
  const { data: routes = [] } = useTravelRoutes();
  const missing = useMissingRoutes();
  const saveRoute = useSaveTravelRoute();
  const deleteRoute = useDeleteTravelRoute();

  const [query, setQuery] = useState("");
  const [matrixFilter, setMatrixFilter] = useState<RouteMatrixFilter>("all");
  const [columnPage, setColumnPage] = useState(0);
  const [editing, setEditing] = useState<{ origin: MatrixLocation; destination: MatrixLocation } | null>(null);
  const [hours, setHours] = useState("0");
  const [mins, setMins] = useState("0");
  const parsedHours = Number(hours);
  const parsedMinutes = Number(mins);
  const validDuration = Number.isInteger(parsedHours)
    && parsedHours >= 0
    && Number.isInteger(parsedMinutes)
    && parsedMinutes >= 0
    && parsedMinutes <= 59
    && parsedHours * 60 + parsedMinutes > 0;
  const total = validDuration ? parsedHours * 60 + parsedMinutes : 0;

  const matrixLocations = useMemo<MatrixLocation[]>(
    () => {
      const activeCities = cities
        .filter((city) => city.active)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
      const hasLisbonArea = activeCities.some(isLisbonArea);
      return [
        ...(hasLisbonArea ? [{ key: LISBON_ZONE_KEY, label: LISBON_ZONE_LABEL }] : []),
        ...activeCities
          .filter((city) => !isLisbonArea(city))
          .map((city) => ({ key: cityTravelKey(city), label: city.name })),
      ];
    },
    [cities],
  );

  const routesByKey = useMemo(
    () => new Map(routes.map((route) => [matrixRouteKey(route.key_a, route.key_b), route])),
    [routes],
  );

  const isConfiguredPair = (origin: MatrixLocation, destination: MatrixLocation) => {
    if (origin.key === destination.key) return origin.key === LISBON_ZONE_KEY;
    return routesByKey.has(matrixRouteKey(origin.key, destination.key));
  };

  const locationMatchesFilter = (location: MatrixLocation) => {
    if (matrixFilter === "all") return true;
    return matrixLocations.some((other) => {
      if (location.key === other.key) return false;
      const configured = isConfiguredPair(location, other);
      return matrixFilter === "configured" ? configured : !configured;
    });
  };

  const filteredLocations = matrixLocations.filter(locationMatchesFilter);
  const term = query.trim().toLocaleLowerCase("pt-PT");
  const matchingLocations = term
    ? filteredLocations.filter((location) => location.label.toLocaleLowerCase("pt-PT").includes(term))
    : filteredLocations;
  const rowLocations = term ? matchingLocations : filteredLocations;
  const contextualColumns = term
    ? [
        ...matchingLocations,
        ...filteredLocations.filter((location) => !matchingLocations.some((match) => match.key === location.key)),
      ]
    : filteredLocations;
  const columnPageCount = Math.max(1, Math.ceil(contextualColumns.length / MATRIX_COLUMN_LIMIT));
  const safeColumnPage = Math.min(columnPage, columnPageCount - 1);
  const columnStart = safeColumnPage * MATRIX_COLUMN_LIMIT;
  const columnLocations = contextualColumns.slice(columnStart, columnStart + MATRIX_COLUMN_LIMIT);

  const editedRoute = editing
    ? routesByKey.get(matrixRouteKey(editing.origin.key, editing.destination.key)) ?? null
    : null;

  const openEditor = (origin: MatrixLocation, destination: MatrixLocation) => {
    const route = routesByKey.get(matrixRouteKey(origin.key, destination.key));
    const routeMinutes = route?.minutes ?? 0;
    setHours(String(Math.floor(routeMinutes / 60)));
    setMins(String(routeMinutes % 60));
    setEditing({ origin, destination });
  };

  const save = async () => {
    if (!editing || total <= 0) return;
    try {
      await saveRoute.mutateAsync({
        keyA: editing.origin.key,
        keyB: editing.destination.key,
        minutes: total,
      });
      toast.success("Tempo de deslocação da rota guardado");
      setEditing(null);
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível guardar a rota"));
    }
  };

  const remove = async () => {
    if (!editedRoute) return;
    try {
      await deleteRoute.mutateAsync(editedRoute.id);
      toast.success("Rota removida");
      setEditing(null);
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível remover a rota"));
    }
  };

  return (
    <section className="panel space-y-4 p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Tempos de deslocação por rota</h2>
          <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
            Cada valor aplica-se nos dois sentidos. Lisboa / Casa tem 1 hora automática entre os
            locais do grupo.
          </p>
        </div>
        <div className="hidden items-center gap-3 text-[11px] text-muted-foreground lg:flex">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-busy-soft ring-1 ring-primary/15" />Configurado</span>
          <span className="flex items-center gap-1.5"><LockKeyhole className="size-3 text-brand" />Automático</span>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="rounded-md border border-leave bg-leave-soft px-3 py-2 text-xs text-leave">
          <p className="font-medium">Rotas usadas em serviços e ainda por configurar:</p>
          <ul className="mt-1 space-y-0.5">
            {missing.map((route) => (
              <li key={`${route.keyA}|${route.keyB}`}>
                Tempo de deslocação não configurado para {route.label}. ({route.services} serviço(s))
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(15rem,1fr)_auto] sm:items-center">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setColumnPage(0);
            }}
            className="pl-9"
            placeholder="Pesquisar local"
            aria-label="Pesquisar local na matriz"
          />
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={matrixFilter}
          onValueChange={(value) => {
            if (!value) return;
            setMatrixFilter(value as RouteMatrixFilter);
            setColumnPage(0);
          }}
          aria-label="Filtrar rotas"
          className="justify-start overflow-x-auto sm:justify-end"
        >
          <ToggleGroupItem value="all" aria-label="Mostrar todas as rotas">Todos</ToggleGroupItem>
          <ToggleGroupItem value="configured" aria-label="Mostrar rotas configuradas">Configurados</ToggleGroupItem>
          <ToggleGroupItem value="missing" aria-label="Mostrar rotas por configurar">Por configurar</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {rowLocations.length > 0 && columnLocations.length > 0 ? (
        <div className="space-y-2">
          <div className="flex min-h-8 items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {term ? `${rowLocations.length} local(is) encontrado(s)` : `${filteredLocations.length} locais`}
            </p>
            {columnPageCount > 1 && (
              <div className="flex items-center gap-1">
                <span className="mr-1 text-xs tabular-nums text-muted-foreground">
                  {columnStart + 1}–{Math.min(columnStart + MATRIX_COLUMN_LIMIT, contextualColumns.length)} de {contextualColumns.length}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={safeColumnPage === 0}
                  aria-label="Colunas anteriores"
                  onClick={() => setColumnPage(Math.max(0, safeColumnPage - 1))}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={safeColumnPage >= columnPageCount - 1}
                  aria-label="Colunas seguintes"
                  onClick={() => setColumnPage(Math.min(columnPageCount - 1, safeColumnPage + 1))}
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
          </div>
          <div className="max-h-[60dvh] overflow-auto rounded-md border bg-surface p-1 shadow-panel">
          <table className="w-full min-w-[42rem] border-separate border-spacing-1 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 w-40 min-w-40 bg-surface px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">
                  Origem / Destino
                </th>
                {columnLocations.map((location) => (
                  <th
                    key={location.key}
                    scope="col"
                    className="sticky top-0 z-20 min-w-20 bg-surface px-1.5 py-2 text-center text-xs font-semibold"
                  >
                    <span className="block line-clamp-2 leading-tight">{location.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowLocations.map((origin) => (
                <tr key={origin.key} className="group/row">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 w-40 min-w-40 rounded-md bg-surface px-3 py-2 text-left text-xs font-semibold group-hover/row:bg-muted"
                  >
                    <span className="block truncate" title={origin.label}>{origin.label}</span>
                  </th>
                  {columnLocations.map((destination) => {
                    const sameLocation = origin.key === destination.key;
                    const fixedLisbon = sameLocation && origin.key === LISBON_ZONE_KEY;
                    const route = sameLocation
                      ? null
                      : routesByKey.get(matrixRouteKey(origin.key, destination.key));
                    const hiddenByFilter = matrixFilter === "configured" ? !route && !fixedLisbon : matrixFilter === "missing" ? Boolean(route) || fixedLisbon : false;
                    const label = fixedLisbon
                      ? formatMatrixTime(LISBON_LOCAL_MINUTES)
                      : route
                        ? formatMatrixTime(route.minutes)
                        : "";
                    return (
                      <td
                        key={destination.key}
                        className="h-10 min-w-20 p-0 text-center"
                      >
                        {hiddenByFilter ? null : fixedLisbon ? (
                          <span
                            className="flex h-9 items-center justify-center gap-1 rounded-md bg-brand-soft/60 px-1 font-mono text-xs font-semibold text-brand-dark"
                            title="Definido automaticamente para Lisboa / Casa"
                          >
                            <LockKeyhole className="size-3" />{label}
                          </span>
                        ) : sameLocation ? (
                          <span className="block h-9 rounded-md bg-muted/70" aria-label="Mesmo local" />
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            className={`group/cell h-9 w-full rounded-md px-1 font-mono text-xs ${route ? "bg-busy-soft font-semibold text-primary ring-1 ring-primary/10 hover:bg-busy-soft" : "text-muted-foreground/45 hover:bg-muted hover:text-primary"}`}
                            aria-label={`${origin.label} para ${destination.label}: ${route ? label : "por configurar; adicionar"}`}
                            onClick={() => openEditor(origin, destination)}
                          >
                            {route ? label : <Plus className="size-3 opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100" />}
                          </Button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : (
        <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          Nenhum local corresponde à pesquisa e ao filtro selecionado.
        </p>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tempo de deslocação</DialogTitle>
            <DialogDescription>
              {editing ? `${editing.origin.label} ↔ ${editing.destination.label}` : "Definir rota"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="matrix-route-hours">Horas</Label>
              <Input
                id="matrix-route-hours"
                type="number"
                min={0}
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="matrix-route-minutes">Minutos</Label>
              <Input
                id="matrix-route-minutes"
                type="number"
                min={0}
                max={59}
                value={mins}
                onChange={(event) => setMins(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
            <div>
              {editedRoute && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={deleteRoute.isPending}
                  onClick={() => void remove()}
                >
                  Remover
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={!validDuration || saveRoute.isPending}
                onClick={() => void save()}
              >
                Guardar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
