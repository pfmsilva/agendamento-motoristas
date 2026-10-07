import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Seletor compacto PT-PT. Os controlos nativos são estáveis e acessíveis;
 *  não existem rodas, listas permanentemente abertas ou áreas com scroll. */
export const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
export const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

const selectClass =
  "h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm tabular-nums " +
  "outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";

export function TimeOptionColumns({
  hour,
  minute,
  onChange,
  className,
}: {
  hour: string;
  minute: string;
  onChange: (hour: string, minute: string) => void;
  className?: string;
  /** Mantido por compatibilidade; já não é usado. */
  heightClass?: string;
}) {
  return (
    <div className={cn("grid w-full grid-cols-[1fr_auto_1fr] items-end gap-2", className)}>
      <label className="min-w-0 space-y-1">
        <span className="block text-xs text-muted-foreground">Hora</span>
        <span className="relative block">
          <select
            aria-label="Hora"
            className={selectClass}
            value={hour}
            onChange={(e) => onChange(e.target.value, minute)}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </span>
      </label>
      <span className="pb-2 text-sm text-muted-foreground">:</span>
      <label className="min-w-0 space-y-1">
        <span className="block text-xs text-muted-foreground">Minutos</span>
        <span className="relative block">
          <select
            aria-label="Minutos"
            className={selectClass}
            value={minute}
            onChange={(e) => onChange(hour, e.target.value)}
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </span>
      </label>
    </div>
  );
}
