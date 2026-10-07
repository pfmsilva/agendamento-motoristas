import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
import type { Administrator } from "@/lib/data";

type Props = {
  administrators: Administrator[];
  value: string;
  onChange: (id: string) => void;
  id?: string;
  placeholder?: string;
};

/** Seletor pesquisável de Administrador, para listas longas. */
export function AdministratorCombobox({
  administrators,
  value,
  onChange,
  id,
  placeholder = "Selecionar Administrador",
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = administrators.find((a) => a.id === value) ?? null;
  const options = administrators.filter((a) => a.active || a.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal hover:bg-background"
        >
          <span className={selected ? "" : "text-muted-foreground"}>
            {selected?.name ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Procurar Administrador…" />
          <CommandList>
            <CommandEmpty>Nenhum Administrador encontrado.</CommandEmpty>
            <CommandGroup>
              {options.map((a) => (
                <CommandItem
                  key={a.id}
                  value={a.name}
                  onSelect={() => {
                    onChange(a.id);
                    setOpen(false);
                  }}
                >
                  <Check className={`mr-2 size-4 ${a.id === value ? "opacity-100" : "opacity-0"}`} />
                  {a.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
