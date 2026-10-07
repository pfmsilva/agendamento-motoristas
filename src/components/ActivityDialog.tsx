import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, Info, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/DateInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CityCombobox } from "@/components/CityCombobox";
import { AvailabilityWarning } from "@/components/AvailabilityWarning";
import { DriverStatusBadge } from "@/components/DriverStatusBadge";
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
import {
  useAdjustOccupation,
  useAdjustReasons,
  useAddUnavailability,
  useCancelActivity,
  useCancelServiceAuto,
  useCreateGarageEvent,
  useCreatePendingCity,
  useDecideEventApproval,
  useDecideOccupationAdjustment,
  useSetEventJustification,
  useCreateServiceAuto,
  useCreateServiceSeries,
  useUpdateServiceSeries,
  useCancelServiceSeries,
  useDisplayNames,
  useAdministratorNames,
  useEventTags,
  useEventKindTags,
  useRequestTimeOff,
  RECURRENCE_LABEL,
  type RecurrenceFreq,
  type SeriesScope,
  useSaveActivity,
  useActivityConfidentialContent,
  useActivityPrivateNote,

  useUpdateServiceAuto,
  useTravelRoutes,
  type Administrator,
} from "@/lib/data";

import {
  ASSIGNMENT_LABEL,
  assignmentAttempts,
  cityTravelKey,
  computeOccupation,
  routeLabel,
  driverBadge,
  effectiveEnd,
  effectiveStart,
  evaluateAvailability,
  fmtDateTime,
  fmtMinutes,
  hidesAdminContent,
  sortByAvailability,
  toDateInput,
  toLocalInput,
  TIMEOFF_TYPE_LABEL,
  type Activity,
  type ActivityStatus,
  type ActivityType,
  type City,
  type Driver,
  type DriverDataset,
} from "@/lib/scheduling";
import { errorMessagePt } from "@/lib/errors";
import { missingFieldsMessage } from "@/lib/required-fields";
import { RecurrenceFields } from "@/components/RecurrenceFields";
import { occurrenceDates, openEndedUntil, recurrenceLimitError, runOccurrences } from "@/lib/recurrence";
import { AdministratorCombobox } from "@/components/AdministratorCombobox";
import { useAuth } from "@/lib/auth";
import { TitleField, useTitleField } from "@/components/TitleField";
import { syncEndWithStart } from "@/lib/datetime-sync";


/**
 * Tipo de evento escolhido no formulário único "Novo serviço". A lista é
 * configurada pelo Proprietário no backoffice, por isso é uma chave livre:
 * "garage" e "absence" mantêm regras próprias e os restantes tipos
 * comportam-se como serviços de Administração.
 */
type EventKind = string;
type AbsenceKind = "holiday" | "sick" | "personal" | "other";

/** Perfil de quem cancelou, para o bloco informativo de cancelamento. */
const CANCEL_ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário",
  manager: "Gestor",
  administrator: "Administrador",
  assistant: "Assistente",
  driver: "Motorista",
};



export type ActivityDraft = {
  id?: string | undefined;
  driverId?: string | undefined;
  start?: Date | undefined;
  end?: Date | undefined;
  cityId?: string | undefined;
  originCityId?: string | undefined;
  origin?: string | undefined;
  destination?: string | undefined;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: ActivityDraft | null;
  activity?: Activity | null;
  drivers: Driver[];
  data: DriverDataset;
  cities: City[];
  canOverride: boolean;
  /**
   * "full" = Owner/Gestor: escolhe o motorista manualmente.
   * "request" = Assistente/Administrador: pede o serviço; o motorista sai da hierarquia do Administrador.
   * "adjust" = Motorista: só altera a sua janela de ocupação.
   */
  mode?: "full" | "adjust" | "request";
  /** Motorista sem permissão de criação: consulta apenas, sem alterar a ocupação. */
  readOnly?: boolean;
  /** occupation window proposed by a calendar drag, pre-filled into the adjust form */
  pendingAdjust?: { start: Date; end: Date } | null;
  /** Gestor/Proprietário: abrir o ajuste de ocupação de um evento de garagem. */
  onAdjustOccupation?: ((a: Activity) => void) | undefined;
  /** Administradores para quem quem está a criar pode pedir serviços (modo "request"). */
  adminOptions?: Administrator[];
  /** Todos os Administradores, para mostrar o nome do contexto do serviço. */
  administrators?: Administrator[];
};

