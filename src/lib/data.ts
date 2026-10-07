import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQueries, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  deletePendingAccount,
  deleteUnlinkedRecord,
  deleteUserAccount,
} from "./admin.functions";
import { flushEmailQueue } from "./email/email.functions";

import {
  cityTravelKey,
  orderedRouteKeys,
  routeLabel,
  routeTravelMinutes,
  setEventKindLabels,
} from "./scheduling";

import type { Database } from "@/integrations/supabase/types";
import type {
  Activity,
  Assistant,
  City,
  Driver,
  TimeOff,
  TravelRoute,
  Unavailability,
} from "./scheduling";

type ActivityInsert = Database["public"]["Tables"]["activities"]["Insert"];
type ActivityUpdate = Database["public"]["Tables"]["activities"]["Update"];

export const CONCURRENT_EDIT_MESSAGE =
  "Este registo foi alterado por outro utilizador entretanto. Atualize a página para ver a versão mais recente e repita a alteração.";

const ok = <T>(res: { data: T | null; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
};

/** Throws when the write failed OR when it silently affected zero rows (RLS). */
const assertWritten = (
  res: { data: unknown[] | null; error: { message: string } | null },
  fallback: string,
) => {
  if (res.error) throw new Error(res.error.message);
  if (!res.data || res.data.length === 0) throw new Error(fallback);
  return res.data;
};

/**
 * Multi-user support: mirrors backend changes made by other sessions into this
 * client's cache, so nobody works on stale rows. Also recovers from dropped
 * websockets (sleep, flaky network) by refetching whenever the connection or
 * the tab comes back.
 */
export function useRealtimeSync(): { live: boolean } {
  const qc = useQueryClient();
  const [live, setLive] = useState(true);
  useEffect(() => {
    const map: Record<string, string[]> = {
      activities: ["activities"],
      activity_confidential_content: ["activities", "activity_note_ids"],
      activity_private_notes: ["activity_note_ids"],
      drivers: ["drivers"],
      assistants: ["assistants"],
      cities: ["cities"],
      time_off: ["time_off"],
      unavailability: ["unavailability"],
      administrators: ["administrators"],
      administrator_driver_priorities: ["admin_priorities"],
      assistant_administrators: ["assistant_administrators"],
      notifications: ["notifications"],
      audit_log: ["audit_log"],
      activity_change_validations: ["activity_change_validations"],
      event_tags: ["event_tags"],
      analytics_dashboards: ["analytics_dashboards"],
      analytics_widgets: ["analytics_widgets"],
      loan_vehicles: ["loan_vehicles"],
      schedule_releases: ["schedule_releases"],
      loan_vehicle_events: ["loan_vehicle_events"],
      loan_vehicle_event_types: ["loan_vehicle_event_types"],
    };
    // Bursts of related changes (a service + its audit rows) arrive within a few
    // milliseconds; collect the affected keys and refetch once.
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const keys = [...pending];
      pending.clear();
      for (const key of keys) void qc.invalidateQueries({ queryKey: [key] });
    };
    const queue = (keys: string[]) => {
      for (const k of keys) pending.add(k);
      if (timer === null) timer = setTimeout(flush, 120);
    };

    const channel = supabase.channel("app-sync");
    for (const table of Object.keys(map)) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        queue(map[table] ?? []);
      });
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setLive(true);
        // Anything that changed while we were disconnected is picked up here.
        void qc.invalidateQueries();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setLive(false);
      }
    });

    // focus e visibilitychange disparam juntos: um único refetch por regresso.
    let lastResync = 0;
    const resync = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastResync < 5_000) return;
      lastResync = now;
      void qc.invalidateQueries();
    };
    window.addEventListener("online", resync);
    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", resync);

    return () => {
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener("online", resync);
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", resync);
      void supabase.removeChannel(channel);
    };
  }, [qc]);
  return { live };
}

export function useCities() {
  return useQuery({
    queryKey: ["cities"],
    queryFn: async () => ok<City[]>(await supabase.from("cities").select("*").order("name")),
  });
}

/** Tempos de deslocação configurados por rota (origem ↔ destino, bidirecionais). */
export function useTravelRoutes() {
  return useQuery({
    queryKey: ["travel_routes"],
    queryFn: async () =>
      ok<TravelRoute[]>(await supabase.from("travel_routes").select("*")),
  });
}

export function useSaveTravelRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { keyA: string; keyB: string; minutes: number }) => {
      const [key_a, key_b] = orderedRouteKeys(v.keyA, v.keyB);
      const res = await supabase
        .from("travel_routes")
        .upsert({ key_a, key_b, minutes: v.minutes }, { onConflict: "key_a,key_b" })
        .select("id");
      assertWritten(res, "A rota não foi gravada (apenas o Gestor ou o Proprietário podem configurar rotas).");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["travel_routes"] });
      void qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

export function useDeleteTravelRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.from("travel_routes").delete().eq("id", id).select("id");
      assertWritten(res, "A rota não foi removida (sem permissão).");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["travel_routes"] });
      void qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

export type MissingRoute = { keyA: string; keyB: string; label: string; services: number };

/**
 * Rotas usadas por serviços ativos que ainda não têm tempo de deslocação
 * configurado. Reutiliza o sinal `travel_unknown` calculado na base de dados.
 */
