import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { format, startOfDay } from "date-fns";
import { pt } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Calendar header title that doubles as a date picker, so a specific day can
 * be reached directly instead of stepping with the arrows.
 */
export function DatePickerButton({
  value,
  onChange,
  label,
  className,
}: {
  value: Date;
  onChange: (date: Date) => void;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn("h-9 gap-2 px-2 text-base font-semibold", className)}
          aria-label="Escolher data"
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={pt}
          weekStartsOn={1}
          selected={value}
          defaultMonth={value}
          onSelect={(d) => {
            if (!d) return;
            onChange(startOfDay(d));
            setOpen(false);
          }}
          formatters={{ formatCaption: (m) => format(m, "MMMM yyyy", { locale: pt }) }}
          className="pointer-events-auto p-3"
        />
      </PopoverContent>
    </Popover>
  );
}
