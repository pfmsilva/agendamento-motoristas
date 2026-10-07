import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useSaveLoanVehicle,
  useSetLoanVehicleActive,
  type LoanVehicle,
} from "@/lib/loan-vehicles";

/** Gestão das viaturas de empréstimo: adicionar, editar e desativar. */
export function ManageVehiclesDialog({
  open,
  onOpenChange,
  vehicles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicles: LoanVehicle[];
}) {
  const save = useSaveLoanVehicle();
  const setActive = useSetLoanVehicleActive();
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");

  const reset = () => {
    setEditingId(null);
    setPlate("");
    setBrand("");
    setModel("");
  };

  const submit = async () => {
    if (!plate.trim()) {
      toast.error("Indique a matrícula.");
      return;
    }
    try {
      await save.mutateAsync({ id: editingId ?? undefined, plate, brand, model });
      toast.success(editingId ? "Viatura atualizada." : "Viatura adicionada.");
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar.");
    }
  };

  const list = vehicles.filter((v) => showInactive || v.active);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Gerir viaturas</DialogTitle>
          <DialogDescription>
            A matrícula é obrigatória e não pode repetir-se. As viaturas inativas mantêm todo o histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-lg border border-border bg-surface p-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="veh-plate">Matrícula</Label>
            <Input id="veh-plate" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="12-AB-34" />
          </div>
          <div>
            <Label htmlFor="veh-brand">Marca</Label>
            <Input id="veh-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="veh-model">Modelo</Label>
            <Input id="veh-model" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={submit} disabled={save.isPending} className="flex-1">
              {editingId ? "Guardar" : "+ Adicionar viatura"}
            </Button>
            {editingId && (
              <Button variant="ghost" onClick={reset}>
                Cancelar
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Switch id="veh-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
          <Label htmlFor="veh-inactive" className="font-normal">Mostrar viaturas inativas</Label>
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Matrícula</th>
                <th className="px-3 py-2">Marca</th>
                <th className="px-3 py-2">Modelo</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{v.plate}</td>
                  <td className="px-3 py-2">{v.brand ?? "—"}</td>
                  <td className="px-3 py-2">{v.model ?? "—"}</td>
                  <td className="px-3 py-2">{v.active ? "Ativa" : "Inativa"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(v.id);
                        setPlate(v.plate);
                        setBrand(v.brand ?? "");
                        setModel(v.model ?? "");
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setActive.mutate(
                          { id: v.id, active: !v.active },
                          {
                            onSuccess: () => toast.success(v.active ? "Viatura desativada." : "Viatura reativada."),
                            onError: (e) => toast.error(e instanceof Error ? e.message : "Erro."),
                          },
                        )
                      }
                    >
                      {v.active ? "Desativar" : "Reativar"}
                    </Button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    Ainda não há viaturas registadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