export function useMissingRoutes(): MissingRoute[] {
  const { data: activities = [] } = useActivities();
  const { data: cities = [] } = useCities();
  const { data: routes = [] } = useTravelRoutes();
  return useMemo(() => {
    const out = new Map<string, MissingRoute>();
    for (const a of activities) {
      if (a.status === "cancelled" || !a.origin_city_id || !a.city_id) continue;
      const origin = cities.find((c) => c.id === a.origin_city_id);
      const destination = cities.find((c) => c.id === a.city_id);
      if (!origin || !destination) continue;
      if (routeTravelMinutes(origin, destination, routes) !== null) continue;
      const [keyA, keyB] = orderedRouteKeys(cityTravelKey(origin), cityTravelKey(destination));
      const id = `${keyA}|${keyB}`;
      const current = out.get(id) ?? {
        keyA,
        keyB,
        label: routeLabel(keyA, keyB, cities),
        services: 0,
      };
      current.services += 1;
      out.set(id, current);
    }
    return [...out.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-PT"));
  }, [activities, cities, routes]);
}

export type EventTag = Database["public"]["Tables"]["event_tags"]["Row"];
export type EventKindTag = Database["public"]["Tables"]["event_kind_tags"]["Row"];

/**
 * Tipos de evento e respetiva TAG, geridos pelo Proprietário no backoffice.
 * Tipo de evento e TAG são conceitos distintos: o tipo descreve o evento
 * criado, a TAG classifica-o para filtros, análises e exportações.
 */
export function useEventKindTags() {
  return useQuery({
    queryKey: ["event_kind_tags"],
    queryFn: async () => {
      const rows = ok<EventKindTag[]>(
        await supabase.from("event_kind_tags").select("*").order("sort_order").order("label"),
      );
      // Os rótulos configurados alimentam filtros, análises e exportações.
      setEventKindLabels(Object.fromEntries(rows.map((row) => [row.kind, row.label])));
      return rows;
    },
  });
}


/** Cria, renomeia ou ativa/desativa um tipo de evento (apenas Proprietário). */
export function useSaveEventKind() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      kind?: string;
      label: string;
      tagId?: string;
      active?: boolean;
      sortOrder?: number;
    }) => {
      if (v.kind) {
        const res = await supabase
          .from("event_kind_tags")
          .update({
            label: v.label,
            ...(v.tagId ? { tag_id: v.tagId } : {}),
            ...(v.active === undefined ? {} : { active: v.active }),
          })
          .eq("kind", v.kind)
          .select("kind");
        assertWritten(res, "O tipo de evento não foi gravado (apenas o Proprietário ou o Gestor podem alterá-lo).");
        return;
      }
      if (!v.tagId) throw new Error("Escolha a TAG associada ao novo tipo de evento.");
      const res = await supabase
        .from("event_kind_tags")
        .insert({
          kind: v.label,
          label: v.label.trim(),
          tag_id: v.tagId,
          sort_order: v.sortOrder ?? 100,
        })
        .select("kind");
      assertWritten(res, "O tipo de evento não foi criado (apenas o Proprietário ou o Gestor podem criá-lo).");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event_kind_tags"] }),
  });
}

export function useDeleteEventKind() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (kind: string) => {
      const res = await supabase.from("event_kind_tags").delete().eq("kind", kind).select("kind");
      assertWritten(res, "O tipo de evento não foi eliminado (apenas o Proprietário ou o Gestor podem eliminá-lo).");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event_kind_tags"] }),
  });
}
export type AnalyticsDashboard = Database["public"]["Tables"]["analytics_dashboards"]["Row"];
export type AnalyticsWidget = Database["public"]["Tables"]["analytics_widgets"]["Row"];
export type AnalyticsOccupancyRow = Database["public"]["Functions"]["analytics_occupancy"]["Returns"][number];

export function useAnalyticsDashboards() {
  return useQuery({ queryKey: ["analytics_dashboards"], queryFn: async () => ok<AnalyticsDashboard[]>(await supabase.from("analytics_dashboards").select("*").order("is_default", { ascending: false }).order("name")) });
}

export function useAnalyticsWidgets(dashboardId: string | null) {
  return useQuery({ enabled: !!dashboardId, queryKey: ["analytics_widgets", dashboardId], queryFn: async () => dashboardId ? ok<AnalyticsWidget[]>(await supabase.from("analytics_widgets").select("*").eq("dashboard_id", dashboardId).order("sort_order")) : [] });
}

function useInvalidateAnalytics() {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: ["analytics_dashboards"] }); void qc.invalidateQueries({ queryKey: ["analytics_widgets"] }); void qc.invalidateQueries({ queryKey: ["analytics_occupancy"] }); };
}

export function useSaveAnalyticsDashboard() {
  const invalidate = useInvalidateAnalytics();
  return useMutation({ mutationFn: async (values: Database["public"]["Tables"]["analytics_dashboards"]["Insert"] & { id?: string }) => {
    const { id, ...payload } = values; const res = id ? await supabase.from("analytics_dashboards").update(payload).eq("id", id).select().single() : await supabase.from("analytics_dashboards").insert(payload).select().single();
    if (res.error) throw new Error(res.error.message); return res.data;
  }, onSuccess: invalidate });
}

export function useDeleteAnalyticsDashboard() { const invalidate = useInvalidateAnalytics(); return useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("analytics_dashboards").delete().eq("id", id); if (error) throw new Error(error.message); }, onSuccess: invalidate }); }
export function useSaveAnalyticsWidget() { const invalidate = useInvalidateAnalytics(); return useMutation({ mutationFn: async (values: Database["public"]["Tables"]["analytics_widgets"]["Insert"] & { id?: string }) => { const { id, ...payload } = values; const res = id ? await supabase.from("analytics_widgets").update(payload).eq("id", id).select().single() : await supabase.from("analytics_widgets").insert(payload).select().single(); if (res.error) throw new Error(res.error.message); return res.data; }, onSuccess: invalidate }); }
export function useDeleteAnalyticsWidget() { const invalidate = useInvalidateAnalytics(); return useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("analytics_widgets").delete().eq("id", id); if (error) throw new Error(error.message); }, onSuccess: invalidate }); }

export function useAnalyticsOccupancy(from: string, to: string, filters: { driverIds: string[]; administratorIds: string[]; assistantIds: string[]; tagIds: string[] }) {
  return useQuery({ queryKey: ["analytics_occupancy", from, to, filters], queryFn: async () => {
    const args: Database["public"]["Functions"]["analytics_occupancy"]["Args"] = { _from: `${from}T00:00:00`, _to: `${to}T23:59:59.999` };
    if (filters.driverIds.length) args._driver_ids = filters.driverIds;
    if (filters.administratorIds.length) args._administrator_ids = filters.administratorIds;
    if (filters.assistantIds.length) args._assistant_ids = filters.assistantIds;
    if (filters.tagIds.length) args._tag_ids = filters.tagIds;
    const { data, error } = await supabase.rpc("analytics_occupancy", args);
    if (error) throw new Error(error.message); return data as AnalyticsOccupancyRow[];
  }, staleTime: 20_000 });
}

/** TAGs globais de serviços e eventos, incluindo opções inativas para o histórico. */
export function useEventTags() {
  return useQuery({
    queryKey: ["event_tags"],
    queryFn: async () =>
      ok<EventTag[]>(
        await supabase.from("event_tags").select("*").order("sort_order").order("label"),
      ),
  });
}

function useInvalidateEventTags() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["event_tags"] });
}

export function useSaveEventTag() {
  const invalidate = useInvalidateEventTags();
  return useMutation({
    mutationFn: async (v: {
      id?: string | undefined;
      label: string;
      active?: boolean | undefined;
      sortOrder?: number | undefined;
    }) => {
      const values = {
        label: v.label.trim(),
        ...(v.active === undefined ? {} : { active: v.active }),
        ...(v.sortOrder === undefined ? {} : { sort_order: v.sortOrder }),
      };
      const res = v.id
        ? await supabase.from("event_tags").update(values).eq("id", v.id).select("id")
        : await supabase.from("event_tags").insert(values).select("id");
      const rows = assertWritten(
        res,
        "A TAG não foi gravada (apenas o Proprietário pode gerir TAGs).",
      ) as { id: string }[];
      return rows[0]?.id;
    },
    onSuccess: invalidate,
  });
}



