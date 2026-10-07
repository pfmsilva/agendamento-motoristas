import { addDays, addMonths, format, startOfDay } from "date-fns";
import { pt } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePickerButton } from "@/components/DatePickerButton";
import type { CalendarView } from "@/components/WeekCalendar";

/**
 * Shared date navigation for every calendar view: previous / next / today,
 * a date picker and the day / week / month switch. Extra controls (filters,
 * driver pickers) are rendered before the arrows through `children`.
 */
export function CalendarNav({
  view,
  onViewChange,
  anchor,
  onAnchorChange,
  children,
}: {
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  anchor: Date;
  onAnchorChange: (d: Date) => void;
  children?: React.ReactNode;
}) {
  const step = (dir: number) =>
    onAnchorChange(
      view === "month"
        ? addMonths(anchor, dir)
        : addDays(anchor, view === "week" || view === "workweek" ? 7 * dir : dir),
    );

  const label =
    view === "month"
      ? format(anchor, "MMMM yyyy", { locale: pt })
      : format(anchor, "d 'de' MMMM 'de' yyyy", { locale: pt });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Anterior">
        <ChevronLeft className="size-4" />
      </Button>
      <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="Seguinte">
        <ChevronRight className="size-4" />
      </Button>
      <DatePickerButton value={anchor} onChange={onAnchorChange} label={label} />

      {/* Ecrãs pequenos: seletor compacto; a partir de lg volta ao separador completo. */}
      <Select value={view} onValueChange={(v) => onViewChange(v as CalendarView)}>
        <SelectTrigger className="ml-auto w-40 lg:hidden" aria-label="Vista do calendário">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="day">Dia</SelectItem>
          <SelectItem value="workweek">Semana de trabalho</SelectItem>
          <SelectItem value="week">Semana completa</SelectItem>
          <SelectItem value="month">Mês</SelectItem>
        </SelectContent>
      </Select>

      <Tabs
        value={view}
        onValueChange={(v) => onViewChange(v as CalendarView)}
        className="ml-auto hidden lg:block"
      >
        <TabsList>
          <TabsTrigger value="day">Dia</TabsTrigger>
          <TabsTrigger value="workweek">Semana de trabalho</TabsTrigger>
          <TabsTrigger value="week">Semana completa</TabsTrigger>
          <TabsTrigger value="month">Mês</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
