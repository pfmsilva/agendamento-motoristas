import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput } from "@/components/DateInput";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RECURRENCE_OPTIONS, WEEKDAY_LABELS, type RecurrenceFreq } from "@/lib/recurrence";

export const RECURRENCE_LABEL_PT: Record<RecurrenceFreq, string> = {
  daily: "Todos os dias",
  weekly: "Todas as semanas",
  monthly: "Todos os meses",
  yearly: "Todos os anos",
};

/**
 * Bloco de recorrência único da aplicação: usado em todos os formulários de
 * criação, seja qual for o tipo de evento ou o perfil de quem cria.
 */
export function RecurrenceFields({
  repeat,
  onRepeatChange,
  freq,
  onFreqChange,
  until,
  onUntilChange,
  label = "Repetir este evento",
  idPrefix = "rec",
  weekdays,
  onWeekdaysChange,
}: {
  repeat: boolean;
  onRepeatChange: (v: boolean) => void;
  freq: RecurrenceFreq;
  onFreqChange: (v: RecurrenceFreq) => void;
  until: string;
  onUntilChange: (v: string) => void;
  label?: string;
  idPrefix?: string;
  /** Dias da semana (só nos serviços): sem dias, repete no mesmo dia da semana. */
  weekdays?: number[];
  onWeekdaysChange?: ((v: number[]) => void) | undefined;
}) {
  const toggleDay = (day: number) =>
    onWeekdaysChange?.(
      weekdays?.includes(day) ? weekdays.filter((d) => d !== day) : [...(weekdays ?? []), day].sort(),
    );
  return (
    <div className="rounded-md border bg-surface-2 p-3">
      <label className="flex items-start gap-2 text-sm font-medium">
        <Checkbox className="mt-0.5" checked={repeat} onCheckedChange={(v) => onRepeatChange(Boolean(v))} />
        {label}
      </label>
      {repeat && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Frequência</Label>
            <Select value={freq} onValueChange={(v) => onFreqChange(v as RecurrenceFreq)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECURRENCE_OPTIONS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {RECURRENCE_LABEL_PT[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-until`}>Repetir até (opcional)</Label>
            <DateInput id={`${idPrefix}-until`} value={until} onChange={onUntilChange} />
            <p className="mt-1 text-xs text-muted-foreground">
              Sem data, a repetição não tem fim definido.
            </p>
          </div>
          {freq === "weekly" && onWeekdaysChange && (
            <div className="sm:col-span-2">
              <Label>Dias da semana</Label>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {WEEKDAY_LABELS.map((day) => (
                  <Button
                    key={day.value}
                    type="button"
                    size="sm"
                    variant={weekdays?.includes(day.value) ? "default" : "outline"}
                    aria-pressed={weekdays?.includes(day.value) ?? false}
                    onClick={() => toggleDay(day.value)}
                  >
                    {day.short}
                  </Button>
                ))}
                <Button type="button" size="sm" variant="ghost" onClick={() => onWeekdaysChange([1, 2, 3, 4, 5])}>
                  Dias úteis
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Sem dias escolhidos, repete no mesmo dia da semana do primeiro serviço.
              </p>
            </div>
          )}
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            Cada data é um evento independente: a disponibilidade é verificada em separado e cada data
            pode ser alterada, cancelada ou reatribuída isoladamente.
          </p>
        </div>
      )}
    </div>
  );
}