/** Rotas usadas em serviços que ainda não têm tempo de deslocação configurado. */
export function usePendingCitiesCount() {
  return useMissingRoutes().length;
}

export function useDrivers() {
  return useQuery({
    queryKey: ["drivers"],
    queryFn: async () => ok<Driver[]>(await supabase.from("drivers").select("*").order("name")),
  });
}

export function useAssistants() {
  return useQuery({
    queryKey: ["assistants"],
    queryFn: async () =>
      ok<Assistant[]>(await supabase.from("assistants").select("*").order("name")),
  });
}

export type Administrator = Database["public"]["Tables"]["administrators"]["Row"];
export type PriorityRow = Database["public"]["Tables"]["administrator_driver_priorities"]["Row"];
export type AssistantAdminLink = Database["public"]["Tables"]["assistant_administrators"]["Row"];

/** Fichas de Administrador: cada uma tem a sua hierarquia de motoristas. */
export function useAdministrators() {
  return useQuery({
    queryKey: ["administrators"],
    queryFn: async () =>
      ok<Administrator[]>(await supabase.from("administrators").select("*").order("name")),
  });
}

/** Hierarquias: uma linha por (administrador, motorista), ordenadas pela posição. */
export function useAdminPriorities() {
  return useQuery({
    queryKey: ["admin_priorities"],
    queryFn: async () =>
      ok<PriorityRow[]>(
        await supabase
          .from("administrator_driver_priorities")
          .select("*")
          .order("administrator_id")
          .order("priority"),
      ),
  });
}

/** Ligações assistente → Administrador (principal e delegações). */
export function useAssistantAdministrators() {
  return useQuery({
    queryKey: ["assistant_administrators"],
    queryFn: async () =>
      ok<AssistantAdminLink[]>(
        await supabase.from("assistant_administrators").select("*").order("created_at"),
      ),
  });
}

/**
 * Uma ligação está a vigorar hoje? (o principal não tem datas)
 * Uma delegação só vigora depois de aceite pelo assistente que a recebe.
 */
export function isLinkActiveNow(l: AssistantAdminLink, today = new Date()): boolean {
  if (!l.active) return false;
  if (l.relationship_type === "delegated" && l.delegation_state !== "active") return false;
  const d = today.toISOString().slice(0, 10);
  if (l.start_date && l.start_date > d) return false;
  if (l.end_date && l.end_date < d) return false;
  return true;
}

/** Delegação à espera da decisão do assistente que a recebe. */
export function isDelegationPending(l: AssistantAdminLink): boolean {
  return l.relationship_type === "delegated" && l.active && l.delegation_state === "pending";
}

/**
 * A ligação deve aparecer na configuração ativa?
 * Mostra principais, delegações a decorrer, pendentes e futuras agendadas.
 * Esconde (sem apagar) delegações recusadas, terminadas ou já expiradas.
 */
export function isLinkVisibleInConfig(l: AssistantAdminLink, today = new Date()): boolean {
  if (!l.active) return false;
  if (l.relationship_type === "primary") return true;
  if (l.delegation_state === "refused" || l.delegation_state === "ended") return false;
  const d = today.toISOString().slice(0, 10);
  if (l.end_date && l.end_date < d) return false;
  return true;
}

/** Owner/Gestor: reescreve a hierarquia ordenada de motoristas de um Administrador. */
export function useSetAdministratorPriorities() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      administratorId,
      driverIds,
    }: {
      administratorId: string;
      driverIds: string[];
    }) => {
      const { error } = await supabase.rpc("set_administrator_priorities", {
        _administrator_id: administratorId,
        _driver_ids: driverIds,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/** Owner/Gestor: cria ou altera uma ficha de Administrador. */
export function useSaveAdministrator() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id?: string | undefined;
      values: Database["public"]["Tables"]["administrators"]["Insert"];
    }) => {
      const res = id
        ? await supabase.from("administrators").update(values).eq("id", id).select("id")
        : await supabase.from("administrators").insert(values).select("id");
      assertWritten(res, "Não foi possível guardar o Administrador (sem permissão).");
    },
    onSuccess: invalidate,
  });
}

/** Owner/Gestor: liga um assistente a um Administrador (principal ou delegação com datas). */
export function useSaveAssistantAdminLink() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (
      values: Database["public"]["Tables"]["assistant_administrators"]["Insert"],
    ) => {
      const res = await supabase
        .from("assistant_administrators")
        .upsert(values, { onConflict: "assistant_id,administrator_id" })
        .select("id");
      assertWritten(res, "Não foi possível guardar a ligação (sem permissão).");
    },
    onSuccess: invalidate,
  });
}

export function useDeleteAssistantAdminLink() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase
        .from("assistant_administrators")
        .delete()
        .eq("id", id)
        .select("id");
      assertWritten(res, "Não foi possível remover a ligação (sem permissão).");
    },
    onSuccess: invalidate,
  });
}

/** Assistente: delega um Administrador que serve a outro assistente, por um período. */
export function useDelegateAdministrator() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: {
      administratorId: string;
      delegateAssistantId: string;
      startDate: string;
      endDate: string;
      sharePast: boolean;
      shareFuture: boolean;
    }) => {
      const { error } = await supabase.rpc("delegate_administrator", {
        _administrator_id: v.administratorId,
        _delegate_assistant_id: v.delegateAssistantId,
        _start_date: v.startDate,
        _end_date: v.endDate,
        _share_past: v.sharePast,
        _share_future: v.shareFuture,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/** Termina antecipadamente uma delegação criada por si (ou por Owner/Gestor). */
export function useEndAdministratorDelegation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("end_administrator_delegation", { _id: id } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/** Assistente que recebe: aceita ou recusa uma delegação pendente. */
export function useRespondAdministratorDelegation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await supabase.rpc("respond_administrator_delegation", {
        _id: id,
        _accept: accept,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}




export type ServiceRequestInput = {
  administratorId: string;
  title: string;
  type: Database["public"]["Enums"]["activity_type"];
  /** Destino do serviço; obrigatório em todos os tipos de serviço. */
  cityId: string | null;
  /** Origem do serviço; obrigatória em todos os tipos de serviço. */
  originCityId: string | null;
  start: string;
  end: string;
  notes: string | null;
  tagId: string;
  /** Ida e volta: reserva a deslocação de regresso além da de ida. */
  roundTrip: boolean;
  /** Tipo de evento configurado pelo Proprietário; fica gravado no serviço. */
  eventKindKey?: string;
};

/** Cria o serviço; o motorista sai da hierarquia do Administrador escolhido. */
export function useCreateServiceAuto() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: ServiceRequestInput) => {
      const { data, error } = await supabase.rpc("create_service_auto", {
        _administrator_id: v.administratorId,
        _title: v.title,
        _type: v.type,
        _city_id: v.cityId,
        _origin_city_id: v.originCityId,
        _start: v.start,
        _end: v.end,
        _notes: v.notes,
        _tag_id: v.tagId,
        _round_trip: v.roundTrip,
        _event_kind_key: v.eventKindKey ?? null,
      } as never);
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: invalidate,
  });
}

/** Assistente: altera o serviço e reavalia a atribuição. */
export function useUpdateServiceAuto() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      expectedUpdatedAt,
      ...v
    }: ServiceRequestInput & { id: string; expectedUpdatedAt?: string | undefined }) => {
      const { error } = await supabase.rpc("update_service_auto", {
        _id: id,
        _title: v.title,
        _type: v.type,
        _city_id: v.cityId,
        _origin_city_id: v.originCityId,
        _start: v.start,
        _end: v.end,
        _notes: v.notes,
        _expected_updated_at: expectedUpdatedAt ?? null,
        _tag_id: v.tagId,
        _round_trip: v.roundTrip,
        _event_kind_key: v.eventKindKey ?? null,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useCancelServiceAuto() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_service_auto", { _id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/** Motorista: evento de garagem na sua própria agenda. */
export function useCreateDriverGarageEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: {
      title: string;
      cityId: string;
      originCityId: string;
      start: string;
      end: string;
      notes: string | null;
    }) => {
      const { data, error } = await supabase.rpc("create_driver_garage_event", {
        _title: v.title,
        _city_id: v.cityId,
        _origin_city_id: v.originCityId,
        _start: v.start,
        _end: v.end,
        _notes: v.notes,
      } as never);
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: invalidate,
  });
}

