import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useAdjustReasons,
  useDeleteAdjustReason,
  useSaveAdjustReason,
  type TravelAdjustReason,
} from "@/lib/data";
import { errorMessagePt } from "@/lib/errors";

/**
 * Motivos de ajuste da deslocação. Configuração global: aplica-se a todos os
 * perfis que ajustam manualmente a ocupação de um evento.
 */
export function AdjustReasonsPanel() {
  const { data: reasons = [] } = useAdjustReasons();
  const save = useSaveAdjustReason();
  const [label, setLabel] = useState("");

  const add = async () => {
    if (!label.trim()) return;
    try {
      await save.mutateAsync({
        label,
        sortOrder: (reasons[reasons.length - 1]?.sort_order ?? 0) + 1,
      });
      toast.success("Motivo adicionado");
      setLabel("");
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível guardar o motivo"));
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const a = reasons[index];
    const b = reasons[index + dir];
    if (!a || !b) return;
    try {
      await save.mutateAsync({ id: a.id, label: a.label, sortOrder: b.sort_order });
      await save.mutateAsync({ id: b.id, label: b.label, sortOrder: a.sort_order });
    } catch (e) {
      toast.error(errorMessagePt(e, "Não foi possível reordenar"));
    }
  };

  return (
    <section className="panel space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">Motivos de ajuste da deslocação</h2>
        <p className="text-xs text-muted-foreground">
          Indicados obrigatoriamente sempre que alguém altera manualmente o tempo de deslocação de um
          evento. Todos os motivos podem ser editados ou eliminados.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label>Novo motivo</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-72"
            placeholder="Ex.: Trânsito imprevisto"
          />
        </div>
        <Button onClick={() => void add()} disabled={!label.trim() || save.isPending}>
          Adicionar
        </Button>
      </div>

      <ul className="divide-y text-sm">
        {reasons.map((r, i) => (
          <ReasonRow
            key={r.id}
            reason={r}
            first={i === 0}
            last={i === reasons.length - 1}
            onMove={(dir) => void move(i, dir)}
          />
        ))}
        {reasons.length === 0 && <li className="py-2 text-muted-foreground">Sem motivos configurados.</li>}
      </ul>
    </section>
  );
}

function ReasonRow({
  reason,
  first,
  last,
  onMove,
}: {
  reason: TravelAdjustReason;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  const save = useSaveAdjustReason();
  const remove = useDeleteAdjustReason();
  const [label, setLabel] = useState(reason.label);
  const dirty = label.trim() !== reason.label;

  return (
    <li className="flex flex-wrap items-center gap-2 py-3">
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" disabled={first} onClick={() => onMove(-1)} aria-label="Subir">
          <ArrowUp className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" disabled={last} onClick={() => onMove(1)} aria-label="Descer">
          <ArrowDown className="size-4" />
        </Button>
      </div>
      <Input value={label} onChange={(e) => setLabel(e.target.value)} className="min-w-48 flex-1 sm:max-w-72" />
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={reason.active}
            onCheckedChange={async (v) => {
              try {
                await save.mutateAsync({ id: reason.id, label: reason.label, active: v });
              } catch (e) {
                toast.error(errorMessagePt(e, "Não foi possível alterar o motivo"));
              }
            }}
          />
          {reason.active ? "Ativo" : "Inativo"}
        </label>
        <Button
          size="sm"
          variant={dirty ? "default" : "ghost"}
          disabled={!dirty || save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync({ id: reason.id, label });
              toast.success("Motivo atualizado");
            } catch (e) {
              toast.error(errorMessagePt(e, "Não foi possível guardar o motivo"));
            }
          }}
        >
          Guardar
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={remove.isPending}
            >
              Eliminar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar motivo de ajuste?</AlertDialogTitle>
              <AlertDialogDescription>
                «{reason.label}» será removido permanentemente. Os ajustes já registados mantêm este nome no histórico e na auditoria.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={remove.isPending}
                onClick={async () => {
                  try {
                    await remove.mutateAsync(reason.id);
                    toast.success("Motivo eliminado");
                  } catch (e) {
                    toast.error(errorMessagePt(e, "Não foi possível eliminar o motivo"));
                  }
                }}
              >
                Eliminar permanentemente
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}
