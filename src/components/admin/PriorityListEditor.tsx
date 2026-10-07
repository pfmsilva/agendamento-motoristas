import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { GripVertical, Trash2 } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminPriorities, useDrivers, useSetAdministratorPriorities } from "@/lib/data";
import { errorMessagePt } from "@/lib/errors";
import type { Driver } from "@/lib/scheduling";

type Props = {
  administratorId: string;
  /** false = apenas leitura (assistente ou Administrador a ver a hierarquia) */
  editable?: boolean;
};

/**
 * Hierarquia ordenada de motoristas de um Administrador. A posição 1 é a primeira
 * a ser considerada na atribuição automática. Reordenar afeta apenas serviços futuros.
 */
export function PriorityListEditor({ administratorId, editable = true }: Props) {
  const { data: drivers = [] } = useDrivers();
  const { data: rows = [] } = useAdminPriorities();
  const save = useSetAdministratorPriorities();

  const saved = useMemo(
    () =>
      rows
        .filter((r) => r.administrator_id === administratorId)
        .sort((a, b) => a.priority - b.priority)
        .map((r) => r.driver_id),
    [rows, administratorId],
  );

  const [order, setOrder] = useState<string[]>(saved);
  const [adding, setAdding] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const latestOrder = useRef(order);
  const savingKey = useRef("");
  // Volta a sincronizar quando a hierarquia guardada muda (outro utilizador, outra ficha).
  useEffect(() => {
    const savedKey = saved.join("|");
    if (savingKey.current) {
      if (savedKey !== savingKey.current) return;
      savingKey.current = "";
      if (latestOrder.current.join("|") !== savedKey) return;
    }
    latestOrder.current = saved;
    setOrder(saved);
  }, [saved.join("|"), administratorId]);

  const dirty = order.join("|") !== saved.join("|");
  const byId = new Map(drivers.map((d) => [d.id, d] as const));
  const available = drivers.filter((d) => d.active && !order.includes(d.id));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const changeOrder = (next: string[]) => {
    latestOrder.current = next;
    setOrder(next);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    changeOrder(arrayMove(order, from, to));
  };

  useEffect(() => {
    if (!editable || !dirty) return;
    const next = [...order];
    const key = next.join("|");
    const timer = window.setTimeout(async () => {
      savingKey.current = key;
      setSaveState("saving");
      try {
        await save.mutateAsync({ administratorId, driverIds: next });
        if (latestOrder.current.join("|") === key) {
          setSaveState("saved");
          window.setTimeout(() => setSaveState("idle"), 1800);
        }
      } catch (e) {
        savingKey.current = "";
        setSaveState("idle");
        toast.error(errorMessagePt(e, "Não foi possível guardar a hierarquia"));
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [administratorId, dirty, editable, order.join("|")]);

  return (
    <div className="space-y-3">
      {order.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sem motoristas na hierarquia. Os serviços deste Administrador ficarão por atribuir.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <ol className="divide-y border-y">
              {order.map((id, idx) => (
                <PriorityRow
                  key={id}
                  id={id}
                  index={idx}
                  driver={byId.get(id)}
                  editable={editable}
                  onRemove={() => setRemoveId(id)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {editable && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <Label className="text-xs text-muted-foreground">Adicionar motorista</Label>
            <Select
              value={adding}
              onValueChange={(v) => {
                setAdding("");
                if (v && !order.includes(v)) changeOrder([...order, v]);
              }}
            >
              <SelectTrigger aria-label="Adicionar motorista">
                <SelectValue placeholder={available.length ? "Selecionar" : "Todos os motoristas já estão na hierarquia"} />
              </SelectTrigger>
              <SelectContent>
                {available.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="min-w-28 pb-2 text-right text-xs text-muted-foreground" aria-live="polite">
            {saveState === "saving" ? "A guardar…" : saveState === "saved" ? "Alterações guardadas" : ""}
          </span>
        </div>
      )}
      {editable && (
        <p className="text-xs text-muted-foreground">
          A ordem define quem é considerado primeiro na atribuição automática. Alterações só afetam
          serviços criados a partir de agora; os já atribuídos mantêm o motorista.
        </p>
      )}
      <AlertDialog open={removeId !== null} onOpenChange={(open) => !open && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover motorista da hierarquia?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta alteração afeta apenas a atribuição automática de novos serviços. O histórico mantém-se.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (removeId) changeOrder(order.filter((id) => id !== removeId));
                setRemoveId(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PriorityRow({
  id,
  index,
  driver,
  editable,
  onRemove,
}: {
  id: string;
  index: number;
  driver: Driver | undefined;
  editable: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editable,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 bg-card px-1 py-1.5 text-sm ${isDragging ? "z-10 shadow-md" : ""}`}
    >
      {editable && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
          aria-label={`Arrastar ${driver?.name ?? "motorista"}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </Button>
      )}
      <span className="w-6 text-right font-semibold tabular-nums text-primary">{index + 1}.</span>
      <span className="flex-1 truncate font-medium">
        {driver?.name ?? "Motorista"}
        {driver && !driver.active && <span className="ml-1 text-xs text-muted-foreground">(inativo)</span>}
      </span>
      {editable && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive"
          aria-label="Remover da hierarquia"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </li>
  );
}