/** Owner/Gestor: evento de garagem, criado diretamente para um motorista. */
export function useCreateGarageEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: {
      driverId: string;
      title: string;
      cityId: string;
      originCityId: string;
      start: string;
      end: string;
      notes: string | null;
      override: boolean;
      /** Persiste a escolha atual; false nunca pode cair no valor por defeito da base de dados. */
      roundTrip: boolean;
    }) => {
      const { data, error } = await supabase.rpc("create_garage_event", {
        _driver_id: v.driverId,
        _title: v.title,
        _city_id: v.cityId,
        _origin_city_id: v.originCityId,
        _start: v.start,
        _end: v.end,
        _notes: v.notes,
        _override: v.override,
        _round_trip: v.roundTrip,
      } as never);
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export type RecurrenceFreq = Database["public"]["Enums"]["recurrence_freq"];

export const RECURRENCE_LABEL: Record<RecurrenceFreq, string> = {
  daily: "Todos os dias",
  weekly: "Todas as semanas",
  monthly: "Todos os meses",
  yearly: "Todos os anos",
};

/** Série recorrente: cada ocorrência é avaliada e atribuída de forma independente. */
export function useCreateServiceSeries() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (
      v: ServiceRequestInput & { frequency: RecurrenceFreq; until: string | null; weekdays?: number[] },
    ) => {
      const { data, error } = await supabase.rpc("create_service_series", {
        _administrator_id: v.administratorId,
        _title: v.title,
        _type: v.type,
        _city_id: v.cityId,
        _origin_city_id: v.originCityId,
        _start: v.start,
        _end: v.end,
        _notes: v.notes,
        _freq: v.frequency,
        _until: v.until,
        _tag_id: v.tagId,
        _round_trip: v.roundTrip,
        _event_kind_key: v.eventKindKey ?? null,
        _weekdays: v.weekdays?.length ? v.weekdays : null,
      } as never);
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export type SeriesScope = "future" | "all";

/** Edita esta e as seguintes, ou toda a série; cada ocorrência reavalia o motorista. */
export function useUpdateServiceSeries() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: {
      id: string;
      scope: SeriesScope;
      title: string;
      type: Database["public"]["Enums"]["activity_type"];
      cityId: string | null;
      originCityId: string | null;
      startTime: string;
      durationMinutes: number;
      notes: string | null;
      tagId: string;
      roundTrip: boolean;
      eventKindKey?: string;
    }) => {
      const { error } = await supabase.rpc("update_service_series", {
        _id: v.id,
        _scope: v.scope,
        _title: v.title,
        _type: v.type,
        _city_id: v.cityId,
        _origin_city_id: v.originCityId,
        _start_time: v.startTime,
        _duration_minutes: v.durationMinutes,
        _notes: v.notes,
        _tag_id: v.tagId,
        _round_trip: v.roundTrip,
        _event_kind_key: v.eventKindKey ?? null,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}


export function useCancelServiceSeries() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id: string; scope: SeriesScope }) => {
      const { error } = await supabase.rpc("cancel_service_series", {
        _id: v.id,
        _scope: v.scope,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/** Nomes dos utilizadores, para mostrar "Criado por" nos eventos. */
export function useDisplayNames() {
  return useQuery({
    queryKey: ["display_names"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("display_names");
      if (error) throw new Error(error.message);
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as { id: string; name: string }[]) map[row.id] = row.name;
      return map;
    },
  });
}

/** Owner/Gestor/Administrador: atribuição ou reatribuição manual de motorista. */
export function useAssignServiceDriver() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      driverId,
      override,
      expectedUpdatedAt,
    }: {
      id: string;
      driverId: string;
      override: boolean;
      expectedUpdatedAt?: string | undefined;
    }) => {
      const { error } = await supabase.rpc("assign_service_driver", {
        _id: id,
        _driver_id: driverId,
        _override: override,
        _expected_updated_at: expectedUpdatedAt ?? null,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export type DateRange = { from: Date; to: Date };

type ConfidentialRow = { activity_id: string; title: string; notes: string | null };

async function fetchConfidential(ids: string[] | null): Promise<Map<string, ConfidentialRow>> {
  const rows: ConfidentialRow[] = [];
  if (ids === null) {
    const res = await supabase.from("activity_confidential_content").select("activity_id, title, notes");
    if (res.error) throw new Error(res.error.message);
    rows.push(...(res.data ?? []));
  } else {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
    const results = await Promise.all(
      chunks.map((c) => supabase.from("activity_confidential_content").select("activity_id, title, notes").in("activity_id", c)),
    );
    for (const res of results) {
      if (res.error) throw new Error(res.error.message);
      rows.push(...(res.data ?? []));
    }
  }
  return new Map(rows.map((r) => [r.activity_id, r]));
}

/** Um único serviço (abertura a partir de notificações), sem carregar o histórico. */
export async function fetchActivityById(id: string): Promise<Activity | null> {
  const { data, error } = await supabase.from("activities").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const content = (await fetchConfidential([id])).get(id);
  return content ? ({ ...data, title: content.title, notes: content.notes } as Activity) : (data as Activity);
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function fetchActivities(range?: { from: string; to: string }): Promise<Activity[]> {
  if (range) {
    // Séries repetidas: cria só as datas em falta deste período, nunca anos à frente.
    await supabase.rpc("ensure_series_range" as never, { _from: range.from, _to: range.to } as never);
  }
  let query = supabase.from("activities").select("*").order("start_datetime");
  if (range) {
    query = query
      .lt("start_datetime", `${range.to}T23:59:59.999`)
      .gt("end_datetime", `${range.from}T00:00:00`);
  }
  const activities = ok<Activity[]>(await query);
  // Conteúdo reservado: só para os serviços carregados (as políticas decidem o que o perfil lê).
  const confidential = await fetchConfidential(range ? activities.map((a) => a.id) : null);
  return activities.map((activity) => {
    const content = confidential.get(activity.id);
    return content ? { ...activity, title: content.title, notes: content.notes } : activity;
  });
}

/**
 * Serviços. Sem período: todos os já criados (listas e Backoffice).
 * Com período: janela operacional fixa (últimas 5 semanas a +7 semanas, para
 * pendentes e avisos) mais o período visível ±7 dias. Ao navegar, os dados
 * anteriores ficam no ecrã até o novo período chegar.
 */
export function useActivities(range?: DateRange) {
  const all = useQuery({
    queryKey: ["activities", "all"],
    queryFn: () => fetchActivities(),
    enabled: !range,
  });
  const today = new Date();
  const base = { from: dayKey(addDaysLocal(today, -35)), to: dayKey(addDaysLocal(today, 49)) };
  const visible = range
    ? { from: dayKey(addDaysLocal(range.from, -7)), to: dayKey(addDaysLocal(range.to, 7)) }
    : null;
  const needsVisible = !!visible && (visible.from < base.from || visible.to > base.to);
  const [baseQuery, visibleQuery] = useQueries({
    queries: [
      { queryKey: ["activities", "range", base.from, base.to], queryFn: () => fetchActivities(base), enabled: !!range },
      {
        queryKey: ["activities", "range", visible?.from, visible?.to],
        queryFn: () => fetchActivities(visible!),
        enabled: needsVisible,
        placeholderData: keepPreviousData,
      },
    ],
  });
  const merged = useMemo(() => {
    if (!range) return undefined;
    if (!needsVisible || !visibleQuery.data) return baseQuery.data;
    const byId = new Map<string, Activity>();
    for (const a of baseQuery.data ?? []) byId.set(a.id, a);
    for (const a of visibleQuery.data) byId.set(a.id, a);
    return [...byId.values()].sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
  }, [!!range, needsVisible, baseQuery.data, visibleQuery.data]);
  if (!range) return all;
  return { ...baseQuery, data: merged, isFetching: baseQuery.isFetching || visibleQuery.isFetching };
}

function addDaysLocal(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * Serviços com uma nota que o perfil atual pode ler. Cada consulta devolve
 * apenas o identificador; as políticas das tabelas reservadas decidem quais
 * linhas existem para Motorista, Assistente, Administrador, Gestor e Owner.
 */
export function useActivityNoteIds() {
  return useQuery({
    queryKey: ["activity_note_ids"],
    queryFn: async () => {
      const [regularResult, privateResult, confidentialResult] = await Promise.all([
        supabase.from("activities").select("id").not("notes", "is", null).neq("notes", ""),
        supabase.from("activity_private_notes").select("activity_id"),
        supabase
          .from("activity_confidential_content")
          .select("activity_id")
          .not("notes", "is", null)
          .neq("notes", ""),
      ]);

      if (regularResult.error) throw regularResult.error;
      if (privateResult.error) throw privateResult.error;
      if (confidentialResult.error) throw confidentialResult.error;

      return Array.from(
        new Set([
          ...(regularResult.data ?? []).map((row) => row.id),
          ...(privateResult.data ?? []).map((row) => row.activity_id),
          ...(confidentialResult.data ?? []).map((row) => row.activity_id),
        ]),
      );
    },
  });
}

/**
 * Carga mensal efetiva usada na escolha de motorista. O servidor soma apenas
 * atividades já gravadas e usa o mesmo intervalo final do calendário.
 */
export function useDriverMonthlyWorkedMinutes(month: string, enabled = true) {
  return useQuery({
    enabled: enabled && /^\d{4}-\d{2}-\d{2}$/.test(month),
    queryKey: ["driver_monthly_worked_minutes", month.slice(0, 7)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("driver_monthly_worked_minutes", { _month: month });
      if (error) throw new Error(error.message);
      const totals: Record<string, number> = {};
      for (const row of data ?? []) totals[row.driver_id] = Number(row.worked_minutes ?? 0);
      return totals;
    },
    staleTime: 30_000,
  });
}

/**
 * Notas escritas por Assistentes/Administradores. Ficam numa área reservada:
 * Gestor e Proprietário não têm acesso (garantido pela base de dados).
 */
export function useActivityPrivateNote(activityId: string | null) {
  return useQuery({
    enabled: !!activityId,
    queryKey: ["activity_private_notes", activityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_private_notes")
        .select("body")
        .eq("activity_id", activityId!)
        .maybeSingle();
      if (error) throw error;
      return data?.body ?? null;
    },
  });
}

/** Conteúdo reservado da TAG base Admin; a RLS exclui Gestor e Proprietário. */
export function useActivityConfidentialContent(activityId: string | null) {
  return useQuery({
    enabled: !!activityId,
    queryKey: ["activity_confidential_content", activityId],
    queryFn: async () => {
      if (!activityId) return null;
      const { data, error } = await supabase
        .from("activity_confidential_content")
        .select("title, notes")
        .eq("activity_id", activityId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}



export function useTimeOff() {
  return useQuery({
    queryKey: ["time_off"],
    queryFn: async () =>
      ok<TimeOff[]>(await supabase.from("time_off").select("*").order("start_date")),
  });
}

export function useUnavailability() {
  return useQuery({
    queryKey: ["unavailability"],
    queryFn: async () =>
      ok<Unavailability[]>(
        await supabase.from("unavailability").select("*").order("start_datetime"),
      ),
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () =>
      ok<Database["public"]["Tables"]["notifications"]["Row"][]>(
        await supabase
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(30),
      ),
    refetchInterval: 30000,
  });
}

export type ActivityChangeValidation =
  Database["public"]["Tables"]["activity_change_validations"]["Row"];

/** Campo alterado num pedido de validação (valor anterior → novo). */
export type ValidationChange = { field: string; old: unknown; new: unknown };

/**
 * Pedidos de validação de alterações feitas por motoristas a eventos passados.
 * A política de acesso só devolve linhas a Proprietário e Gestor; para os
 * restantes perfis a lista vem sempre vazia (o fluxo é invisível ao motorista).
 */
export function useActivityValidations() {
  return useQuery({
    queryKey: ["activity_change_validations"],
    queryFn: async () =>
      ok<ActivityChangeValidation[]>(
        await supabase
          .from("activity_change_validations")
          .select("*")
          .order("changed_at", { ascending: false })
          .limit(100),
      ),
  });
}

/** Proprietário/Gestor: aprova (mantém) ou rejeita (repõe em silêncio) a alteração. */
export function useDecideActivityChange() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc("decide_activity_change", {
        _id: id,
        _approve: approve,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["activity_change_validations"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useAuditLog() {
  return useQuery({
    queryKey: ["audit_log"],
    queryFn: async () =>
      ok<Database["public"]["Tables"]["audit_log"]["Row"][]>(
        await supabase
          .from("audit_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
      ),
  });
}


function useInvalidate() {
  const qc = useQueryClient();
  return () => (
    // A fila de email é escrita pela base de dados quando um serviço passa a
    // ter motorista ou muda de motorista; aqui só se entrega ao backend ativo.
    void flushEmailQueue().catch(() => {}),
    Promise.all([
      // Só o que um serviço/ausência altera; o resto chega pela sincronização em tempo real.
      qc.invalidateQueries({ queryKey: ["activities"] }),
      qc.invalidateQueries({ queryKey: ["activity_note_ids"] }),
      qc.invalidateQueries({ queryKey: ["activity_private_notes"] }),
      qc.invalidateQueries({ queryKey: ["activity_confidential_content"] }),
      qc.invalidateQueries({ queryKey: ["time_off"] }),
      qc.invalidateQueries({ queryKey: ["unavailability"] }),
      qc.invalidateQueries({ queryKey: ["notifications"] }),
      qc.invalidateQueries({ queryKey: ["driver_monthly_worked_minutes"] }),
      qc.invalidateQueries({ queryKey: ["cities"] }),
    ])
  );
}

/**
 * Justificação obrigatória dos tipos de evento sujeitos a aprovação.
 * Guardada no próprio evento e registada na auditoria.
 */
export function useSetEventJustification() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id: string; justification: string }) => {
      const { error } = await supabase.rpc("set_event_justification", {
        _id: v.id,
        _justification: v.justification,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/** Decisão do Gestor ou do Proprietário: basta um dos dois aprovar ou rejeitar. */
export function useDecideEventApproval() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id: string; approve: boolean; note?: string | null }) => {
      const { error } = await supabase.rpc("decide_event_approval", {
        _id: v.id,
        _approve: v.approve,
        ...(v.note ? { _note: v.note } : {}),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/**
 * Decisão do Gestor/Proprietário sobre um ajuste de ocupação com motivo
 * «Outros». Basta uma decisão: o ajuste é aplicado ou descartado.
 */
export function useDecideOccupationAdjustment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc("decide_occupation_adjustment", {
        _id: v.id,
        _approve: v.approve,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useSaveActivity() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      values,
      expectedUpdatedAt,
    }: {
      id?: string | undefined;
      values: ActivityInsert | ActivityUpdate;
      expectedUpdatedAt?: string | undefined;
    }) => {
      if (!id) {
        const res = await supabase
          .from("activities")
          .insert(values as ActivityInsert)
          .select()
          .single();
        if (res.error) throw new Error(res.error.message);
        return res.data;
      }
      // Optimistic locking: the row must still be the version this form loaded.
      let q = supabase
        .from("activities")
        .update(values as ActivityUpdate)
        .eq("id", id);
      if (expectedUpdatedAt) q = q.eq("updated_at", expectedUpdatedAt);
      const res = await q.select();
      if (res.error) throw new Error(res.error.message);
      if (!res.data || res.data.length === 0) {
        const current = await supabase.from("activities").select("id").eq("id", id).maybeSingle();
        throw new Error(
          current.data
            ? CONCURRENT_EDIT_MESSAGE
            : "Este serviço já não existe - foi eliminado por outro utilizador.",
        );
      }
      return res.data[0];
    },
    onSuccess: invalidate,
  });
}

/**
 * Cancela um serviço através da RPC única: guarda quem cancelou, com que
 * perfil, a data/hora e a justificação (obrigatória para o motorista).
 */
export function useCancelActivity() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: string | { id: string; reason?: string | null }) => {
      const id = typeof v === "string" ? v : v.id;
      const reason = typeof v === "string" ? null : (v.reason ?? null);
      const { error } = await supabase.rpc("cancel_activity", {
        _id: id,
        _reason: reason,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/**
 * Resumo PT-PT da reatribuição automática provocada por uma ausência/férias.
 * Devolve null quando não houve serviços afetados.
 */
export async function timeOffReassignmentSummary(id: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("timeoff_last_summary", { _timeoff_id: id });
  if (error || !data || typeof data !== "object") return null;
  const s = data as Record<string, number>;
  const n = (k: string) => Number(s[k] ?? 0);
  const lines: string[] = [];
  const plural = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  if (n("reassigned") > 0)
    lines.push(`${plural(n("reassigned"), "serviço foi reatribuído", "serviços foram reatribuídos")} automaticamente.`);
  if (n("restored") > 0)
    lines.push(`${plural(n("restored"), "serviço voltou", "serviços voltaram")} ao motorista original.`);
  if (n("pending_manual") > 0)
    lines.push(`${plural(n("pending_manual"), "serviço aguarda", "serviços aguardam")} atribuição manual.`);
  if (n("kept") > 0)
    lines.push(
      `${plural(n("kept"), "serviço manteve", "serviços mantiveram")} a atribuição atual por indisponibilidade.`,
    );
  if (n("manual_review") > 0)
    lines.push(`${plural(n("manual_review"), "evento precisa", "eventos precisam")} de revisão manual.`);
  return lines.length ? lines.join("\n") : null;
}

export function useRequestTimeOff() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (values: Database["public"]["Tables"]["time_off"]["Insert"]) => {
      const res = await supabase.from("time_off").insert(values).select("id");
      const rows = assertWritten(res, "Não foi possível registar o período (sem permissão).") as {
        id: string;
      }[];
      return await timeOffReassignmentSummary(rows[0]!.id);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTimeOff() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      values,
      expectedUpdatedAt,
    }: {
      id: string;
      values: Database["public"]["Tables"]["time_off"]["Update"];
      expectedUpdatedAt?: string | undefined;
    }) => {
      let q = supabase.from("time_off").update(values).eq("id", id);
      if (expectedUpdatedAt) q = q.eq("updated_at", expectedUpdatedAt);
      const res = await q.select("id");
      if (res.error) throw new Error(res.error.message);
      if (!res.data || res.data.length === 0) {
        throw new Error(
          expectedUpdatedAt
            ? CONCURRENT_EDIT_MESSAGE
            : "Não foi possível atualizar o período (sem permissão).",
        );
      }
      return await timeOffReassignmentSummary(id);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTimeOff() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.from("time_off").delete().eq("id", id).select("id");
      assertWritten(res, "Não foi possível eliminar o período (sem permissão).");
      return await timeOffReassignmentSummary(id);
    },
    onSuccess: invalidate,
  });
}


export function useAddUnavailability() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (values: Database["public"]["Tables"]["unavailability"]["Insert"]) => {
      const res = await supabase.from("unavailability").insert(values).select("id");
      assertWritten(res, "Não foi possível registar o período (sem permissão).");
    },
    onSuccess: invalidate,
  });
}

export function useUpdateUnavailability() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      values,
      expectedUpdatedAt,
    }: {
      id: string;
      values: Database["public"]["Tables"]["unavailability"]["Update"];
      expectedUpdatedAt?: string | undefined;
    }) => {
      let q = supabase.from("unavailability").update(values).eq("id", id);
      if (expectedUpdatedAt) q = q.eq("updated_at", expectedUpdatedAt);
      const res = await q.select("id");
      if (res.error) throw new Error(res.error.message);
      if (!res.data || res.data.length === 0) {
        throw new Error(
          expectedUpdatedAt
            ? CONCURRENT_EDIT_MESSAGE
            : "Não foi possível atualizar o período (sem permissão).",
        );
      }
    },
    onSuccess: invalidate,
  });
}

export function useDeleteUnavailability() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.from("unavailability").delete().eq("id", id).select("id");
      assertWritten(res, "Não foi possível eliminar o período (sem permissão).");
    },
    onSuccess: invalidate,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("notifications").update({ read: true }).in("id", ids);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useDismissNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("notifications").delete().in("id", ids);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}


/**
 * Ajuste de ocupação: operação única usada pelo formulário e pelo arrasto no
 * calendário. As permissões são verificadas num só sítio (a mesma regra dos
 * restantes fluxos) e o âmbito da série é escolhido na confirmação.
 */
export function useAdjustOccupation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      start,
      end,
      reasonId,
      scope = "one",
      justification = null,
    }: {
      id: string;
      start: string | null;
      end: string | null;
      /** Motivo do ajuste; obrigatório sempre que a deslocação é alterada. */
      reasonId: string | null;
      /** "one" = apenas esta data; "future" = esta e as datas seguintes da série. */
      scope?: "one" | "future";
      /** Obrigatória nos motivos sujeitos a aprovação (por exemplo, «Outros»). */
      justification?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("adjust_activity_occupation", {
        _id: id,
        _start: start,
        _end: end,
        _reason_id: start || end ? reasonId : null,
        _scope: scope,
        _justification: justification,
      } as never);
      if (error) throw new Error(error.message);
      return (data as number) ?? 1;
    },
    onSuccess: invalidate,
  });
}