export function ActivityDialog({
  open,
  onOpenChange,
  draft,
  activity,
  drivers,
  data,
  cities,
  canOverride,
  mode = "full",
  readOnly = false,
  pendingAdjust = null,
  onAdjustOccupation,
  adminOptions = [],
  administrators = [],
}: Props) {
  const save = useSaveActivity();
  const cancel = useCancelActivity();
  const createAuto = useCreateServiceAuto();
  const updateAuto = useUpdateServiceAuto();
  const cancelAuto = useCancelServiceAuto();
  const adjust = useAdjustOccupation();
  const createCity = useCreatePendingCity();
  const createSeries = useCreateServiceSeries();
  const updateSeries = useUpdateServiceSeries();
  const cancelSeries = useCancelServiceSeries();
  const createGarage = useCreateGarageEvent();
  const createTimeOff = useRequestTimeOff();
  const createUnavail = useAddUnavailability();
  const { data: displayNames } = useDisplayNames();
  const administratorNames = useAdministratorNames();
  const serviceAdministratorName = activity?.event_kind === "administration" && activity.administrator_id
    ? administratorNames[activity.administrator_id] ??
      administrators.find((o) => o.id === activity.administrator_id)?.name ??
      adminOptions.find((o) => o.id === activity.administrator_id)?.name
    : undefined;
  const { data: adjustReasons = [] } = useAdjustReasons();
  const { data: eventTags = [] } = useEventTags();
  const { data: eventKindTags = [] } = useEventKindTags();
  const { user } = useAuth();
  const privilegedCreator = user?.role === "manager" || user?.role === "owner";
  const activeReasons = adjustReasons.filter((r) => r.active);
  const serviceTags = eventTags.filter(
    (tag) => (tag.active || tag.id === activity?.tag_id) && tag.system_key !== "garage" && tag.system_key !== "vacation",
  );
  const garageEnabled = eventTags.some((tag) => tag.active && tag.system_key === "garage");
  const vacationEnabled = eventTags.some((tag) => tag.active && tag.system_key === "vacation");
  const isRequest = mode === "request";




  const [title, setTitle] = useState("");
  const titleField = useTitleField(title);
  const [type, setType] = useState<ActivityType>("trip");
  const [driverId, setDriverId] = useState("");
  const [administratorId, setAdministratorId] = useState("");
  const [cityId, setCityId] = useState<string>("");
  const [originCityId, setOriginCityId] = useState<string>("");
  const [roundTrip, setRoundTrip] = useState(true);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  
  const [notes, setNotes] = useState("");
  // Tipos de evento sujeitos a aprovação (ex.: "Outros") exigem justificação.
  const [justification, setJustification] = useState("");
  const privateNote = useActivityPrivateNote(activity?.id ?? null);
  const confidentialContent = useActivityConfidentialContent(activity?.id ?? null);
  const adminTagId = eventTags.find((tag) => tag.system_key === "admin")?.id ?? null;
  const confidentialAdmin = Boolean(activity && adminTagId && activity.tag_id === adminTagId);
  // Regra única: só Gestor e Proprietário perdem título e notas de Administração.
  // Motorista atribuído, Assistente e Administrador continuam a vê-los.
  const hideConfidential = confidentialAdmin && hidesAdminContent(user?.role);

  const [status, setStatus] = useState<ActivityStatus>("confirmed");
  const [override, setOverride] = useState(false);
  const [adjStart, setAdjStart] = useState("");
  const [adjEnd, setAdjEnd] = useState("");
  const [adjReasonId, setAdjReasonId] = useState("");
  const [adjJustification, setAdjJustification] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  // Version of the record when this dialog was seeded - lets us warn the user
  // when somebody else changed the same service in the meantime.
  const [seededVersion, setSeededVersion] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Cancelamento de uma ocorrência de série: apenas esta ou esta e as futuras.
  const [cancelScopeOpen, setCancelScopeOpen] = useState(false);
  // Motorista: o cancelamento exige sempre uma justificação.
  const [cancelReasonOpen, setCancelReasonOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  // Recorrência: cada ocorrência é um serviço independente, com atribuição própria.
  const [repeat, setRepeat] = useState(false);
  const [freq, setFreq] = useState<RecurrenceFreq>("weekly");
  const [until, setUntil] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  // O âmbito da recorrência nunca é pedido dentro do formulário: é confirmado
  // no momento em que o utilizador grava (tal como no cancelamento).
  const [saveScopeOpen, setSaveScopeOpen] = useState(false);
  const [adjustScopeOpen, setAdjustScopeOpen] = useState(false);
  /** Qual a ação que espera pelo âmbito da série: ajustar ou repor. */
  const [scopeAction, setScopeAction] = useState<"adjust" | "reset">("adjust");

  // Formulário único: o tipo escolhido decide campos, regras e gravação.
  // Para Proprietário/Gestor o tipo pré-selecionado é sempre Garagem.
  const [eventKind, setEventKind] = useState<EventKind>("garage");
  // A TAG deixou de ser escolhida no formulário: deriva sempre da associação
  // TAG ↔ tipo de evento configurada pelo Proprietário no backoffice.
  const mappedTagId = eventKindTags.find((k) => k.kind === eventKind)?.tag_id ?? "";
  // Tipos ativos configurados pelo Proprietário; novos tipos aparecem aqui sem alterações ao código.
  const kindOptions = eventKindTags
    .filter((k) => k.active)
    .filter((k) => {
      const mappedTagActive = eventTags.some((tag) => tag.id === k.tag_id && tag.active);
      return (
        mappedTagActive &&
        (k.kind !== "garage" || garageEnabled) &&
        (k.kind !== "absence" || vacationEnabled) &&
        (k.kind === "garage" || k.kind === "absence" || serviceTags.some((tag) => tag.id === k.tag_id))
      );
    });
  const activityKind: EventKind | null = activity
    ? (activity.event_kind_key ?? (activity.event_kind === "garage" ? "garage" : "administration"))
    : null;
  // O histórico não é reescrito: a TAG de um serviço existente só muda quando
  // o tipo de evento é efetivamente alterado na edição.
  const tagId = activity && activityKind === eventKind ? (activity.tag_id ?? mappedTagId) : mappedTagId;
  // Aprovação: o tipo de evento configurado pelo Proprietário decide se o
  // evento nasce "Pendente de aprovação" e exige justificação.
  const requiresApproval = Boolean(
    eventKindTags.find((k) => k.kind === eventKind)?.requires_approval,
  );
  const approvalStatus = activity?.approval_status ?? null;
  const canDecideApproval = privilegedCreator && approvalStatus === "pending";
  const setJustificationRpc = useSetEventJustification();
  const decideApproval = useDecideEventApproval();
  // Ajuste de ocupação com motivo sujeito a aprovação (ex.: «Outros»).
  const adjustNeedsApproval = Boolean(
    activeReasons.find((r) => r.id === adjReasonId)?.requires_approval,
  );
  const decideAdjustment = useDecideOccupationAdjustment();
  const canDecideAdjustment = privilegedCreator;
  const [absAllDay, setAbsAllDay] = useState(true);
  const [absStartDate, setAbsStartDate] = useState("");
  const [absEndDate, setAbsEndDate] = useState("");
  const [absStartTime, setAbsStartTime] = useState("09:00");
  const [absEndTime, setAbsEndTime] = useState("13:00");
  const [absKind, setAbsKind] = useState<AbsenceKind>("holiday");
  const [absReason, setAbsReason] = useState("");

  const changedElsewhere =
    !!activity && !!seededVersion && activity.updated_at !== seededVersion;

  useEffect(() => {
    if (!open) return;
    setServerError(null);
    setOverride(false);
    setSeededVersion(activity?.updated_at ?? null);
    if (activity) {
      setTitle(hideConfidential ? "" : (confidentialContent.data?.title ?? activity.title));
      setType(activity.type);
      setDriverId(activity.driver_id ?? "");
      setAdministratorId(activity.administrator_id ?? "");
      setCityId(activity.city_id ?? "");
      setOriginCityId(activity.origin_city_id ?? "");
      setRoundTrip(activity.round_trip ?? true);
      setStart(toLocalInput(new Date(activity.start_datetime)));
      setEnd(toLocalInput(new Date(activity.end_datetime)));
      
      setNotes(hideConfidential ? "" : (confidentialContent.data?.notes ?? activity.notes ?? privateNote.data ?? ""));
      setJustification(activity.justification ?? "");
      setStatus(activity.status);
      setAdjStart(toLocalInput(pendingAdjust?.start ?? effectiveStart(activity)));
      setAdjEnd(toLocalInput(pendingAdjust?.end ?? effectiveEnd(activity)));
      setAdjReasonId(activity.adjustment_reason_id ?? "");
      setAdjJustification(activity.adjustment_justification ?? "");
      

    } else {
      const s = draft?.start ?? new Date();
       const e = draft?.end ?? new Date(s.getTime() + 2 * 60 * 60 * 1000);
      const draftCity = draft?.cityId ? (cities.find((c) => c.id === draft.cityId) ?? null) : null;
      setTitle("");
      setType("trip");
      setDriverId(isRequest ? "" : (draft?.driverId ?? drivers[0]?.id ?? ""));
      setAdministratorId(adminOptions[0]?.id ?? "");
      setCityId(draftCity?.id ?? "");
      setOriginCityId(draft?.originCityId ?? "");
      setRoundTrip(true);
      setStart(toLocalInput(s));
      setEnd(toLocalInput(e));
      
      setNotes("");
      setJustification("");
      setStatus("confirmed");
      setAdjStart("");
      setAdjEnd("");
      setAdjReasonId("");
      
    }
    setRepeat(false);
    setFreq("weekly");
    setWeekdays([]);
    setUntil("");
    setSaveScopeOpen(false);
    setAdjustScopeOpen(false);
    // Tipo do formulário: Garagem por omissão no fluxo de criação do Gestor/Proprietário.
    setEventKind(
      activity
        ? (activity.event_kind_key ?? (activity.event_kind === "garage" ? "garage" : "administration"))
        : isRequest
          ? "administration"
          : garageEnabled
            ? "garage"
            : serviceTags.some((tag) => tag.active)
              ? "administration"
              : "absence",
    );
    {
      const s = activity ? new Date(activity.start_datetime) : (draft?.start ?? new Date());
      setAbsAllDay(true);
      setAbsStartDate(toDateInput(s));
      setAbsEndDate(toDateInput(s));
      setAbsStartTime("09:00");
      setAbsEndTime("13:00");
      setAbsKind("holiday");
      setAbsReason("");
    }

    // Re-seed only when the dialog opens for a different record / different drag
    // proposal - never on background refetches, which would wipe user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    activity?.id,
    draft,
    pendingAdjust?.start?.getTime(),
    pendingAdjust?.end?.getTime(),
    cities.length,
    drivers.length,
    adminOptions.length,
    reloadNonce,
    eventTags.length,
  ]);


  // A nota reservada chega numa segunda leitura; preenche o campo se ainda estiver vazio.
  useEffect(() => {
    if (!open || !activity || hideConfidential || activity.notes || !privateNote.data) return;
    setNotes((current) => (current === "" ? privateNote.data! : current));
  }, [open, activity, hideConfidential, privateNote.data]);

  useEffect(() => {
    if (!open || !activity || hideConfidential || !confidentialContent.data) return;
    setTitle(confidentialContent.data.title);
    setNotes(confidentialContent.data.notes ?? "");
  }, [open, activity?.id, hideConfidential, confidentialContent.data]);


  const isGarage = eventKind === "garage";
  const isAbsence = eventKind === "absence";
  /**
   * Serviços de Administração criados/editados pelo Gestor ou Proprietário têm
   * de indicar o Administrador a que pertencem, para ficarem visíveis no
   * contexto certo (Administrador e Assistente associado).
   */
  const showAdminPicker = !isAbsence && !isGarage && !isRequest && privilegedCreator;
  /** O título só existe no formulário (e só é validado) quando o campo está visível. */
  const showTitle = !isAbsence && !hideConfidential;
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  const city = cities.find((c) => c.id === cityId) ?? null;
  const originCity = cities.find((c) => c.id === originCityId) ?? null;
  const { data: travelRoutes = [] } = useTravelRoutes();
  const routeName = originCity && city ? routeLabel(cityTravelKey(originCity), cityTravelKey(city), cities) : null;

  const occupation = useMemo(() => {
    if (isAbsence) return null;
    if (!startDate || !endDate || endDate <= startDate) return null;
    return computeOccupation(startDate, endDate, originCity, city, travelRoutes, roundTrip);
  }, [start, end, cityId, originCityId, travelRoutes, isAbsence, isGarage, roundTrip]);



  const availability = useMemo(() => {
    if (!driverId || !occupation || status === "cancelled") return null;
    return evaluateAvailability(driverId, occupation.start, occupation.end, data, {
      travelUnknown: occupation.travelUnknown,
      cityName: city?.name ?? null,
      ...(activity?.id ? { ignoreActivityId: activity.id } : {}),
    });
  }, [driverId, occupation, data, status, activity?.id, city?.name]);

  const blocked = availability?.status === "UNAVAILABLE";
  const primaryConflict = availability?.conflicts[0] ?? null;

  const overrideLabel =
    primaryConflict?.kind === "timeoff"
      ? "Confirmo que o motorista está de férias/ausente neste período e quero avançar"
      : primaryConflict?.kind === "unavailability"
        ? "Confirmo que o motorista está indisponível neste período e quero avançar"
        : "Confirmo e quero guardar apesar da sobreposição de serviços";

  /** Status chip per driver for the currently chosen window - visible before picking. */
  const driverBadges = useMemo(() => {
    const map = new Map<string, ReturnType<typeof driverBadge>>();
    if (!occupation) return map;
    for (const d of drivers) {
      map.set(
        d.id,
        driverBadge(d.id, occupation.start, occupation.end, data, {
          ...(activity?.id ? { ignoreActivityId: activity.id } : {}),
        }),
      );
    }
    return map;
  }, [drivers, occupation, data, activity?.id]);

  // Escolha manual: disponíveis primeiro, indisponíveis a seguir (ordem de prioridade mantida).
  const orderedDrivers = useMemo(() => sortByAvailability(drivers, driverBadges), [drivers, driverBadges]);

  /** Driver view: warn when the adjusted occupation lands on the driver's own absence/unavailability. */
  const adjustAvailability = useMemo(() => {
    if (mode !== "adjust" || !activity || !activity.driver_id || !adjStart || !adjEnd) return null;
    const s = new Date(adjStart);
    const e = new Date(adjEnd);
    if (!(e > s)) return null;
    const res = evaluateAvailability(activity.driver_id, s, e, data, { ignoreActivityId: activity.id });
    const relevant = res.conflicts.filter((c) => c.kind === "timeoff" || c.kind === "unavailability");
    if (!relevant.length) return null;
    return { status: "UNAVAILABLE" as const, reasons: relevant.map((c) => c.message), conflicts: relevant };
  }, [mode, activity?.id, activity?.driver_id, adjStart, adjEnd, data]);

  const suggestions = useMemo(() => {
    if (!blocked || !occupation) return [];
    return drivers
      .filter(
        (d) =>
          d.id !== driverId &&
          d.active &&
          evaluateAvailability(d.id, occupation.start, occupation.end, data).status !== "UNAVAILABLE",
      )
      .slice(0, 4);
  }, [blocked, occupation, drivers, driverId, data]);

  /** Datas das ocorrências: uma só, ou todas as da recorrência escolhida. */
  const occurrenceStarts = (base: Date) =>
    repeat
      ? until
        ? occurrenceDates(base, freq, until)
        : occurrenceDates(base, freq, openEndedUntil(base), { cap: true })
      : [base];

  /** Cancela esta ocorrência, ou esta e todas as futuras da mesma série. */
  const runCancel = async (cancelScope: "one" | "future", reason?: string) => {
    if (!activity) return;
    try {
      if (activity.series_id && cancelScope === "future") {
        await cancelSeries.mutateAsync({ id: activity.id, scope: "future" });
        toast.success("Este evento e os seguintes da série foram cancelados.");
      } else {
        if (isRequest && !reason) await cancelAuto.mutateAsync(activity.id);
        else await cancel.mutateAsync({ id: activity.id, reason: reason ?? null });
        toast.success("Atividade cancelada (mantida para auditoria)");
      }
      setCancelScopeOpen(false);
      setCancelReasonOpen(false);
      setCancelReason("");
      onOpenChange(false);
    } catch (e) {
      setCancelScopeOpen(false);
      toast.error(errorMessagePt(e, "Não foi possível cancelar"));
    }
  };

  /** Resultado de uma criação repetida, com aviso das datas que ficaram por criar. */
  const reportSeries = (
    result: { created: number; failed: { date: Date; message: string }[] },
    okSingular: string,
  ) => {
    if (result.created > 0) {
      toast.success(
        result.created === 1
          ? okSingular
          : `${result.created} datas criadas. Cada uma é independente e tem a sua própria verificação de disponibilidade.`,
      );
    }
    if (result.failed.length) {
      const msg = `${result.failed.length} data(s) não foram criadas: ${result.failed
        .map((f) => `${f.date.toLocaleDateString("pt-PT")} (${errorMessagePt(new Error(f.message), "erro")})`)
        .join("; ")}`;
      setServerError(msg);
      toast.error(msg);
      return false;
    }
    return true;
  };

  /** Grava a alteração; numa série, o âmbito é o escolhido na confirmação. */
  const doSave = async (seriesScope: "one" | SeriesScope = "one") => {
    if (!startDate || !endDate) return;
    setSaveScopeOpen(false);
    const durationMs = endDate.getTime() - startDate.getTime();
    try {
      // Garagem: RPC própria, com local e deslocação, bloqueia o motorista.
      if (isGarage && !activity) {
        const result = await runOccurrences(occurrenceStarts(startDate), async (s) => {
          await createGarage.mutateAsync({
            driverId,
            title: title.trim(),
            cityId,
            originCityId,
            start: s.toISOString(),
            end: new Date(s.getTime() + durationMs).toISOString(),
            notes: notes || null,
            override: blocked ? override : false,
            roundTrip,
          });
        });
        if (reportSeries(result, "Evento de garagem criado")) onOpenChange(false);
        return;
      }



      if (isRequest) {
        const input = {
          administratorId,
          title: showTitle ? title.trim() : (activity?.title ?? ""),
          type,
          cityId: cityId || null,
          originCityId: originCityId || null,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          notes: notes || null,
          tagId,
          roundTrip,
          // Tipo configurado escolhido no formulário; fica gravado no serviço.
          eventKindKey: eventKind,
        };
        if (activity && activity.series_id && seriesScope !== "one") {
          await updateSeries.mutateAsync({
            id: activity.id,
            scope: seriesScope,
            title: input.title,
            type,
            cityId: input.cityId,
            originCityId: input.originCityId,
            startTime: `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`,
            durationMinutes: Math.round((endDate.getTime() - startDate.getTime()) / 60000),
            notes: input.notes,
            tagId,
            roundTrip,
            eventKindKey: eventKind,
          });
          toast.success("Série atualizada. Cada ocorrência foi reavaliada.");
        } else if (activity) {
          await updateAuto.mutateAsync({ id: activity.id, expectedUpdatedAt: activity.updated_at, ...input });
          toast.success("Serviço atualizado. A atribuição foi reavaliada.");
        } else if (repeat) {
          // Sem "Repetir até", a série fica sem fim: as ocorrências são criadas
          // por horizonte e prolongadas automaticamente.
          await createSeries.mutateAsync({
            ...input,
            frequency: freq,
            until: until || null,
            weekdays: freq === "weekly" ? weekdays : [],
          });
          toast.success(
            until
              ? "Série criada. Cada ocorrência recebe o seu motorista."
              : "Série sem fim criada. As datas seguintes aparecem à medida que são consultadas.",
          );
          onOpenChange(false);
          return;
        } else {
          const activityId = await createAuto.mutateAsync(input);
          if (requiresApproval && justification.trim() && activityId) {
            await setJustificationRpc.mutateAsync({
              id: activityId,
              justification: justification.trim(),
            });
          }
          toast.success(
            requiresApproval
              ? "Evento criado e enviado para aprovação do Gestor ou do Proprietário."
              : "Serviço criado. O motorista é atribuído automaticamente pela lista de prioridade.",
          );
        }
        onOpenChange(false);
        return;
      }
      const driverChanged = Boolean(driverId) && driverId !== (activity?.driver_id ?? "");
      const buildValues = (s: Date, e: Date) => ({
        // Sem campo de título visível, mantém o título existente em vez de o apagar.
        title: showTitle ? title.trim() : (activity?.title ?? ""),
        type,
        driver_id: driverId,
        city_id: cityId || null,
        origin_city_id: originCityId || null,
        round_trip: roundTrip,
        start_datetime: s.toISOString(),
        end_datetime: e.toISOString(),
        origin: originCity?.name ?? null,
        destination: city?.name ?? null,
        notes: notes || null,
        event_kind_key: eventKind,
        ...(isGarage ? {} : { tag_id: tagId || null }),
        // Serviço de Administração criado centralmente: fica ligado ao
        // Administrador escolhido (e ao Assistente que o serve).
        ...(showAdminPicker ? { administrator_id: administratorId || null } : {}),
        status,
        override_conflict: override,
        ...(requiresApproval ? { justification: justification.trim() || null } : {}),
        // Escolha manual pelo Owner/Gestor/Administrador: fica registada como atribuição manual.
        ...(driverChanged || !activity
          ? { assignment_status: "manual" as const, assigned_at: new Date().toISOString() }
          : {}),
      });
      if (!activity) {
        const result = await runOccurrences(occurrenceStarts(startDate), async (s) => {
          await save.mutateAsync({ values: buildValues(s, new Date(s.getTime() + durationMs)) });
        });
        if (reportSeries(result, "Atividade criada")) onOpenChange(false);
        return;
      }
      // Mesma operação de série usada pelo assistente: o âmbito vem da confirmação.
      if (activity.series_id && seriesScope !== "one") {
        await updateSeries.mutateAsync({
          id: activity.id,
          scope: seriesScope,
          title: showTitle ? title.trim() : (activity.title ?? ""),
          type,
          cityId: cityId || null,
          originCityId: originCityId || null,
          startTime: `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`,
          durationMinutes: Math.round((endDate.getTime() - startDate.getTime()) / 60000),
          notes: notes || null,
          tagId,
          roundTrip,
          eventKindKey: eventKind,
        });
        toast.success("Série atualizada. Cada ocorrência foi reavaliada.");
        onOpenChange(false);
        return;
      }
      await save.mutateAsync({
        id: activity.id,
        expectedUpdatedAt: activity.updated_at,
        values: buildValues(startDate, endDate),
      });
      toast.success("Atividade atualizada");
      onOpenChange(false);

    } catch (e) {
      const msg = errorMessagePt(e, "Não foi possível guardar a atividade");
      setServerError(msg);
      toast.error(msg);
    }
  };

  /** Ausência / indisponibilidade: usa exatamente o mesmo armazenamento do fluxo do motorista. */
  const saveAbsence = async () => {
    setServerError(null);
    const missing = missingFieldsMessage([
      { label: "motorista", filled: Boolean(driverId) },
      { label: "data", filled: Boolean(absStartDate) },
    ]);
    if (missing) {
      setServerError(missing);
      toast.error(missing);
      return;
    }
    const parseDay = (v: string) => {
      const [y, m, d] = v.split("-").map(Number);
      return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
    };
    try {
      if (absAllDay) {
        const baseStart = parseDay(absStartDate);
        const rawEnd = absEndDate && absEndDate >= absStartDate ? absEndDate : absStartDate;
        const spanDays = Math.round((parseDay(rawEnd).getTime() - baseStart.getTime()) / 86400000);
        const result = await runOccurrences(occurrenceStarts(baseStart), async (s) => {
          const e = new Date(s.getTime() + spanDays * 86400000);
          await createTimeOff.mutateAsync({
            driver_id: driverId,
            status: "approved",
            start_date: toDateInput(s),
            end_date: toDateInput(e),
            type: absKind,
            reason: absReason || null,
            notes: notes || null,
          });
        });
        if (!reportSeries(result, "Período registado - bloqueia a disponibilidade do motorista")) return;
      } else {
        const s0 = new Date(`${absStartDate}T${absStartTime}`);
        const e0 = new Date(`${absStartDate}T${absEndTime}`);
        if (e0 <= s0) {
          const msg = "A hora de fim tem de ser posterior à de início.";
          setServerError(msg);
          toast.error(msg);
          return;
        }
        const dur = e0.getTime() - s0.getTime();
        const result = await runOccurrences(occurrenceStarts(s0), async (s) => {
          await createUnavail.mutateAsync({
            driver_id: driverId,
            status: "active",
            start_datetime: s.toISOString(),
            end_datetime: new Date(s.getTime() + dur).toISOString(),
            reason: absReason || null,
            notes: notes || null,
          });
        });
        if (!reportSeries(result, "Período registado - bloqueia a disponibilidade do motorista")) return;
      }
      onOpenChange(false);

    } catch (e) {
      const msg = errorMessagePt(e, "Não foi possível registar o período");
      setServerError(msg);
      toast.error(msg);
    }
  };

  /** Cria um destino ainda inexistente a partir do formulário. */
  const createLocation = async (name: string) => {
    try {
      const newId = await createCity.mutateAsync(name);
      toast.success(`Local "${name}" adicionado. O tempo de deslocação será configurado pelo gestor.`);
      return newId;
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível adicionar o local"));
      throw e;
    }
  };

  const submit = async () => {
    // "Repetir até" é opcional: sem data, a repetição não tem fim definido.
    // Limite único de 120 ocorrências: recusar sem cortar a série em silêncio.
    if (repeat && until) {
      const base = startDate ?? (absStartDate ? new Date(`${absStartDate}T12:00:00`) : null);
      const limitError = base ? recurrenceLimitError(base, freq, until, !isAbsence && freq === "weekly" ? weekdays : []) : null;
      if (limitError) {
        setServerError(limitError);
        toast.error(limitError);
        return;
      }
    }
    if (isAbsence && !activity) {
      await saveAbsence();
      return;
    }
    setServerError(null);

    if (!originCityId) {
      const msg = "Selecione a origem do serviço.";
      setServerError(msg);
      toast.error(msg);
      return;
    }
    if (!cityId) {
      const msg = "Selecione o destino do serviço.";
      setServerError(msg);
      toast.error(msg);
      return;
    }
    if (requiresApproval && !justification.trim()) {
      const msg = "Indique a justificação deste evento.";
      setServerError(msg);
      toast.error(msg);
      return;
    }
    if (requiresApproval && repeat && !activity) {
      const msg = "Eventos sujeitos a aprovação não podem ser criados em série.";
      setServerError(msg);
      toast.error(msg);
      return;
    }
    if (!tagId) {
      const msg =
        "Este tipo de evento ainda não tem uma TAG associada. Configure a associação no backoffice antes de guardar o serviço.";
      setServerError(msg);
      toast.error(msg);
      return;
    }
    if (showAdminPicker && !administratorId) {
      const msg = "Selecione o administrador a que este serviço pertence.";
      setServerError(msg);
      toast.error(msg);
      return;
    }


    // Só valida o título quando o campo faz parte do formulário visível.
    if (showTitle && !titleField.validate(setServerError)) return;

    const missing = missingFieldsMessage([
      ...(isRequest
        ? [{ label: "Administrador", filled: Boolean(administratorId) }]
        : [{ label: "motorista", filled: Boolean(driverId) }]),
      { label: "início do serviço", filled: Boolean(startDate) },
      { label: "fim do serviço", filled: Boolean(endDate) },
    ]);
    if (missing || !startDate || !endDate) {
      const msg = missing ?? "";
      setServerError(msg);
      toast.error(msg);
      return;
    }
    if (endDate <= startDate) {
      const msg = "O fim do serviço tem de ser posterior ao início.";
      setServerError(msg);
      toast.error(msg);
      return;
    }
    if (blocked && !override) {
      const msg = canOverride
        ? `Existe conflito. Marque “${overrideLabel}” para continuar.`
        : "Existe conflito neste período. Só um gestor pode forçar a gravação.";
      setServerError(msg);
      toast.error(msg);
      return;
    }
    if (blocked) {
      setConfirmOpen(true);
      return;
    }
    // Numa série, o âmbito só é pedido aqui, ao confirmar a alteração.
    if (activity?.series_id) {
      setSaveScopeOpen(true);
      return;
    }
    await doSave();
  };



  /** Persiste o ajuste (ou a reposição, com valores nulos) reutilizando a mesma mutação. */
  const runAdjustment = async (
    s: Date | null,
    e: Date | null,
    reasonId: string | null,
    adjustScope: "one" | "future",
    /** Justificação obrigatória nos motivos sujeitos a aprovação. */
    justif: string | null = null,
  ) => {
    if (!activity) return;
    try {
      await adjust.mutateAsync({
        id: activity.id,
        start: s ? s.toISOString() : null,
        end: e ? e.toISOString() : null,
        reasonId,
        scope: adjustScope,
        justification: justif,
      });
      setAdjustScopeOpen(false);
      toast.success(
        !s && !e
          ? "Ocupação reposta para o valor calculado"
          : justif
            ? "Ajuste enviado para aprovação do Gestor ou do Proprietário"
            : "Ocupação ajustada",
      );
      onOpenChange(false);
    } catch (err) {
      setAdjustScopeOpen(false);
      const msg = errorMessagePt(err, "Não foi possível ajustar a ocupação");
      setServerError(msg);
      toast.error(msg);
    }
  };

  /** «Repor» é uma ação completa: limpa o ajuste, grava e fecha a janela. */
  const submitReset = async (adjustScope: "one" | "future" = "one", skipScopeCheck = false) => {
    if (!activity) return;
    setServerError(null);
    setAdjStart("");
    setAdjEnd("");
    if (activity.series_id && !skipScopeCheck) {
      setScopeAction("reset");
      setAdjustScopeOpen(true);
      return;
    }
    await runAdjustment(null, null, null, adjustScope);
  };

  /** Valida o ajuste; numa série, pede primeiro o âmbito da alteração. */
  const submitAdjustment = async (adjustScope: "one" | "future" = "one", skipScopeCheck = false) => {
    if (!activity) return;
    setServerError(null);
    const bothEmpty = !adjStart && !adjEnd;
    if (!bothEmpty && (!adjStart || !adjEnd)) {
      setServerError(
        `${missingFieldsMessage([
          { label: "início da ocupação", filled: Boolean(adjStart) },
          { label: "fim da ocupação", filled: Boolean(adjEnd) },
        ])} Em alternativa, reponha o valor calculado.`,
      );
      return;
    }
    const s = adjStart ? new Date(adjStart) : null;
    const e = adjEnd ? new Date(adjEnd) : null;
    if (s && e) {
      if (e <= s) {
        setServerError("O fim da ocupação tem de ser posterior ao início.");
        return;
      }
      if (s > new Date(activity.start_datetime) || e < new Date(activity.end_datetime)) {
        setServerError("A ocupação tem de cobrir todo o horário do serviço.");
        return;
      }
    }
    if (!bothEmpty && !adjReasonId) {
      setServerError("Selecione o motivo do ajuste da deslocação.");
      return;
    }
    if (!bothEmpty && adjustNeedsApproval && !adjJustification.trim()) {
      setServerError("Indique a justificação do ajuste.");
      return;
    }
    if (activity.series_id && !skipScopeCheck) {
      setScopeAction("adjust");
      setAdjustScopeOpen(true);
      return;
    }
    await runAdjustment(
      s,
      e,
      bothEmpty ? null : adjReasonId,
      adjustScope,
      !bothEmpty && adjustNeedsApproval ? adjJustification.trim() : null,
    );
  };


  if (mode === "adjust") {
    const adjustmentBusy = adjust.isPending;
    return (
      <Dialog modal={false} open={open} onOpenChange={(nextOpen) => !adjustmentBusy && onOpenChange(nextOpen)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{readOnly ? "Detalhe do serviço" : "Ajustar ocupação"}</DialogTitle>
            <DialogDescription />
          </DialogHeader>

          {activity && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1 rounded-md border bg-surface-2 p-3">
                {!hideConfidential && <p className="font-medium">{confidentialContent.data?.title ?? activity.title}</p>}
                {serviceAdministratorName && (
                  <p className="break-words text-muted-foreground">{serviceAdministratorName}</p>
                )}
                <p className="text-muted-foreground">
                  Horário do serviço: {fmtDateTime(activity.start_datetime)} – {fmtDateTime(activity.end_datetime)}
                </p>
                <p className="text-muted-foreground">
                  Ocupação calculada (com deslocação):{" "}
                  {fmtDateTime(activity.calculated_occupation_start ?? activity.start_datetime)} –{" "}
                  {fmtDateTime(activity.calculated_occupation_end ?? activity.end_datetime)}
                </p>
                <p className="text-muted-foreground">
                  Ocupação atual: {fmtDateTime(effectiveStart(activity))} – {fmtDateTime(effectiveEnd(activity))}
                </p>
                {pendingAdjust && (
                  <p className="font-medium text-primary">
                    Nova ocupação proposta: {fmtDateTime(pendingAdjust.start)} – {fmtDateTime(pendingAdjust.end)}
                  </p>
                )}
                {/* As notas do serviço acompanham quem ajusta a ocupação. */}
                {!hideConfidential && (confidentialContent.data?.notes ?? activity.notes) && (
                  <div className="mt-2 border-t pt-2">
                    <p className="text-xs font-medium text-foreground">Notas:</p>
                    <p className="whitespace-pre-line break-words text-muted-foreground">
                      {confidentialContent.data?.notes ?? activity.notes}
                    </p>
                  </div>
                )}
              </div>

              {activity.adjustment_approval_status === "pending" && (
                <div className="rounded-md border border-l-2 border-l-leave bg-card p-3">
                  <p className="text-sm font-medium text-leave">Ajuste pendente de aprovação</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Proposta: {fmtDateTime(activity.adjustment_proposed_start ?? activity.start_datetime)} –{" "}
                    {fmtDateTime(activity.adjustment_proposed_end ?? activity.end_datetime)}
                  </p>
                  {activity.adjustment_justification && (
                    <p className="mt-1 whitespace-pre-line break-words text-xs text-muted-foreground">
                      Justificação: {activity.adjustment_justification}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pedido por{" "}
                    {(activity.adjustment_requested_by
                      ? displayNames?.[activity.adjustment_requested_by]
                      : null) ?? "-"}
                    {activity.adjustment_requested_at
                      ? ` · ${fmtDateTime(activity.adjustment_requested_at)}`
                      : ""}
                  </p>
                  {canDecideAdjustment && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        disabled={decideAdjustment.isPending}
                        onClick={async () => {
                          try {
                            await decideAdjustment.mutateAsync({ id: activity.id, approve: true });
                            toast.success("Ajuste aprovado.");
                            onOpenChange(false);
                          } catch (err) {
                            toast.error(errorMessagePt(err, "Não foi possível aprovar o ajuste"));
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
                            await decideAdjustment.mutateAsync({ id: activity.id, approve: false });
                            toast.success("Ajuste rejeitado.");
                            onOpenChange(false);
                          } catch (err) {
                            toast.error(errorMessagePt(err, "Não foi possível rejeitar o ajuste"));
                          }
                        }}
                      >
                        Rejeitar
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {!readOnly && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="adjStart">A ocupação começa</Label>
                      <DateInput id="adjStart" value={adjStart} onChange={(v) => setAdjStart(v)} withTime />
                    </div>
                    <div>
                      <Label htmlFor="adjEnd">A ocupação termina</Label>
                      <DateInput id="adjEnd" value={adjEnd} onChange={(v) => setAdjEnd(v)} withTime />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="adjReason">Motivo do ajuste</Label>
                    <Select value={adjReasonId} onValueChange={setAdjReasonId}>
                      <SelectTrigger id="adjReason">
                        <SelectValue placeholder="Selecionar motivo" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeReasons.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Obrigatório sempre que a deslocação é alterada manualmente.
                    </p>
                  </div>
                  {/* Motivos como «Outros» exigem justificação e aprovação. */}
                  {adjustNeedsApproval && (
                    <div>
                      <Label htmlFor="adjJustification">Justificação</Label>
                      <Textarea
                        id="adjJustification"
                        rows={3}
                        value={adjJustification}
                        onChange={(e) => setAdjJustification(e.target.value)}
                        placeholder="Explique o motivo deste ajuste manual"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {privilegedCreator
                          ? "Obrigatória. Como Gestor/Proprietário, o ajuste é aplicado de imediato, sem aprovação."
                          : "Obrigatória. O ajuste fica pendente de aprovação do Gestor ou do Proprietário."}
                      </p>
                    </div>
                  )}
                  {adjustAvailability && <AvailabilityWarning result={adjustAvailability} />}
                </>
              )}
              {serverError && <p className="text-sm text-conflict">{serverError}</p>}
            </div>
          )}

          <DialogFooter className="gap-2">
            {readOnly ? (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            ) : (
              <>
                <Button variant="ghost" disabled={adjustmentBusy} onClick={() => void submitReset()}>
                  {adjustmentBusy ? "A repor…" : "Repor"}
                </Button>

                <Button onClick={() => void submitAdjustment()} disabled={adjustmentBusy}>
                  {adjustmentBusy ? "A guardar…" : "Guardar ajuste"}
                </Button>
              </>
            )}
          </DialogFooter>

          {/* Mesmo padrão do cancelamento: o âmbito da série é pedido ao confirmar. */}
          <AlertDialog open={adjustScopeOpen} onOpenChange={setAdjustScopeOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Alterar evento recorrente</AlertDialogTitle>
                <AlertDialogDescription>
                  Este evento pertence a uma série recorrente. Escolha onde quer aplicar{" "}
                  {scopeAction === "reset" ? "a reposição da ocupação" : "o ajuste da ocupação"}. As
                  datas já passadas mantêm-se inalteradas.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 sm:flex-col sm:items-stretch sm:space-x-0">
                <Button
                  variant="outline"
                  disabled={adjustmentBusy}
                  onClick={() =>
                    void (scopeAction === "reset" ? submitReset("one", true) : submitAdjustment("one", true))
                  }
                >
                  Alterar apenas este evento
                </Button>
                <Button
                  variant="outline"
                  disabled={adjustmentBusy}
                  onClick={() =>
                    void (scopeAction === "reset" ? submitReset("future", true) : submitAdjustment("future", true))
                  }
                >
                  Alterar este e os eventos futuros
                </Button>

                <AlertDialogCancel disabled={adjustmentBusy}>Fechar</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>


        </DialogContent>
      </Dialog>
    );
  }

  const extraPending = createGarage.isPending || createTimeOff.isPending || createUnavail.isPending;
  const busy =
    save.isPending || cancel.isPending || createAuto.isPending || updateAuto.isPending || cancelAuto.isPending || extraPending;
  const saving = save.isPending || createAuto.isPending || updateAuto.isPending || extraPending;

  const assignedDriver = activity?.driver_id ? drivers.find((d) => d.id === activity.driver_id) : null;
  const attempts = activity ? assignmentAttempts(activity) : [];

  return (
    <Dialog modal={false} open={open} onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{activity ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          <DialogDescription>
            {isRequest
              ? "Indique o horário do serviço e a cidade. O motorista é atribuído automaticamente pela sua lista de prioridade."
              : isGarage
                ? "Evento de garagem: fica na agenda do motorista e torna-o indisponível nesse período."
                : isAbsence
                  ? "Ausência ou indisponibilidade do motorista: bloqueia a disponibilidade no período indicado."
                  : "Indique o horário do serviço e a cidade. A deslocação a partir da base é calculada automaticamente."}
          </DialogDescription>

        </DialogHeader>

        {changedElsewhere && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
            <span className="flex-1 min-w-48">
              Este serviço foi alterado por outro utilizador enquanto tinha esta janela aberta.
            </span>
            <Button size="sm" variant="outline" onClick={() => setReloadNonce((n) => n + 1)}>
              Recarregar valores atuais
            </Button>
          </div>
        )}

        {activity && (isRequest || !activity.driver_id) && (
          <div
            className={`rounded-md border p-3 text-sm ${
              activity.driver_id ? "bg-surface-2" : isRequest ? "bg-surface-2" : "border-leave bg-leave-soft"
            }`}
          >
            <p className="font-medium">
              {activity.driver_id
                ? `Motorista atribuído: ${assignedDriver?.name ?? "-"}`
                : isRequest
                  ? "Motorista ainda não atribuído"
                  : "Sem motorista atribuído"}
              {!isRequest && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Atribuição: {ASSIGNMENT_LABEL[activity.assignment_status]}
                </span>
              )}
            </p>
            {!activity.driver_id && !isRequest && (
              <p className="mt-1 text-xs text-muted-foreground">
                Nenhum motorista da lista de prioridade estava disponível. Escolha um motorista
                abaixo.
              </p>
            )}
            {!isRequest && attempts.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {attempts.map((t) => (
                  <li key={t.driver_id}>
                    {t.priority}. {t.name}: {t.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}


        <div className="grid gap-4 sm:grid-cols-2">
          {!isRequest && !activity && (
            <div className="sm:col-span-2">
              <Label>Tipo de evento</Label>
              <Select value={eventKind} onValueChange={(v) => setEventKind(v as EventKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {kindOptions.map((o) => (
                    <SelectItem key={o.kind} value={o.kind}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {showTitle && (
            <div className="sm:col-span-2">
              <TitleField
                id="title"
                value={title}
                onChange={setTitle}
                field={titleField}
                autoFocus={!activity}
              />
            </div>
          )}

          {/* A TAG é atribuída automaticamente a partir do tipo de evento. */}
          {showAdminPicker && (
            <div className="sm:col-span-2">
              <Label htmlFor="service-administrator">Administrador</Label>
              <AdministratorCombobox
                id="service-administrator"
                administrators={administrators}
                value={administratorId}
                onChange={setAdministratorId}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Indique a que Administrador pertence este serviço. Fica visível para esse
                Administrador e para o Assistente associado.
              </p>
            </div>
          )}

          {!isAbsence && (
            <div>
              <Label htmlFor="origin-city">Origem</Label>
              <CityCombobox
                id="origin-city"
                cities={cities}
                value={originCityId}
                onChange={setOriginCityId}
                placeholder="Selecionar origem"
                onCreate={createLocation}
              />
            </div>
          )}
          {!isAbsence && (
            <div>
              <Label htmlFor="destination-city">Destino</Label>
              <CityCombobox
                id="destination-city"
                cities={cities}
                value={cityId}
                onChange={setCityId}
                placeholder="Selecionar destino"
                onCreate={createLocation}
              />
            </div>
          )}


          {isRequest && adminOptions.length > 1 && (
            <div>
              <Label>Serviço para</Label>
              <Select value={administratorId} onValueChange={setAdministratorId}>
                <SelectTrigger><SelectValue placeholder="Selecionar Administrador" /></SelectTrigger>
                <SelectContent>
                  {adminOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Indique para que Administrador é este serviço.
              </p>
            </div>
          )}
          {serviceAdministratorName && !showAdminPicker && (
            <div className="sm:col-span-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {serviceAdministratorName}
              </span>
            </div>
          )}
          {!isRequest && (
            <div className="sm:col-span-2">
              <Label>Motorista</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger><SelectValue placeholder="Selecionar motorista" /></SelectTrigger>
                <SelectContent>
                  {orderedDrivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      <span className="flex w-full items-center justify-between gap-3">
                        <span>{d.name}</span>
                        {driverBadges.get(d.id) && <DriverStatusBadge badge={driverBadges.get(d.id)!} />}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!isAbsence ? (
            <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <Label htmlFor="start">{isGarage ? "Início" : "Início do serviço"}</Label>
                <DateInput
                  id="start"
                  value={start}
                  onChange={(v) => {
                    setStart(v);
                    // Apenas na criação de um novo serviço o fim acompanha
                    // automaticamente o início, e só quando o novo início passa
                    // a ser posterior ao fim atual (continua editável). Na edição
                    // de um serviço existente, início e fim são independentes.
                    if (!activity) setEnd((prev) => syncEndWithStart(v, prev));
                  }}
                  withTime
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="end">{isGarage ? "Fim" : "Fim do serviço"}</Label>
                <DateInput id="end" value={end} onChange={(v) => setEnd(v)} withTime />
              </div>
            </div>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
                <Checkbox checked={absAllDay} onCheckedChange={(v) => setAbsAllDay(v === true)} />
                Dia(s) inteiro(s)
              </label>
              <div>
                <Label htmlFor="abs-start">{absAllDay ? "Data de início" : "Data"}</Label>
                <DateInput
                  id="abs-start"
                  value={absStartDate}
                  onChange={(v) => {
                    setAbsStartDate(v);
                    if (!activity) setAbsEndDate(v);
                  }}
                />
              </div>
              {absAllDay ? (
                <div>
                  <Label htmlFor="abs-end">Data de fim</Label>
                  <DateInput id="abs-end" value={absEndDate} onChange={setAbsEndDate} />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <Label htmlFor="abs-st">Início</Label>
                    <Input
                      id="abs-st"
                      type="time"
                      lang="pt-PT"
                      value={absStartTime}
                      onChange={(e) => {
                        setAbsStartTime(e.target.value);
                        if (!activity) setAbsEndTime(e.target.value);
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="abs-et">Fim</Label>
                    <Input id="abs-et" type="time" lang="pt-PT" value={absEndTime} onChange={(e) => setAbsEndTime(e.target.value)} />
                  </div>
                </div>
              )}
              {absAllDay && (
                <div>
                  <Label>Tipo de ausência</Label>
                  <Select value={absKind} onValueChange={(v) => setAbsKind(v as AbsenceKind)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["holiday", "sick", "personal", "other"] as AbsenceKind[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {TIMEOFF_TYPE_LABEL[t] ?? t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="abs-reason">Motivo</Label>
                <Input id="abs-reason" value={absReason} onChange={(e) => setAbsReason(e.target.value)} />
              </div>
          </>
          )}

          {!activity && (
            <div className="sm:col-span-2">
              <RecurrenceFields
                repeat={repeat}
                onRepeatChange={setRepeat}
                freq={freq}
                onFreqChange={(v) => setFreq(v)}
                until={until}
                onUntilChange={setUntil}
                weekdays={weekdays}
                onWeekdaysChange={isAbsence ? undefined : setWeekdays}
                label={isAbsence ? "Repetir este período" : "Repetir este serviço"}
              />
            </div>
          )}

          {(requiresApproval || justification) && !isAbsence && (
            <div className="sm:col-span-2">
              <Label htmlFor="justification">Justificação</Label>
              <Textarea
                id="justification"
                rows={3}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                readOnly={readOnly || Boolean(activity)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Obrigatória: este tipo de evento fica pendente de aprovação do Gestor ou do
                Proprietário.
              </p>
            </div>
          )}

          {approvalStatus && (
            <div className="sm:col-span-2 rounded-md border bg-surface-2 p-3 text-sm">
              <p className="font-medium">
                {approvalStatus === "pending"
                  ? "Pendente de aprovação"
                  : approvalStatus === "approved"
                    ? "Aprovado"
                    : "Rejeitado"}
              </p>
              {approvalStatus === "pending" && (
                <p className="text-xs text-muted-foreground">
                  Aguarda decisão do Gestor ou do Proprietário. Basta uma das aprovações.
                </p>
              )}
              {canDecideApproval && activity && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await decideApproval.mutateAsync({ id: activity.id, approve: true });
                        toast.success("Evento aprovado.");
                        onOpenChange(false);
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
                        await decideApproval.mutateAsync({ id: activity.id, approve: false });
                        toast.success("Evento rejeitado.");
                        onOpenChange(false);
                      } catch (e) {
                        toast.error(errorMessagePt(e, "Não foi possível rejeitar o evento"));
                      }
                    }}
                  >
                    Rejeitar
                  </Button>
                </div>
              )}
            </div>
          )}

          {!hideConfidential && <div className="sm:col-span-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            <p className="mt-1 text-xs text-muted-foreground">
              As notas escritas por Assistentes ou Administradores ficam reservadas a esses perfis: o
              Gestor e o Proprietário não lhes têm acesso.
            </p>
          </div>}

          {!isAbsence && (
            <label htmlFor="round-trip" className="sm:col-span-2 flex cursor-pointer items-center gap-2 text-sm font-medium">
              <Checkbox
                id="round-trip"
                checked={roundTrip}
                onCheckedChange={(v) => setRoundTrip(v === true)}
              />
              Ida e volta
            </label>
          )}
        </div>

        {occupation && (
          <div className="rounded-md border bg-surface-2 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Clock className="size-4 text-primary" /> Ocupação prevista
            </p>
            <p className="mt-1 text-muted-foreground">
              {fmtDateTime(occupation.start)} – {fmtDateTime(occupation.end)}
              {occupation.travelMinutes !== null && occupation.travelMinutes > 0 && (
                <>
                  {" "}
                  · deslocação {fmtMinutes(occupation.travelMinutes)}{" "}
                  {roundTrip ? "em cada sentido" : "apenas na ida"}
                </>
              )}
            </p>
            {occupation.travelUnknown && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-leave">
                <Info className="size-3.5" />{" "}
                {routeName
                  ? `Tempo de deslocação não configurado para ${routeName}.`
                  : "Indique a origem e o destino para calcular a deslocação."}
              </p>
            )}
          </div>
        )}

        {activity && (activity.driver_adjusted_start || activity.driver_adjusted_end) && (
          <div className="rounded-md border bg-surface-2 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <SlidersHorizontal className="size-4 text-primary" /> Ajuste de deslocação
            </p>
            <dl className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              <div className="flex gap-1">
                <dt>Ajustado por:</dt>
                <dd className="text-foreground">
                  {(activity.adjusted_by ? displayNames?.[activity.adjusted_by] : null) ??
                    (activity.adjustment_source === "motorista" ? "Motorista" : "Gestor/Proprietário")}
                </dd>
              </div>
              <div className="flex gap-1">
                <dt>Motivo:</dt>
                <dd className="text-foreground">
                  {activity.adjustment_reason_label_snapshot ?? adjustReasons.find((r) => r.id === activity.adjustment_reason_id)?.label ?? "-"}
                </dd>
              </div>
              <div className="flex gap-1">
                <dt>Data do ajuste:</dt>
                <dd className="text-foreground">
                  {activity.adjusted_at ? fmtDateTime(new Date(activity.adjusted_at)) : "-"}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {availability && (
          <AvailabilityWarning result={availability} driverName={drivers.find((d) => d.id === driverId)?.name ?? null}>
            {suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium">Disponíveis em alternativa:</span>
                {suggestions.map((d) => (
                  <Button key={d.id} size="sm" variant="outline" onClick={() => setDriverId(d.id)}>
                    {d.name}
                  </Button>
                ))}
              </div>
            )}
            {blocked &&
              (canOverride ? (
                <label className="mt-3 flex items-start gap-2 text-xs font-medium">
                  <Checkbox
                    className="mt-0.5"
                    checked={override}
                    onCheckedChange={(v) => setOverride(Boolean(v))}
                  />
                  {overrideLabel}
                </label>
              ) : (
                <p className="mt-2 text-xs">Apenas um gestor pode forçar a gravação com conflito.</p>
              ))}
          </AvailabilityWarning>
        )}


        {activity?.series_id && (
          <p className="text-xs text-muted-foreground">
            Este evento faz parte de uma série. Ao guardar, escolhe se a alteração se aplica apenas a
            este evento ou também aos seguintes.
          </p>
        )}

        {activity?.created_by && (
          <p className="text-xs text-muted-foreground">
            Criado por: {displayNames?.[activity.created_by] ?? "-"}
          </p>
        )}

        {activity?.status === "cancelled" && activity.cancelled_at && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Cancelamento</p>
            <p>
              Cancelado por: {displayNames?.[activity.cancelled_by ?? ""] ?? "-"}
              {activity.cancelled_by_role
                ? ` (${CANCEL_ROLE_LABEL[activity.cancelled_by_role] ?? activity.cancelled_by_role})`
                : ""}
            </p>
            <p>Data: {fmtDateTime(activity.cancelled_at)}</p>
            {activity.cancel_reason && <p>Motivo: {activity.cancel_reason}</p>}
          </div>
        )}

        {serverError && (
          <p className="rounded-md border border-conflict/40 bg-conflict-soft p-3 text-sm text-conflict">{serverError}</p>
        )}

        <DialogFooter className="sticky bottom-0 -mx-4 gap-2 border-t bg-background px-4 pb-1 pt-3 sm:static sm:mx-0 sm:border-0 sm:px-0 sm:pt-0 sm:justify-between">
          {activity && activity.status !== "cancelled" ? (
            <Button
              variant="outline"
               disabled={busy}
              onClick={() => {
                // O motorista tem de justificar o cancelamento.
                if (user?.role === "driver") {
                  setCancelReason("");
                  setCancelReasonOpen(true);
                  return;
                }
                // Numa série, o utilizador escolhe primeiro o que quer cancelar.
                if (activity.series_id) setCancelScopeOpen(true);
                else void runCancel("one");
              }}
            >
              Cancelar atividade
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {activity && canOverride && onAdjustOccupation && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  onOpenChange(false);
                  onAdjustOccupation(activity);
                }}
              >
                <SlidersHorizontal className="size-4" /> Ajustar ocupação
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Fechar</Button>
            <Button onClick={submit} disabled={busy}>
              {save.isPending ? "A guardar…" : activity ? "Guardar alterações" : "Criar serviço"}
            </Button>
          </div>
        </DialogFooter>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Atribuir mesmo assim?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-left">
                  <p>
                    {drivers.find((d) => d.id === driverId)?.name ?? "Este motorista"} tem conflitos no período
                    escolhido:
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    {(availability?.conflicts ?? []).map((c) => (
                      <li key={c.message}>{c.message}</li>
                    ))}
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Rever</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={async () => {
                  setConfirmOpen(false);
                  if (activity?.series_id) setSaveScopeOpen(true);
                  else await doSave();
                }}
              >
                Atribuir mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Mesmo padrão do cancelamento: o âmbito só é pedido ao confirmar a alteração. */}
        <AlertDialog open={saveScopeOpen} onOpenChange={setSaveScopeOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Alterar evento recorrente</AlertDialogTitle>
              <AlertDialogDescription>
                Este evento pertence a uma série recorrente. Escolha onde quer aplicar a alteração. As
                datas já passadas mantêm-se sempre inalteradas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:flex-col sm:items-stretch sm:space-x-0">
              <Button variant="outline" disabled={busy} onClick={() => void doSave("one")}>
                Alterar apenas este evento
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void doSave("future")}>
                Alterar este e os eventos futuros
              </Button>
              <AlertDialogCancel disabled={busy}>Fechar</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


        <AlertDialog open={cancelScopeOpen} onOpenChange={setCancelScopeOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar evento recorrente</AlertDialogTitle>
              <AlertDialogDescription>
                Este evento pertence a uma série recorrente. Escolha o que pretende cancelar. Os eventos já
                passados mantêm-se sempre inalterados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:flex-col sm:items-stretch sm:space-x-0">
              <Button variant="outline" disabled={busy} onClick={() => void runCancel("one")}>
                Cancelar apenas este evento
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void runCancel("future")}>
                Cancelar este e os eventos futuros
              </Button>
              <AlertDialogCancel disabled={busy}>Fechar</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={cancelReasonOpen} onOpenChange={setCancelReasonOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar serviço</AlertDialogTitle>
              <AlertDialogDescription>
                Indique o motivo do cancelamento. O serviço mantém-se no histórico com o seu nome, o
                perfil, a data e a justificação.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Motivo do cancelamento</Label>
              <Textarea
                id="cancel-reason"
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Explique porque está a cancelar este serviço"
              />
            </div>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel disabled={busy}>Fechar</AlertDialogCancel>
              <Button
                disabled={busy || cancelReason.trim().length === 0}
                onClick={() => void runCancel("one", cancelReason.trim())}
              >
                Confirmar cancelamento
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
