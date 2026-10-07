import { AlertTriangle, CalendarOff, CircleSlash, Clock } from "lucide-react";
import {
  AVAILABILITY_CLASS,
  AVAILABILITY_LABEL,
  CONFLICT_CLASS,
  CONFLICT_LABEL,
  type AvailabilityResult,
  type ConflictKind,
} from "@/lib/scheduling";

const ICON: Record<ConflictKind, typeof AlertTriangle> = {
  timeoff: CalendarOff,
  unavailability: CircleSlash,
  activity: AlertTriangle,
  conditional: Clock,
};

const ORDER: ConflictKind[] = ["timeoff", "unavailability", "activity", "conditional"];

type Props = {
  result: AvailabilityResult;
  driverName?: string | null;
  className?: string;
  children?: React.ReactNode;
};

/** Shared warning panel: groups conflicts by type so férias and indisponibilidade never look alike. */
export function AvailabilityWarning({ result, driverName, className, children }: Props) {
  if (result.status === "AVAILABLE") return null;
  const blocked = result.status === "UNAVAILABLE";

  // "A confirmar": um único indicador e uma linha de aviso, sem caixas empilhadas.
  if (!blocked) {
    return (
      <div className={`rounded-md border border-warning/50 bg-warning-soft p-3 text-sm text-warning ${className ?? ""}`}>
        <p className="flex flex-wrap items-center gap-2">
          <Clock className="size-4 shrink-0" />
          <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${AVAILABILITY_CLASS.CONDITIONAL}`}>
            {AVAILABILITY_LABEL.CONDITIONAL}
          </span>
          {driverName && <span className="text-xs font-medium opacity-80">{driverName}</span>}
        </p>
        <p className="mt-1.5 text-xs">{result.reasons.join(" · ")}</p>
        {children}
      </div>
    );
  }

  const groups = ORDER.map((kind) => ({
    kind,
    items: result.conflicts.filter((c) => c.kind === kind),
  })).filter((g) => g.items.length > 0);

  return (
    <div
      className={`rounded-md border p-3 text-sm ${
        blocked ? "border-conflict/40 bg-conflict-soft text-conflict" : "border-warning/50 bg-warning-soft text-warning"
      } ${className ?? ""}`}
    >
      <p className="flex flex-wrap items-center gap-2 font-semibold">
        <AlertTriangle className="size-4" />
        <span className={`rounded border px-1.5 py-0.5 text-[11px] ${AVAILABILITY_CLASS[result.status]}`}>
          {AVAILABILITY_LABEL[result.status]}
        </span>
        {driverName && <span className="text-xs font-medium opacity-80">{driverName}</span>}
      </p>

      <div className="mt-2 space-y-2">
        {groups.map(({ kind, items }) => {
          const Icon = ICON[kind];
          return (
            <div key={kind} className={`rounded-md border px-2.5 py-2 ${CONFLICT_CLASS[kind]}`}>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                <Icon className="size-3.5" /> {CONFLICT_LABEL[kind]}
              </p>
              <ul className="mt-1 space-y-0.5">
                {items.map((c) => (
                  <li key={c.message}>{c.message}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {children}
    </div>
  );
}
