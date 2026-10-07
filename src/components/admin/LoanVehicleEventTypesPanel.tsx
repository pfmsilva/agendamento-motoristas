import { useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TimeInput } from "@/components/TimeInput";
import { downloadExcelRows } from "@/lib/excel-export";
import { LOAN_COLOR_LABEL, useDeleteLoanEventType, useLoanEventTypes, useSaveLoanEventType, type LoanColorKey, type LoanEventType } from "@/lib/loan-vehicles";

type Editor = LoanEventType | "new" | null;

export function LoanVehicleEventTypesPanel() {
  const { data: types = [] } = useLoanEventTypes();
  const remove = useDeleteLoanEventType();
  const [editing, setEditing] = useState<Editor>(null);
  const [deleting, setDeleting] = useState<LoanEventType | null>(null);
  const exportRows = () => void downloadExcelRows(types.map((type) => ({
    Chave: type.key, Nome: type.label, Estado: type.active ? "Ativo" : "Inativo",
    Cor: LOAN_COLOR_LABEL[type.color_key as LoanColorKey] ?? type.color_key,
    Padrão: type.pattern === "dashed" ? "Tracejado" : "Sólido",
    "Exige pessoa": type.requires_person ? "Sim" : "Não",
    "Permite permanência": type.allows_permanent ? "Sim" : "Não",
    "Sobrepõe permanentes": type.allows_overlap_with_permanent ? "Sim" : "Não",
    "Hora inicial": type.default_start_time.slice(0, 5), "Hora final": type.default_end_time.slice(0, 5),
  })), "Tipos de viaturas", "tipos-evento-viaturas.xlsx");
  return <section className="panel overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4">
      <div><h2 className="text-base font-semibold">Tipos de evento de Viaturas</h2><p className="text-xs text-muted-foreground">Configure os campos, o aspeto e as regras operacionais dos eventos de viaturas.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportRows} disabled={!types.length}><Download className="size-4" />Exportar Excel</Button><Button onClick={() => setEditing("new")}><Plus className="size-4" />Novo tipo</Button></div>
    </div>
    <div className="overflow-x-auto"><Table className="min-w-[820px]"><TableHeader><TableRow><TableHead className="px-4">Tipo</TableHead><TableHead>Regras</TableHead><TableHead>Aspeto</TableHead><TableHead>Estado</TableHead><TableHead className="px-4 text-right">Ações</TableHead></TableRow></TableHeader><TableBody>
      {types.map((type) => <TableRow key={type.key}><TableCell className="px-4 py-3 font-medium">{type.label}</TableCell><TableCell className="py-3 text-xs text-muted-foreground">{[type.requires_person && "Pessoa obrigatória", type.allows_permanent && "Pode ser permanente", type.allows_overlap_with_permanent && "Sobrepõe permanentes"].filter(Boolean).join(" · ") || "Sem regras adicionais"}</TableCell><TableCell className="py-3 text-xs">{LOAN_COLOR_LABEL[type.color_key as LoanColorKey] ?? type.color_key} · {type.pattern === "dashed" ? "Tracejado" : "Sólido"}</TableCell><TableCell className="py-3"><Badge variant={type.active ? "default" : "outline"}>{type.active ? "Ativo" : "Inativo"}</Badge></TableCell><TableCell className="px-4 py-3 text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing(type)}>Editar</Button><Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleting(type)}><Trash2 className="size-4" />Eliminar</Button></div></TableCell></TableRow>)}
    </TableBody></Table></div>
    <LoanTypeDialog key={editing === "new" ? "new" : editing?.key ?? "closed"} open={editing !== null} type={editing === "new" ? null : editing} nextOrder={(types.at(-1)?.sort_order ?? 0) + 10} onOpenChange={(open) => !open && setEditing(null)} />
    <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminar tipo de evento?</AlertDialogTitle><AlertDialogDescription>«{deleting?.label}» será removido permanentemente das novas escolhas. Os eventos existentes mantêm o nome e o aspeto históricos.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { if (!deleting) return; try { await remove.mutateAsync(deleting.key); toast.success("Tipo de evento eliminado"); setDeleting(null); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível eliminar"); } }}>Eliminar permanentemente</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}

function LoanTypeDialog({ open, type, nextOrder, onOpenChange }: { open: boolean; type: LoanEventType | null; nextOrder: number; onOpenChange: (open: boolean) => void }) {
  const save = useSaveLoanEventType();
  const [label, setLabel] = useState(type?.label ?? "");
  const [color, setColor] = useState<LoanColorKey>((type?.color_key as LoanColorKey) ?? "teal");
  const [pattern, setPattern] = useState(type?.pattern ?? "solid");
  const [requiresPerson, setRequiresPerson] = useState(type?.requires_person ?? false);
  const [allowsPermanent, setAllowsPermanent] = useState(type?.allows_permanent ?? false);
  const [overlapPermanent, setOverlapPermanent] = useState(type?.allows_overlap_with_permanent ?? true);
  const [startTime, setStartTime] = useState(type?.default_start_time.slice(0, 5) ?? "09:00");
  const [endTime, setEndTime] = useState(type?.default_end_time.slice(0, 5) ?? "18:00");
  const [active, setActive] = useState(type?.active ?? true);
  const submit = async () => { if (!label.trim()) { toast.error("Indique o nome do tipo de evento."); return; } try { await save.mutateAsync({ ...(type ? { key: type.key } : {}), label, colorKey: color, pattern, requiresPerson, allowsPermanent, allowsOverlapWithPermanent: overlapPermanent, defaultStartTime: startTime, defaultEndTime: endTime, active, sortOrder: type?.sort_order ?? nextOrder }); toast.success(type ? "Tipo atualizado" : "Tipo criado"); onOpenChange(false); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível guardar"); } };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{type ? "Editar tipo de evento" : "Novo tipo de evento"}</DialogTitle><DialogDescription>Defina livremente o comportamento deste tipo nos eventos de viaturas.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label htmlFor="loan-type-label">Nome</Label><Input id="loan-type-label" value={label} onChange={(event) => setLabel(event.target.value)} /></div><div><Label>Cor</Label><Select value={color} onValueChange={(value) => setColor(value as LoanColorKey)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(LOAN_COLOR_LABEL).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent></Select></div><div><Label>Padrão</Label><Select value={pattern} onValueChange={setPattern}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="solid">Sólido</SelectItem><SelectItem value="dashed">Tracejado</SelectItem></SelectContent></Select></div><div><Label>Hora inicial sugerida</Label><TimeInput value={startTime} onChange={setStartTime} /></div><div><Label>Hora final sugerida</Label><TimeInput value={endTime} onChange={setEndTime} /></div>
    <Option id="loan-type-person" checked={requiresPerson} onChange={setRequiresPerson} label="Exige pessoa associada" description="O nome da pessoa é obrigatório ao guardar." /><Option id="loan-type-permanent" checked={allowsPermanent} onChange={setAllowsPermanent} label="Permite registos permanentes" description="O evento pode ficar sem fim operacional." /><Option id="loan-type-overlap" checked={overlapPermanent} onChange={setOverlapPermanent} label="Pode sobrepor permanentes" description="Quando temporário, recorta o evento permanente sem o alterar." /><div className="flex items-center justify-between rounded-md border bg-surface-2 p-3"><Label htmlFor="loan-type-active">Tipo ativo</Label><Switch id="loan-type-active" checked={active} onCheckedChange={setActive} /></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={() => void submit()} disabled={save.isPending}>Guardar</Button></DialogFooter></DialogContent></Dialog>;
}

function Option({ id, checked, onChange, label, description }: { id: string; checked: boolean; onChange: (value: boolean) => void; label: string; description: string }) {
  return <div className="flex items-start gap-3 rounded-md border bg-surface-2 p-3"><Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} /><div><Label htmlFor={id}>{label}</Label><p className="text-xs text-muted-foreground">{description}</p></div></div>;
}