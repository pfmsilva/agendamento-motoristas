import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { TimeInput } from "@/components/TimeInput";
import { CityCombobox } from "@/components/CityCombobox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAddUnavailability,
  useAdministrators,
  useCities,
  useCreateDriverGarageEvent,
  useCreateDriverService,
  useDeleteTimeOff,
  useDeleteUnavailability,
  useRequestTimeOff,
  useUpdateTimeOff,
  useUpdateUnavailability,
  useEventTags,
  useEventKindTags,
  useCreatePendingCity,
  useSetEventJustification,
} from "@/lib/data";
import {
  toDateInput,
  type ActivityType,
  type AvailabilityPeriod,
} from "@/lib/scheduling";
import { errorMessagePt } from "@/lib/errors";
import { RecurrenceFields } from "@/components/RecurrenceFields";
import { TitleField, useTitleField } from "@/components/TitleField";
import {
  occurrenceDates,
  openEndedUntil,
  recurrenceLimitError,
  runOccurrences,
  type RecurrenceFreq,
} from "@/lib/recurrence";


type Kind = "holiday" | "sick" | "personal" | "other";

/**
 * O tipo de evento do motorista é sempre uma TAG configurada pelo Proprietário:
 * a TAG de férias bloqueia a disponibilidade, a de garagem cria um evento de
 * garagem e qualquer outra TAG (incluindo novas) cria um serviço.
 */
type EventType = "vacation" | "garage" | "service";

/** Rótulo apresentado ao motorista para as TAGs de sistema. */
const SYSTEM_TAG_LABEL: Record<string, string> = {
  vacation: "Férias",
  garage: "Garagem",
  admin: "Administração",
};

