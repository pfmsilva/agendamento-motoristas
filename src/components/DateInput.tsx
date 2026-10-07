import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { pt } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MINUTES, TimeOptionColumns } from "@/components/TimeOptionColumns";
import { cn } from "@/lib/utils";

/**
 * Date / date-time field that always displays PT-PT format (DD/MM/AAAA),
 * regardless of the browser locale (native <input type="date"> follows the
 * browser locale, which can render MM/DD/YYYY). A calendar/time picker is
 * available next to the field, so the value can also be chosen with the mouse.
 *
 * The `value` / `onChange` contract stays ISO-like so callers are unchanged:
 *  - date:     "AAAA-MM-DD"
 *  - dateTime: "AAAA-MM-DDTHH:MM"
 */
type Props = {
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
};

function isoToDisplay(iso: string, withTime: boolean) {
  if (!iso) return "";
  const [datePart, timePart = ""] = iso.split("T");
  const [y, m, d] = (datePart ?? "").split("-");
  if (!y || !m || !d) return "";
  const date = `${d}/${m}/${y}`;
  return withTime ? `${date}${timePart ? ` ${timePart.slice(0, 5)}` : ""}` : date;
}

function displayToIso(text: string, withTime: boolean): string | null {
  const trimmed = text.trim();
  const match = withTime
    ? /^(\d{2})\/(\d{2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?$/.exec(trimmed)
    : /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const [, d, m, y, hh, mm] = match;
  const day = Number(d), month = Number(m);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${y}-${m}-${d}`;
  if (!withTime) return iso;
  return `${iso}T${String(hh ?? "00").padStart(2, "0")}:${mm ?? "00"}`;
}

function digitsMask(text: string, withTime: boolean) {
  const digits = text.replace(/\D/g, "").slice(0, withTime ? 12 : 8);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += `/${digits.slice(2, 4)}`;
  if (digits.length > 4) out += `/${digits.slice(4, 8)}`;
  if (withTime && digits.length > 8) out += ` ${digits.slice(8, 10)}`;
  if (withTime && digits.length > 10) out += `:${digits.slice(10, 12)}`;
  return out;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Next round 5-minute mark, used when the field is still empty. */
function defaultParts() {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5, 0, 0);
  return {
    datePart: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    hour: pad(now.getHours()),
    minute: pad(now.getMinutes()),
  };
}

export function DateInput({ value, onChange, withTime = false, id, className, ...rest }: Props) {
  const [text, setText] = useState(() => isoToDisplay(value, withTime));
  const [open, setOpen] = useState(false);
  // Rascunho dentro do modal: só é confirmado com "Concluir".
  const [draft, setDraft] = useState<{ date: string; hour: string; minute: string } | null>(null);

  useEffect(() => {
    const next = isoToDisplay(value, withTime);
    setText((cur) => (displayToIso(cur, withTime) === value ? cur : next));
  }, [value, withTime]);

  const fallback = defaultParts();
  const [rawDate = "", rawTime = ""] = value.split("T");
  const datePart = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : "";
  const valueHour = rawTime.slice(0, 2) || fallback.hour;
  const valueMinute = rawTime.slice(3, 5) || fallback.minute;
  const valueMinuteOption = MINUTES.includes(valueMinute)
    ? valueMinute
    : MINUTES[Math.floor(Number(valueMinute) / 5)] ?? "00";

  const openPicker = () => {
    setDraft({
      date: datePart || fallback.datePart,
      hour: valueHour,
      minute: valueMinuteOption,
    });
    setOpen(true);
  };

  const confirm = () => {
    if (!draft) return;
    onChange(withTime ? `${draft.date}T${draft.hour}:${draft.minute}` : draft.date);
    setOpen(false);
  };

  const selectedDate = draft?.date ? new Date(`${draft.date}T00:00:00`) : undefined;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Input
        id={id}
        className="flex-1"
        inputMode="numeric"
        placeholder={withTime ? "DD/MM/AAAA HH:MM" : "DD/MM/AAAA"}
        value={text}
        aria-label={rest["aria-label"]}
        onChange={(e) => {
          const masked = digitsMask(e.target.value, withTime);
          setText(masked);
          const iso = displayToIso(masked, withTime);
          if (iso) onChange(iso);
        }}
        onBlur={() => setText(isoToDisplay(value, withTime))}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={withTime ? "Escolher data e hora" : "Abrir calendário"}
        className="shrink-0"
        onClick={openPicker}
      >
        <CalendarDays className="size-4" />
      </Button>

      {/* Seletor em modal centrado: fundo escurecido, posição estável e sem
          dependência do espaço disponível junto ao campo. */}
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Diálogo secundário: fundo acima do modal "Novo serviço" (z-51) e
            conteúdo acima do próprio fundo, para hierarquia clara. */}
        <DialogContent backdropClassName="z-[52]" className="z-[53] flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-xs flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-base">
              {withTime ? "Escolher data e hora" : "Escolher data"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Selecione a data{withTime ? ", a hora e os minutos" : ""} e confirme com Concluir.
            </DialogDescription>
          </DialogHeader>

          {/* Em ecrãs baixos o calendário roda; a hora e o botão "Concluir"
              ficam sempre visíveis no fundo do modal. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {draft && (
              <Calendar
                mode="single"
                locale={pt}
                className="pointer-events-auto w-full p-3"
                selected={selectedDate}
                defaultMonth={selectedDate ?? new Date()}
                onSelect={(d) => {
                  if (!d) return;
                  const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                  if (withTime) {
                    setDraft((cur) => (cur ? { ...cur, date: iso } : cur));
                  } else {
                    onChange(iso);
                    setOpen(false);
                  }
                }}
              />
            )}
          </div>

          {withTime && draft && (
            <div className="shrink-0 border-t px-4 py-3">
              <TimeOptionColumns
                hour={draft.hour}
                minute={draft.minute}
                onChange={(h, m) => setDraft({ ...draft, hour: h, minute: m })}
              />
            </div>
          )}

          {withTime && (
            <DialogFooter className="shrink-0 gap-2 border-t px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={confirm}>
                Concluir
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