/**
 * Creates a destination straight from the service form when it does not exist
 * yet. Travel time stays unset and owners/managers get notified to configure
 * it; an existing city with the same name is reused instead of duplicated.
 */
export function useCreatePendingCity() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc("create_city_pending", { _name: name });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export type TravelAdjustReason =
  Database["public"]["Tables"]["travel_adjust_reasons"]["Row"];

/** Motivos de ajuste da deslocação, geridos globalmente pelo Proprietário. */
export function useAdjustReasons() {
  return useQuery({
    queryKey: ["travel_adjust_reasons"],
    queryFn: async () =>
      ok<TravelAdjustReason[]>(
        await supabase
          .from("travel_adjust_reasons")
          .select("*")
          .order("sort_order")
          .order("label"),
      ),
  });
}

function useInvalidateReasons() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["travel_adjust_reasons"] });
}

export function useSaveAdjustReason() {
  const invalidate = useInvalidateReasons();
  return useMutation({
    mutationFn: async (v: {
      id?: string | undefined;
      label: string;
      active?: boolean | undefined;
      sortOrder?: number | undefined;
    }) => {
      const values = {
        label: v.label.trim(),
        ...(v.active === undefined ? {} : { active: v.active }),
        ...(v.sortOrder === undefined ? {} : { sort_order: v.sortOrder }),
      };
      const res = v.id
        ? await supabase.from("travel_adjust_reasons").update(values).eq("id", v.id).select("id")
        : await supabase.from("travel_adjust_reasons").insert(values).select("id");
      assertWritten(res, "O motivo não foi gravado (apenas o Proprietário pode configurar motivos).");
    },
    onSuccess: invalidate,
  });
}