const timeInput = (d: Date) =>

  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export function AvailabilityDialog({
  open,
  onOpenChange,
  driverId,
  period,
  initialSlot,
  allowService = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  driverId: string;
  period?: AvailabilityPeriod | null;
  /** pre-filled window when the driver clicks an empty calendar cell */
  initialSlot?: { start: Date; end: Date } | null;
  /** o motorista pode também criar serviços na sua própria agenda */
  allowService?: boolean;
}) {
  const createTimeOff = useRequestTimeOff();
  const updateTimeOff = useUpdateTimeOff();
  const deleteTimeOff = useDeleteTimeOff();
  const createUnavail = useAddUnavailability();
  const updateUnavail = useUpdateUnavailability();
  const deleteUnavail = useDeleteUnavailability();
  const createService = useCreateDriverService();
  const createDriverGarage = useCreateDriverGarageEvent();
  const { data: administrators = [] } = useAdministrators();
  const activeAdmins = administrators.filter((a) => a.active);
  const { data: cities = [] } = useCities();
  // Fonte única das TAGs: a configuração global do Proprietário. Novas TAGs,
  // renomeações ou desativações refletem-se aqui automaticamente.
  const { data: eventTags = [] } = useEventTags();
  const { data: eventKindTags = [] } = useEventKindTags();
  const createCity = useCreatePendingCity();
  const setJustificationRpc = useSetEventJustification();
  const tagOptions = eventTags.filter((tag) => tag.active);
  const activeServiceTags = tagOptions.filter(
    (tag) => tag.system_key !== "garage" && tag.system_key !== "vacation",
  );
  const tagLabel = (tag: { label: string; system_key: string | null }) =>
    (tag.system_key && SYSTEM_TAG_LABEL[tag.system_key]) || tag.label;

  const today = toDateInput(new Date());
  const [eventType, setEventType] = useState<EventType>("vacation");
  const [allDay, setAllDay] = useState(true);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [kind, setKind] = useState<Kind>("holiday");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  // campos exclusivos do serviço / garagem
  const [administratorId, setAdministratorId] = useState("");
  const [title, setTitle] = useState("");
  const titleField = useTitleField(title);
  const serviceType: ActivityType = "trip";
  const [cityId, setCityId] = useState("");
  const [originCityId, setOriginCityId] = useState("");
  const [roundTrip, setRoundTrip] = useState(true);
  /** TAG escolhida no seletor "Tipo de evento" (determina também o fluxo). */
  const [tagId, setTagId] = useState("");
  // Tipos de evento sujeitos a aprovação: justificação obrigatória.
  const [justification, setJustification] = useState("");
  const requiresApproval = eventKindTags.some(
    (k) => k.requires_approval && k.tag_id === tagId,
  );

  /** Cria um local ainda inexistente, tal como no fluxo do Assistente. */
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
  // Recorrência: mesma lógica em todos os tipos de evento.
  const [repeat, setRepeat] = useState(false);
  const [freq, setFreq] = useState<RecurrenceFreq>("weekly");
  const [until, setUntil] = useState("");



  useEffect(() => {
    if (!open) return;
    setError(null);
    setRepeat(false);
    setFreq("weekly");
    setUntil("");
    setAdministratorId("");
    setCityId("");
    setOriginCityId("");

    setTitle("");
    // Uma ausência histórica pode usar uma TAG entretanto desativada. Na edição,
    // mantemos essa TAG visível para preencher fielmente o mesmo formulário.
    const vacationTag = eventTags.find((t) => t.system_key === "vacation");
    const firstServiceTag = activeServiceTags[0];
    if (period) {
      const k = ((period.kind as Kind) ?? "other") as Kind;
      setEventType("vacation");
      setTagId(vacationTag?.id ?? "");
      setAllDay(period.allDay);
      setStartDate(toDateInput(period.start));
      setEndDate(toDateInput(period.end));
      setStartTime(timeInput(period.start));
      setEndTime(timeInput(period.end));
      setKind(k);
      setNotes(period.notes ?? "");
    } else if (initialSlot) {
      // clicou numa célula vazia do calendário → janela por horas, pré-preenchida
      const preferred = firstServiceTag ?? vacationTag ?? tagOptions[0];
      setTagId(preferred?.id ?? "");
      setEventType(
        preferred?.system_key === "vacation"
          ? "vacation"
          : preferred?.system_key === "garage"
            ? "garage"
            : "service",
      );
      setAllDay(false);
      setStartDate(toDateInput(initialSlot.start));
      setEndDate(toDateInput(initialSlot.end));
      setStartTime(timeInput(initialSlot.start));
      setEndTime(timeInput(initialSlot.end));
      setKind("holiday");
      setNotes("");
    } else {
      const preferred = vacationTag ?? tagOptions[0];
      setTagId(preferred?.id ?? "");
      setEventType(
        preferred?.system_key === "garage" ? "garage" : preferred?.system_key === "vacation" ? "vacation" : "service",
      );
      setAllDay(preferred?.system_key === "vacation");
      setStartDate(today);
      setEndDate(today);
      setStartTime("09:00");
      setEndTime("13:00");
      setKind("holiday");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, period, today, initialSlot, eventTags]);

  const isService = eventType === "service";
  const isGarage = eventType === "garage";

  /**
   * Num evento novo, uma data final que ainda acompanha o início continua a
   * acompanhá-lo. Se o utilizador já escolheu outro dia, só corrigimos o fim
   * quando o intervalo completo ficaria inválido.
   */
  const changeStartDate = (nextDate: string) => {
    const endWasFollowingStart = !period && endDate === startDate;
    const previousStart = new Date(`${startDate}T${startTime}`);
    const previousEnd = new Date(`${endDate}T${endTime}`);
    const previousDuration = Math.max(previousEnd.getTime() - previousStart.getTime(), 60 * 60 * 1000);
    setStartDate(nextDate);
    const candidateEndDate = endWasFollowingStart ? nextDate : endDate;
    const nextStart = new Date(`${nextDate}T${startTime}`);
    const candidateEnd = new Date(`${candidateEndDate}T${endTime}`);
    if (candidateEnd > nextStart) {
      setEndDate(candidateEndDate);
      return;
    }
    const nextEnd = new Date(nextStart.getTime() + previousDuration);
    setEndDate(toDateInput(nextEnd));
    setEndTime(timeInput(nextEnd));
  };

  const changeStartTime = (nextTime: string) => {
    const previousStart = new Date(`${startDate}T${startTime}`);
    const previousEnd = new Date(`${endDate}T${endTime}`);
    const previousDuration = Math.max(previousEnd.getTime() - previousStart.getTime(), 60 * 60 * 1000);
    setStartTime(nextTime);
    const nextStart = new Date(`${startDate}T${nextTime}`);
    if (previousEnd > nextStart) return;
    const nextEnd = new Date(nextStart.getTime() + previousDuration);
    setEndDate(toDateInput(nextEnd));
    setEndTime(timeInput(nextEnd));
  };

  /** O valor do seletor é sempre o identificador da TAG escolhida. */
  const pickEventType = (nextTagId: string) => {
    const tag = tagOptions.find((t) => t.id === nextTagId);
    if (!tag) return;
    setTagId(nextTagId);
    setError(null);
    if (tag.system_key === "vacation") {
      setEventType("vacation");
      setKind("holiday");
      setAllDay(true);
      return;
    }
    setEventType(tag.system_key === "garage" ? "garage" : "service");
    setAllDay(false);
  };


  const busy =
    createTimeOff.isPending ||
    updateTimeOff.isPending ||
    createUnavail.isPending ||
    updateUnavail.isPending ||
    deleteTimeOff.isPending ||
    deleteUnavail.isPending ||
    createService.isPending ||
    createDriverGarage.isPending;

  /** Datas das ocorrências: uma só, ou todas as da recorrência escolhida. */
  const occurrenceStarts = (base: Date) =>
    repeat
      ? until
        ? occurrenceDates(base, freq, until)
        : occurrenceDates(base, freq, openEndedUntil(base), { cap: true })
      : [base];

  const reportSeries = (
    result: { created: number; failed: { date: Date; message: string }[] },
    okSingular: string,
  ) => {
    if (result.created > 0) {
      toast.success(
        result.created === 1
          ? okSingular
          : `${result.created} datas criadas. Cada uma é um evento independente.`,
      );
    }
    if (result.failed.length) {
      const message = `${result.failed.length} data(s) não foram criadas: ${result.failed
        .map((f) => `${f.date.toLocaleDateString("pt-PT")} (${errorMessagePt(new Error(f.message), "erro")})`)
        .join("; ")}`;
      setError(message);
      toast.error(message);
      return false;
    }
    return true;
  };

  const saveService = async () => {
    if (!administratorId) {
      const message = "Indique o Administrador a que o serviço pertence";
      setError(message);
      toast.error(message);
      return;
    }
    if (!titleField.validate(setError)) return;
    if (!tagId) {
      const message = "Selecione a TAG do serviço";
      setError(message);
      toast.error(message);
      return;
    }
    if (requiresApproval && !justification.trim()) {
      const message = "Indique a justificação deste evento.";
      setError(message);
      toast.error(message);
      return;
    }
    if (!originCityId) {
      const message = "Selecione a origem do serviço.";
      setError(message);
      toast.error(message);
      return;
    }
    if (!cityId) {
      const message = "Selecione o destino do serviço.";
      setError(message);
      toast.error(message);
      return;
    }
    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(`${endDate}T${endTime}`);
    if (end <= start) {
      const message = "A data e hora de fim têm de ser posteriores à data e hora de início";
      setError(message);
      toast.error(message);
      return;
    }
    const dur = end.getTime() - start.getTime();
    const result = await runOccurrences(occurrenceStarts(start), async (s) => {
      const newId = await createService.mutateAsync({
        administratorId,
        title: title.trim(),
        type: serviceType,
        cityId,
        originCityId,
        start: s.toISOString(),
        end: new Date(s.getTime() + dur).toISOString(),
        notes: notes || null,
        tagId,
        roundTrip,
      });
      if (requiresApproval && justification.trim() && typeof newId === "string") {
        await setJustificationRpc.mutateAsync({ id: newId, justification: justification.trim() });
      }
    });
    if (reportSeries(result, "Serviço criado na sua agenda")) onOpenChange(false);
  };

  const saveGarage = async () => {
    if (!titleField.validate(setError)) return;
    if (!originCityId) {
      const message = "Selecione a origem do serviço.";
      setError(message);
      toast.error(message);
      return;
    }
    if (!cityId) {
      const message = "Selecione o destino do serviço.";
      setError(message);
      toast.error(message);
      return;
    }
    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(`${endDate}T${endTime}`);
    if (end <= start) {
      const message = "A data e hora de fim têm de ser posteriores à data e hora de início";
      setError(message);
      toast.error(message);
      return;
    }
    const dur = end.getTime() - start.getTime();
    const result = await runOccurrences(occurrenceStarts(start), async (s) => {
      await createDriverGarage.mutateAsync({
        title: title.trim(),
        cityId,
        originCityId,
        start: s.toISOString(),
        end: new Date(s.getTime() + dur).toISOString(),
        notes: notes || null,
      });
    });
    if (reportSeries(result, "Evento de garagem criado na sua agenda")) onOpenChange(false);
  };

  const parseDay = (v: string) => {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
  };

  const save = async () => {
    setError(null);
    // "Repetir até" é opcional: sem data, a repetição não tem fim definido.
    // Limite único de 120 ocorrências, igual ao da base de dados.
    if (repeat && until) {
      const limitError = recurrenceLimitError(new Date(`${startDate}T${startTime || "12:00"}`), freq, until);
      if (limitError) {
        setError(limitError);
        toast.error(limitError);
        return;
      }
    }
    try {
      if (isService) {
        await saveService();
        return;
      }
      if (isGarage) {
        await saveGarage();
        return;
      }
      const targetSource = allDay ? "timeoff" : "unavailability";

      if (period && period.source !== targetSource) {
        // Changing between full-day and partial storage: remove and recreate.
        if (period.source === "timeoff") await deleteTimeOff.mutateAsync(period.id);
        else await deleteUnavail.mutateAsync(period.id);
      }

      const editingSame = period && period.source === targetSource;

      if (allDay) {
        const values = {
          start_date: startDate,
          end_date: endDate < startDate ? startDate : endDate,
          type: kind,
          reason: null,
          notes: notes || null,
        };
        if (editingSame) {
          const summary = await updateTimeOff.mutateAsync({
            id: period.id,
            values,
            expectedUpdatedAt: period.updatedAt,
          });
          toast.success(summary ? `Período atualizado.\n${summary}` : "Período atualizado");
          onOpenChange(false);
          return;
        } else {
          const baseStart = parseDay(values.start_date);
          const spanDays = Math.round((parseDay(values.end_date).getTime() - baseStart.getTime()) / 86400000);
          const summaries: string[] = [];
          const result = await runOccurrences(occurrenceStarts(baseStart), async (s) => {
            const summary = await createTimeOff.mutateAsync({
              driver_id: driverId,
              status: "approved",
              ...values,
              start_date: toDateInput(s),
              end_date: toDateInput(new Date(s.getTime() + spanDays * 86400000)),
            });
            if (summary) summaries.push(summary);
          });
          if (!reportSeries(result, "Período registado - bloqueia a sua disponibilidade")) return;
          if (summaries.length) toast.success(summaries.join("\n"));
          onOpenChange(false);
          return;
        }
      } else {
        const values = {
          start_datetime: new Date(`${startDate}T${startTime}`).toISOString(),
          end_datetime: new Date(`${endDate}T${endTime}`).toISOString(),
          reason: null,
          notes: notes || null,
        };
        if (new Date(values.end_datetime) <= new Date(values.start_datetime)) {
          toast.error("A data e hora de fim têm de ser posteriores à data e hora de início");
          return;
        }
        if (editingSame) {
          await updateUnavail.mutateAsync({ id: period.id, values, expectedUpdatedAt: period.updatedAt });
        } else {
          const s0 = new Date(values.start_datetime);
          const dur = new Date(values.end_datetime).getTime() - s0.getTime();
          const result = await runOccurrences(occurrenceStarts(s0), async (s) => {
            await createUnavail.mutateAsync({
              driver_id: driverId,
              status: "active",
              ...values,
              start_datetime: s.toISOString(),
              end_datetime: new Date(s.getTime() + dur).toISOString(),
            });
          });
          if (!reportSeries(result, "Período registado - bloqueia a sua disponibilidade")) return;
          onOpenChange(false);
          return;
        }
      }

      toast.success(period ? "Período atualizado" : "Período registado - bloqueia a sua disponibilidade");
      onOpenChange(false);
    } catch (e) {
      const message = errorMessagePt(e, "Não foi possível gravar o período");
      setError(message);
      toast.error(message);
    }
  };


  const remove = async () => {
    if (!period) return;
    setError(null);
    try {
      let summary: string | null = null;
      if (period.source === "timeoff") summary = await deleteTimeOff.mutateAsync(period.id);
      else await deleteUnavail.mutateAsync(period.id);
      toast.success(summary ? `Período eliminado.\n${summary}` : "Período eliminado");
      onOpenChange(false);
    } catch (e) {
      const message = errorMessagePt(e, "Não foi possível eliminar o período");
      setError(message);
      toast.error(message);
    }
  };

  const showTypeSelector = allowService || Boolean(period);
  const visibleTagOptions = period
    ? eventTags.filter((tag) => tag.id === tagId)
    : tagOptions;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{period ? "Editar evento" : "Novo evento"}</DialogTitle>
          <DialogDescription>
            {period ? "Altere os dados deste evento no seu calendário." : "Adicione um evento ao seu calendário."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {showTypeSelector && (
            <div>
              <Label>Tipo de evento</Label>
              <Select value={tagId} onValueChange={pickEventType} disabled={Boolean(period)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar tipo de evento" />
                </SelectTrigger>
                <SelectContent>
                  {visibleTagOptions.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tagLabel(tag)}
                    </SelectItem>
                  ))}
                </SelectContent>

              </Select>
            </div>
          )}

          {isGarage ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <TitleField id="gr-title" value={title} onChange={setTitle} field={titleField} />
              </div>
              <div>
                <Label>Origem</Label>
                <CityCombobox cities={cities} value={originCityId} onChange={setOriginCityId} placeholder="Selecionar origem" onCreate={createLocation} />
              </div>
              <div>
                <Label>Destino</Label>
                <CityCombobox cities={cities} value={cityId} onChange={setCityId} placeholder="Selecionar destino" onCreate={createLocation} />
              </div>
               <div>
                 <Label htmlFor="gr-start-date">Data de início</Label>
                 <DateInput id="gr-start-date" value={startDate} onChange={changeStartDate} />
              </div>
              <div className="min-w-0">
                 <Label htmlFor="gr-st">Hora de início</Label>
                <TimeInput
                  id="gr-st"
                  value={startTime}
                   onChange={changeStartTime}
                />
              </div>
               <div>
                 <Label htmlFor="gr-end-date">Data de fim</Label>
                 <DateInput id="gr-end-date" value={endDate} onChange={setEndDate} />
               </div>
              <div className="min-w-0">
                 <Label htmlFor="gr-et">Hora de fim</Label>
                <TimeInput id="gr-et" value={endTime} onChange={setEndTime} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="gr-notes">Notas (opcional)</Label>
                <Textarea id="gr-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          ) : isService ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {/* A TAG vem do seletor "Tipo de evento" — não se escolhe duas vezes. */}

              <div className="sm:col-span-2">
                <Label>Administrador</Label>
                <Select value={administratorId} onValueChange={setAdministratorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o Administrador" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAdmins.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Obrigatório: identifica a quem pertence o serviço na sua agenda.
                </p>
              </div>
              <div className="sm:col-span-2">
                <TitleField id="sv-title" value={title} onChange={setTitle} field={titleField} />
              </div>
              <div>
                <Label>Origem</Label>
                <CityCombobox cities={cities} value={originCityId} onChange={setOriginCityId} placeholder="Selecionar origem" onCreate={createLocation} />
              </div>
              <div>
                <Label>Destino</Label>
                <CityCombobox cities={cities} value={cityId} onChange={setCityId} placeholder="Selecionar destino" onCreate={createLocation} />
              </div>
              <div className="sm:col-span-2 flex items-start gap-2 rounded-md border bg-surface-2 p-3">
                <Checkbox
                  id="av-round-trip"
                  checked={roundTrip}
                  onCheckedChange={(v) => setRoundTrip(v === true)}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="av-round-trip" className="cursor-pointer">Ida e volta</Label>
                  <p className="text-xs text-muted-foreground">
                    Reserva a deslocação de ida e de regresso. Desative se só faz o percurso de ida.
                  </p>
                </div>
              </div>
               <div>
                 <Label htmlFor="sv-start-date">Data de início</Label>
                 <DateInput id="sv-start-date" value={startDate} onChange={changeStartDate} />
              </div>
              <div className="min-w-0">
                 <Label htmlFor="sv-st">Hora de início</Label>
                <TimeInput
                  id="sv-st"
                  value={startTime}
                   onChange={changeStartTime}
                />
              </div>
               <div>
                 <Label htmlFor="sv-end-date">Data de fim</Label>
                 <DateInput id="sv-end-date" value={endDate} onChange={setEndDate} />
               </div>
              <div className="min-w-0">
                 <Label htmlFor="sv-et">Hora de fim</Label>
                <TimeInput id="sv-et" value={endTime} onChange={setEndTime} />
              </div>
              {requiresApproval && (
                <div className="sm:col-span-2">
                  <Label htmlFor="sv-justification">Justificação</Label>
                  <Textarea
                    id="sv-justification"
                    rows={3}
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Obrigatória: este evento fica pendente de aprovação do Gestor ou do Proprietário.
                  </p>
                </div>
              )}
              <div className="sm:col-span-2">
                <Label htmlFor="sv-notes">Notas (opcional)</Label>
                <Textarea id="sv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={allDay} onCheckedChange={(v) => setAllDay(v === true)} />
                Dia inteiro
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                 <div>
                   <Label htmlFor="av-start">Data de início</Label>
                  <DateInput
                    id="av-start"
                    value={startDate}
                     onChange={changeStartDate}
                  />
                </div>
                {allDay ? (
                  <div>
                    <Label htmlFor="av-end">Data de fim</Label>
                    <DateInput id="av-end" value={endDate} onChange={(v) => setEndDate(v)} />
                  </div>
                ) : (
                  <>
                    <div className="min-w-0">
                       <Label htmlFor="av-st">Hora de início</Label>
                      <TimeInput
                        id="av-st"
                        value={startTime}
                         onChange={changeStartTime}
                      />
                    </div>
                     <div>
                       <Label htmlFor="av-end">Data de fim</Label>
                       <DateInput id="av-end" value={endDate} onChange={setEndDate} />
                     </div>
                    <div className="min-w-0">
                       <Label htmlFor="av-et">Hora de fim</Label>
                      <TimeInput id="av-et" value={endTime} onChange={setEndTime} />
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <Label htmlFor="av-notes">Notas (opcional)</Label>
                  <Textarea id="av-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {!period && (
            <div className="sm:col-span-2">
              <RecurrenceFields
                repeat={repeat}
                onRepeatChange={setRepeat}
                freq={freq}
                onFreqChange={setFreq}
                until={until}
                onUntilChange={setUntil}
                label="Repetir"
                idPrefix="av"
              />
            </div>
          )}
        </div>


        {error && <p className="rounded-md border border-conflict/40 bg-conflict-soft p-3 text-sm text-conflict">{error}</p>}

        <DialogFooter className="sm:justify-between">
          {period ? (
            <Button variant="destructive" onClick={remove} disabled={busy}>
              {deleteTimeOff.isPending || deleteUnavail.isPending ? "A eliminar…" : "Eliminar"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? "A guardar…" : period ? "Guardar alterações" : isService ? "Criar serviço" : "Criar evento"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
