import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
 * Campo de hora em formato PT-PT (HH:MM, 24 horas), independente do idioma do
 * browser (o <input type="time"> nativo pode mostrar AM/PM). O contrato de
 * `value` / `onChange` é sempre "HH:MM".
 */
type Props = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  "aria-label"?: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function mask(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

function normalise(text: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

export function TimeInput({ value, onChange, id, className, ...rest }: Props) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  // Rascunho dentro do modal: só é confirmado com "Concluir".
  const [draft, setDraft] = useState<{ hour: string; minute: string } | null>(null);

  useEffect(() => {
    setText((cur) => (normalise(cur) === value ? cur : value));
  }, [value]);

  const hour = /^\d{2}:\d{2}$/.test(value) ? value.slice(0, 2) : "09";
  const minute = /^\d{2}:\d{2}$/.test(value) ? value.slice(3, 5) : "00";
  const minuteOption = MINUTES.includes(minute) ? minute : MINUTES[Math.floor(Number(minute) / 5)] ?? "00";

  const openPicker = () => {
    setDraft({ hour, minute: minuteOption });
    setOpen(true);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Input
        id={id}
        className="flex-1"
        inputMode="numeric"
        placeholder="HH:MM"
        value={text}
        aria-label={rest["aria-label"]}
        onChange={(e) => {
          const masked = mask(e.target.value);
          setText(masked);
          const next = normalise(masked);
          if (next) onChange(next);
        }}
        onBlur={() => setText(normalise(text) ?? value)}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Escolher hora"
        className="shrink-0"
        onClick={openPicker}
      >
        <Clock className="size-4" />
      </Button>

      {/* Seletor em modal centrado: fundo escurecido, posição estável e sem
          dependência do espaço disponível junto ao campo. */}
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Diálogo secundário: fundo acima de qualquer modal subjacente (z-51) e
            conteúdo acima do próprio fundo, para hierarquia clara. */}
        <DialogContent backdropClassName="z-[52]" className="z-[53] w-[calc(100vw-2rem)] max-w-xs gap-0 p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-base">Escolher hora</DialogTitle>
            <DialogDescription className="sr-only">
              Selecione a hora e os minutos e confirme com Concluir.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="px-4 py-3">
              <TimeOptionColumns
                hour={draft.hour}
                minute={draft.minute}
                onChange={(h, m) => setDraft({ hour: h, minute: m })}
              />
            </div>
          )}
          <DialogFooter className="gap-2 border-t px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (draft) onChange(`${draft.hour}:${draft.minute}`);
                setOpen(false);
              }}
            >
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