export function useDeleteAdjustReason() {
  const invalidate = useInvalidateReasons();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.from("travel_adjust_reasons").delete().eq("id", id).select("id");
      assertWritten(res, "O motivo não foi eliminado (apenas o Proprietário pode eliminar motivos).");
    },
    onSuccess: invalidate,
  });
}

export function useSaveCity() {

  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      values,
      expectedUpdatedAt,
    }: {
      id?: string | undefined;
      values: Database["public"]["Tables"]["cities"]["Insert"];
      expectedUpdatedAt?: string | undefined;
    }) => {
      if (!id) {
        const res = await supabase.from("cities").insert(values).select("id");
        assertWritten(res, "A cidade não foi gravada (sem permissão).");
        return;
      }
      let q = supabase.from("cities").update(values).eq("id", id);
      if (expectedUpdatedAt) q = q.eq("updated_at", expectedUpdatedAt);
      const res = await q.select("id");
      if (res.error) throw new Error(res.error.message);
      if (!res.data || res.data.length === 0) throw new Error(CONCURRENT_EDIT_MESSAGE);
    },
    onSuccess: invalidate,
  });
}

/**
 * Cities are never hard-deleted: historical activities reference them, so
 * removal only flips `active`. Removed cities have no user-facing restore flow.
 */
