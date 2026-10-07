import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isLisbonArea, type City } from "@/lib/scheduling";

type Props = {
  cities: City[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  id?: string;
  /**
   * When provided, a destination that does not exist yet can be created from
   * the search field. Returns the id of the created (or reused) city.
   */
  onCreate?: (name: string) => Promise<string>;
};

/** City selector with a case-insensitive, partial-match search field. */
export function CityCombobox({
  cities,
  value,
  onChange,
  placeholder = "Selecionar cidade",
  id,
  onCreate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const selected = cities.find((c) => c.id === value) ?? null;
  // Historical records keep their selected city label, but inactive cities
  // never return to the list of choices for a new assignment.
  // Ordem única em toda a aplicação: zona de Lisboa (inclui "Casa") primeiro,
  // por ordem alfabética, e depois os restantes locais de A a Z.
  const options = cities
    .filter((c) => c.active)
    .slice()
    .sort((a, b) => {
      const za = isLisbonArea(a) ? 0 : 1;
      const zb = isLisbonArea(b) ? 0 : 1;
      if (za !== zb) return za - zb;
      return a.name.localeCompare(b.name, "pt");
    });

  const trimmed = query.trim();
  // A removed name is still reserved by its historical record and must not be
  // recreated or silently reactivated from a service form.
  const exists = cities.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase());
  const canCreate = Boolean(onCreate) && trimmed.length > 1 && !exists;

  const create = async () => {
    if (!onCreate || !trimmed) return;
    setCreating(true);
    try {
      const newId = await onCreate(trimmed);
      onChange(newId);
      setOpen(false);
      setQuery("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          // Neutral hover: the shared outline variant highlights with the gold
          // accent, which is reserved for intentional accents elsewhere.
          className="w-full justify-between font-normal hover:bg-surface-2 hover:text-foreground"
        >
          <span className={selected ? "truncate" : "truncate text-muted-foreground"}>
            {selected
              ? selected.name
              : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Pesquisar cidade..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {canCreate ? (
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void create()}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                >
                  <Plus className="size-4" />
                  {creating ? "A adicionar…" : `Adicionar «${trimmed}»`}
                </button>
              ) : (
                "Nenhuma cidade encontrada."
              )}
            </CommandEmpty>
            <CommandGroup>
              {options.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.name}
                  className="data-[selected=true]:bg-surface-2! data-[selected=true]:text-foreground!"
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check className={`size-4 ${c.id === value ? "opacity-100" : "opacity-0"}`} />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
            {canCreate && options.length > 0 && (
              <CommandGroup>
                <CommandItem
                  value={`__create__${trimmed}`}
                  className="data-[selected=true]:bg-surface-2! data-[selected=true]:text-foreground!"
                  onSelect={() => void create()}
                >
                  <Plus className="size-4" />
                  {creating ? "A adicionar…" : `Adicionar «${trimmed}»`}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
