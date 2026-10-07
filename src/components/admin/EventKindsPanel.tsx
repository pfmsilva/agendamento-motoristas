import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type EventKindTag,
  type EventTag,
  useEventKindTags,
  useEventTags,
  useDeleteEventKind,
  useSaveEventKind,
  useSaveEventTag,
} from "@/lib/data";
import { errorMessagePt } from "@/lib/errors";

/** Gestão única dos tipos de evento e respetivas TAGs. */
export function EventKindsPanel() {
  const { data: kinds = [] } = useEventKindTags();
  const { data: tags = [] } = useEventTags();
  const remove = useDeleteEventKind();
  const [editing, setEditing] = useState<EventKindTag | "new" | null>(null);
  const [deleting, setDeleting] = useState<EventKindTag | null>(null);
  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);

  return (
    <section className="panel overflow-hidden">
      <div className="grid grid-cols-1 items-start gap-4 border-b px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Tipos de evento</h2>
          <p className="text-xs text-muted-foreground">
            Cada tipo tem uma TAG usada nos filtros e análises. As alterações aplicam-se apenas a novos eventos.
          </p>
        </div>
        <Button className="w-full shrink-0 sm:w-auto" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Novo tipo de evento
        </Button>
      </div>

      <Table className="min-w-[680px]">
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-56 px-4">Tipo de evento</TableHead>
            <TableHead className="min-w-48 px-4">TAG associada</TableHead>
            <TableHead className="px-4">Estado</TableHead>
            <TableHead className="w-44 px-4 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {kinds.map((kind) => {
            const tag = tagById.get(kind.tag_id);
            return (
              <TableRow key={kind.kind}>
                <TableCell className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{kind.label}</span>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span>{tag?.label ?? "TAG indisponível"}</span>
                    {tag && !tag.active && <Badge variant="outline">Inativa</Badge>}
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Badge variant={kind.active ? "default" : "outline"}>
                    {kind.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(kind)}>Editar</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleting(kind)}
                    >
                      <Trash2 className="size-4" /> Eliminar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {kinds.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                Ainda não existem tipos de evento configurados.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <EventKindDialog
        key={editing === "new" ? "new" : (editing?.kind ?? "closed")}
        open={editing !== null}
        kind={editing === "new" ? null : editing}
        tags={tags}
        nextSortOrder={100 + kinds.length}
        onOpenChange={(dialogOpen) => {
          if (!dialogOpen) setEditing(null);
        }}
      />
      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tipo de evento?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleting?.label}» será removido permanentemente e deixará de estar disponível em novos eventos. Os eventos já registados mantêm o tipo e a TAG históricos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={async () => {
                if (!deleting) return;
                try {
                  await remove.mutateAsync(deleting.kind);
                  toast.success("Tipo de evento eliminado");
                  setDeleting(null);
                } catch (error) {
                  toast.error(errorMessagePt(error, "Não foi possível eliminar o tipo de evento"));
                }
              }}
            >
              Eliminar permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function EventKindDialog({
  open,
  kind,
  tags,
  nextSortOrder,
  onOpenChange,
}: {
  open: boolean;
  kind: EventKindTag | null;
  tags: EventTag[];
  nextSortOrder: number;
  onOpenChange: (open: boolean) => void;
}) {
  const saveKind = useSaveEventKind();
  const saveTag = useSaveEventTag();
  const selectedInitialTag = tags.find((tag) => tag.id === kind?.tag_id) ?? null;
  const [label, setLabel] = useState(kind?.label ?? "");
  const [tagId, setTagId] = useState(kind?.tag_id ?? "");
  const [active, setActive] = useState(kind?.active ?? true);
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState("");
  const [tagLabel, setTagLabel] = useState(selectedInitialTag?.label ?? "");
  const [tagActive, setTagActive] = useState(selectedInitialTag?.active ?? true);
  const selectedTag = tags.find((tag) => tag.id === tagId) ?? null;
  const busy = saveKind.isPending || saveTag.isPending;

  const selectTag = (id: string) => {
    setTagId(id);
    const tag = tags.find((item) => item.id === id);
    setTagLabel(tag?.label ?? "");
    setTagActive(tag?.active ?? true);
    setCreatingTag(false);
  };

  const submit = async () => {
    const cleanLabel = label.trim();
    if (!cleanLabel) {
      toast.error("Indique o nome do tipo de evento.");
      return;
    }
    try {
      let finalTagId = tagId;
      if (creatingTag) {
        if (!newTagLabel.trim()) {
          toast.error("Indique o nome da nova TAG.");
          return;
        }
        finalTagId = (await saveTag.mutateAsync({
          label: newTagLabel,
          sortOrder: (tags[tags.length - 1]?.sort_order ?? 0) + 1,
        })) ?? "";
      } else if (selectedTag) {
        if (!tagLabel.trim()) {
          toast.error("Indique o nome da TAG associada.");
          return;
        }
        if (tagLabel.trim() !== selectedTag.label || tagActive !== selectedTag.active) {
          await saveTag.mutateAsync({ id: selectedTag.id, label: tagLabel, active: tagActive });
        }
      }
      if (!finalTagId) {
        toast.error("Escolha a TAG associada ao tipo de evento.");
        return;
      }
      await saveKind.mutateAsync({
        ...(kind ? { kind: kind.kind } : {}),
        label: cleanLabel,
        tagId: finalTagId,
        active,
        ...(!kind ? { sortOrder: nextSortOrder } : {}),
      });
      toast.success(kind ? "Tipo de evento atualizado" : "Tipo de evento criado");
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessagePt(error, "Não foi possível guardar o tipo de evento"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind ? "Editar tipo de evento" : "Novo tipo de evento"}</DialogTitle>
          <DialogDescription>
            O tipo e a TAG ficam associados nos novos eventos sem alterar o histórico existente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="event-kind-name">Nome do tipo de evento</Label>
            <Input
              id="event-kind-name"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Ex.: Protocolo"
            />
          </div>

          <div className="space-y-1.5">
            <Label>TAG associada</Label>
            <Select value={tagId} onValueChange={selectTag} disabled={creatingTag}>
              <SelectTrigger><SelectValue placeholder="Selecionar TAG" /></SelectTrigger>
              <SelectContent>
                {tags.filter((tag) => tag.active || tag.id === tagId).map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    {tag.label}{tag.active ? "" : " (inativa)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCreatingTag((current) => !current)}>
              <Plus className="size-4" /> {creatingTag ? "Usar TAG existente" : "Criar nova TAG"}
            </Button>
          </div>

          {creatingTag ? (
            <div className="space-y-1.5 rounded-md border bg-surface-2 p-3">
              <Label htmlFor="new-associated-tag">Nome da nova TAG</Label>
              <Input
                id="new-associated-tag"
                value={newTagLabel}
                onChange={(event) => setNewTagLabel(event.target.value)}
                placeholder="Ex.: Protocolo"
              />
            </div>
          ) : selectedTag ? (
            <div className="space-y-3 rounded-md border bg-surface-2 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="associated-tag-name">Nome da TAG associada</Label>
                <Input
                  id="associated-tag-name"
                  value={tagLabel}
                  onChange={(event) => setTagLabel(event.target.value)}
                  disabled={selectedTag.is_core}
                />
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                <div className="min-w-0">
                  <Label htmlFor="associated-tag-active">TAG ativa</Label>
                  <p className="text-xs text-muted-foreground">Uma TAG inativa deixa de estar disponível em novos eventos.</p>
                </div>
                <Switch id="associated-tag-active" checked={tagActive} onCheckedChange={setTagActive} />
              </div>
            </div>
          ) : null}

          {kind && (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t pt-4">
              <div className="min-w-0">
                <Label htmlFor="event-kind-active">Tipo de evento ativo</Label>
                <p className="text-xs text-muted-foreground">Tipos inativos deixam de surgir na criação de eventos.</p>
              </div>
              <Switch
                id="event-kind-active"
                checked={active}
                onCheckedChange={setActive}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={() => void submit()} disabled={busy}>{kind ? "Guardar" : "Adicionar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