export function useSetCityActive() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await supabase.from("cities").update({ active }).eq("id", id).select("id");
      assertWritten(res, "Não foi possível atualizar a cidade (sem permissão).");
    },
    onSuccess: invalidate,
  });
}



export type AppRoleValue = Database["public"]["Enums"]["app_role"];

/**
 * Owner-only: sets the profile (role) of an account and, for driver/assistant
 * profiles, links the account to the matching record in the same operation.
 * Links from other profiles are always released first, so a person is never
 * attached to two records at once. Records themselves are kept (history).
 */
export function useAssignUserProfile() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      role,
      link,
      personName,
    }: {
      userId: string;
      role: AppRoleValue;
      /** existing record id, "new" to create one, or undefined for no link */
      link?: string | undefined;
      personName: string;
    }) => {
      const del = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (del.error) throw new Error(del.error.message);
      const ins = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (ins.error) throw new Error(ins.error.message);

      // Release previous links so the account maps to a single record.
      const unlinkDriver = await supabase
        .from("drivers")
        .update({ user_id: null })
        .eq("user_id", userId);
      if (unlinkDriver.error) throw new Error(unlinkDriver.error.message);
      const unlinkAssistant = await supabase
        .from("assistants")
        .update({ user_id: null })
        .eq("user_id", userId);
      if (unlinkAssistant.error) throw new Error(unlinkAssistant.error.message);

      if ((role === "driver" || role === "assistant") && link) {
        const table = role === "driver" ? "drivers" : "assistants";
        if (link === "new") {
          const res = await supabase
            .from(table)
            .insert({ name: personName || "Sem nome", user_id: userId })
            .select("id");
          assertWritten(res, "A ficha não foi criada (sem permissão).");
        } else {
          const res = await supabase
            .from(table)
            .update({ user_id: userId })
            .eq("id", link)
            .select("id");
          assertWritten(res, "A ficha não foi ligada (sem permissão).");
        }
      }
    },
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["user_roles"] });
      void qc.invalidateQueries({ queryKey: ["profiles"] });
      void qc.invalidateQueries({ queryKey: ["drivers"] });
      void qc.invalidateQueries({ queryKey: ["assistants"] });
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () =>
      ok<Database["public"]["Tables"]["profiles"]["Row"][]>(
        await supabase.from("profiles").select("*").order("name"),
      ),
  });
}

