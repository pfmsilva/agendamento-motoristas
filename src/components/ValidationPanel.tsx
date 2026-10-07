import { useMemo } from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  useActivityValidations,
  useAdjustReasons,
  useCities,
  useDecideActivityChange,
  useDrivers,
  useEventTags,
  type ActivityChangeValidation,
  type ValidationChange,
} from "@/lib/data";
import { STATUS_LABEL, TYPE_LABEL, fmtDateTime } from "@/lib/scheduling";

const FIELD_LABEL: Record<string, string> = {
  title: "Título",
  type: "Tipo",
  notes: "Notas",
  start_datetime: "Início do serviço",
  end_datetime: "Fim do serviço",
  city_id: "Destino",
  origin_city_id: "Origem",
  status: "Estado",
  round_trip: "Ida e volta",
  tag_id: "TAG",
  driver_adjusted_start: "Início da ocupação",
  driver_adjusted_end: "Fim da ocupação",
  adjustment_reason_id: "Motivo do ajuste",
};

const DATE_FIELDS = new Set([
  "start_datetime",
  "end_datetime",
  "driver_adjusted_start",
  "driver_adjusted_end",
]);

/**
 * Validação silenciosa de alterações feitas por motoristas a eventos passados.
 * Visível apenas a Proprietário e Gestor - o motorista nunca sabe que existe.
 */
export function ValidationPanel() {
  const { user } = useAuth();
  const privileged = user?.role === "owner" || user?.role === "manager";
  const { data: validations = [] } = useActivityValidations();
  const { data: drivers = [] } = useDrivers();
  const { data: cities = [] } = useCities();
  const { data: tags = [] } = useEventTags();
  const { data: reasons = [] } = useAdjustReasons();
  const decide = useDecideActivityChange();

  const pending = useMemo(
    () => validations.filter((v) => v.status === "pending"),
    [validations],
  );

  const label = (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "(vazio)";
    const text = String(value);
    if (field === "city_id" || field === "origin_city_id")
      return cities.find((c) => c.id === text)?.name ?? "(vazio)";
    if (field === "tag_id") return tags.find((t) => t.id === text)?.label ?? "(vazio)";
    if (field === "adjustment_reason_id")
      return reasons.find((r) => r.id === text)?.label ?? "(vazio)";
    if (DATE_FIELDS.has(field)) return fmtDateTime(text);
    if (field === "round_trip") return value === true ? "Sim" : "Não";
    if (field === "status") return STATUS_LABEL[text as keyof typeof STATUS_LABEL] ?? text;
    if (field === "type") return TYPE_LABEL[text as keyof typeof TYPE_LABEL] ?? text;
    return text;
  };

  const rows = (v: ActivityChangeValidation) =>
    ((v.changes as unknown as ValidationChange[] | null) ?? []).map((c) => (
      <li key={c.field} className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {FIELD_LABEL[c.field] ?? c.field}:
        </span>{" "}
        {label(c.field, c.old)} → {label(c.field, c.new)}
      </li>
    ));

  const driverName = (id: string | null) =>
    drivers.find((d) => d.id === id)?.name ?? "Motorista";

  // A secção só existe enquanto houver validações pendentes; o histórico
  // fica acessível na área de Auditoria.
  if (!privileged || pending.length === 0) return null;

  return (
    <section className="rounded-md border border-leave bg-leave-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-leave">
          <ShieldAlert className="size-4" />
          {pending.length === 1
            ? "1 alteração a evento passado aguarda validação"
            : `${pending.length} alterações a eventos passados aguardam validação`}
        </h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Área reservada a Proprietário e Gestor. O motorista não é informado destas validações.
      </p>

      <ul className="mt-2 divide-y">
        {pending.map((v) => (
          <li key={v.id} className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {v.event_title}{" "}
                <span className="font-normal text-muted-foreground">
                  · {driverName(v.driver_id)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Data do evento: {fmtDateTime(v.event_start)} · Alterado em:{" "}
                {fmtDateTime(v.changed_at)}
              </p>
              <ul className="mt-1 space-y-0.5">{rows(v)}</ul>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: v.id, approve: true })}
              >
                <Check className="size-4" /> Aprovar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: v.id, approve: false })}
              >
                <X className="size-4" /> Rejeitar
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