export function useUserRoles() {
  return useQuery({
    queryKey: ["user_roles"],
    queryFn: async () =>
      ok<Database["public"]["Tables"]["user_roles"]["Row"][]>(
        await supabase.from("user_roles").select("*"),
      ),
  });
}

export function useSetProfileActive() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("profiles").update({ active }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

/** Owner-only: permanently removes an account still pending profile assignment. */
export function useDeletePendingAccount() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const run = useServerFn(deletePendingAccount);
  return useMutation({
    mutationFn: async (userId: string) => {
      await run({ data: { userId } });
    },
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["profiles"] });
      void qc.invalidateQueries({ queryKey: ["user_roles"] });
    },
  });
}

/** Owner-only: permanently removes a user account, preserving history. */
export function useDeleteUserAccount() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const run = useServerFn(deleteUserAccount);
  return useMutation({
    mutationFn: async (userId: string) => {
      await run({ data: { userId } });
    },
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["profiles"] });
      void qc.invalidateQueries({ queryKey: ["user_roles"] });
      void qc.invalidateQueries({ queryKey: ["drivers"] });
      void qc.invalidateQueries({ queryKey: ["assistants"] });
    },
  });
}

/** Owner/manager: deletes an account-less driver/assistant record without history. */
export function useDeleteUnlinkedRecord() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const run = useServerFn(deleteUnlinkedRecord);
  return useMutation({
    mutationFn: async (input: { kind: "driver" | "assistant"; id: string }) => {
      await run({ data: input });
    },
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["drivers"] });
      void qc.invalidateQueries({ queryKey: ["assistants"] });
    },
  });
}




/* ------------------------------------------------------------------ */
/* Drivers                                                             */
/* ------------------------------------------------------------------ */

export function useSaveDriver() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      expectedUpdatedAt,
      values,
    }: {
      id?: string;
      expectedUpdatedAt?: string;
      values: Database["public"]["Tables"]["drivers"]["Update"];
    }) => {
      if (!id) {
        const res = await supabase
          .from("drivers")
          .insert(values as Database["public"]["Tables"]["drivers"]["Insert"])
          .select("id");
        return assertWritten(res, "O motorista não foi gravado (sem permissão).")[0];
      }
      let q = supabase.from("drivers").update(values).eq("id", id);
      if (expectedUpdatedAt) q = q.eq("updated_at", expectedUpdatedAt);
      const res = await q.select("id");
      if (res.error) throw new Error(res.error.message);
      if (!res.data || res.data.length === 0) throw new Error(CONCURRENT_EDIT_MESSAGE);
      return res.data[0];
    },
    onSuccess: invalidate,
  });
}

/**
 * Drivers are never hard-deleted: activities, absences and audit rows point at
 * them. "Eliminar" only flips `active`, so the whole history stays intact.
 */
export function useSetDriverActive() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await supabase.from("drivers").update({ active }).eq("id", id).select("id");
      assertWritten(res, "Não foi possível atualizar o motorista (sem permissão).");
    },
    onSuccess: invalidate,
  });
}


/* ------------------------------------------------------------------ */
/* Team management (single source of truth: profiles + linked records) */
/* ------------------------------------------------------------------ */

export function useSaveAssistant() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: Database["public"]["Tables"]["assistants"]["Update"];
    }) => {
      const res = await supabase.from("assistants").update(values).eq("id", id).select("id");
      assertWritten(res, "Não foi possível guardar o assistente (sem permissão).");
    },
    onSuccess: invalidate,
  });
}

/**
 * Owner/Gestor: altera nome e email de contacto de uma conta.
 * O email aqui é o email de contacto no perfil; o email de autenticação
 * (credencial de acesso) só muda pelo fluxo de recuperação da própria pessoa.
 */
export function useSaveProfileName() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, email }: { id: string; name: string; email?: string }) => {
      const res = await supabase
        .from("profiles")
        .update({ name, ...(email === undefined ? {} : { email }) })
        .eq("id", id)
        .select("id");
      assertWritten(res, "Não foi possível guardar os dados (sem permissão).");
    },
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

/** Nome de cada Administrador por id - usado para identificar o serviço no calendário. */
export function useAdministratorNames(): Record<string, string> {
  const { data: administrators = [] } = useAdministrators();
  const key = administrators.map((a) => `${a.id}:${a.name}`).join("|");
  return useMemo(() => {
    const map: Record<string, string> = {};
    for (const part of key ? key.split("|") : []) {
      const i = part.indexOf(":");
      map[part.slice(0, i)] = part.slice(i + 1);
    }
    return map;
  }, [key]);
}

/**
 * Motorista: cria na sua própria agenda um evento de serviço. O Administrador é
 * obrigatório porque o mesmo motorista trabalha para vários Administradores.
 */
export function useCreateDriverService() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: {
      administratorId: string;
      title: string;
      type: Database["public"]["Enums"]["activity_type"];
      cityId: string;
      originCityId: string;
      start: string;
      end: string;
      notes: string | null;
      tagId: string;
      roundTrip: boolean;
    }) => {
      const { data, error } = await supabase.rpc("create_driver_service", {
        _administrator_id: v.administratorId,
        _title: v.title,
        _type: v.type,
        _city_id: v.cityId,
        _origin_city_id: v.originCityId,
        _start: v.start,
        _end: v.end,
        _notes: v.notes,
        _tag_id: v.tagId,
        _round_trip: v.roundTrip,
      } as never);
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: invalidate,
  });
}
