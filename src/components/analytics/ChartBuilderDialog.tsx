import { useEffect, useMemo, useState } from "react";
import { AreaChart, BarChart3, BarChartHorizontal, Check, ChevronsUpDown, Gauge, Grid3x3, LayoutGrid, LineChart, PieChart, Plus, Percent, ScatterChart, Table2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChartLegend, ChartRenderer } from "./ChartRenderer";
import { useWidgetDataset } from "./use-widget-dataset";
import { DEFAULT_FILTERS, MONTH_NAMES_PT, PERIOD_OPTIONS, isoWeeksInYear, parseFilters, periodParts, periodSummary, rangeForParts, widgetPeriodLabel, type AnalyticsFilters, type AnalyticsPeriod } from "@/lib/analytics-builder";
import { insightInfo } from "@/lib/analytics-insights";
import { AGG_LABELS, DEFAULT_CONFIG, DIMENSIONS, MEASURES, ROLE_LABELS, VISUALIZATIONS, configToJson, dimension, measure, parseWidgetConfig, visualization, type AggKind, type Role, type ValueField, type WidgetConfig } from "@/lib/analytics-query";
import { useAdministrators, useAssistants, useCities, useDrivers, useEventTags, type AnalyticsWidget } from "@/lib/data";
import type { Activity } from "@/lib/scheduling";

export type WidgetDraft = Pick<AnalyticsWidget, "title" | "metric_key" | "visualization" | "dimension_key" | "follows_global_filters" | "grid_w" | "grid_h" | "config" | "filters">;

const VIZ_ICONS: Record<string, typeof BarChart3> = {
  gauge: Gauge, bar: BarChart3, hbar: BarChartHorizontal, stacked: BarChart3, stackedh: BarChartHorizontal,
  percent: Percent, line: LineChart, area: AreaChart, combo: BarChart3, pie: PieChart, donut: PieChart,
  heatmap: Grid3x3, table: Table2, matrix: LayoutGrid, scatter: ScatterChart,
};

/** Anos disponíveis para escolher o período próprio de cada análise. */
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 7 }, (_, index) => CURRENT_YEAR - 3 + index);

const KINDS = [
  { id: "service", name: "Serviço" }, { id: "garage", name: "Garagem" }, { id: "administration", name: "Administração" },
  { id: "time_off", name: "Férias" }, { id: "unavailability", name: "Indisponibilidade" },
];

function FieldPicker({ value, onChange, allowNone = true, placeholder = "Escolher campo" }: { value: string | null; onChange: (value: string | null) => void; allowNone?: boolean; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const current = dimension(value);
  const groups = ["Operação", "Tempo", "Local"] as const;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className={current ? "" : "text-muted-foreground"}>{current?.label ?? placeholder}</span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Procurar campo…" />
          <CommandList>
            <CommandEmpty>Sem campos.</CommandEmpty>
            {allowNone && (
              <CommandGroup>
                <CommandItem onSelect={() => { onChange(null); setOpen(false); }}>Sem campo</CommandItem>
              </CommandGroup>
            )}
            {groups.map((group) => (
              <CommandGroup key={group} heading={group}>
                {DIMENSIONS.filter((item) => item.group === group).map((item) => (
                  <CommandItem key={item.key} value={item.label} onSelect={() => { onChange(item.key); setOpen(false); }}>
                    {item.label}
                    {value === item.key && <Check className="ml-auto size-4" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function MeasurePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = measure(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="min-w-0 flex-1 justify-between font-normal">
          <span className="truncate">{current.label}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Procurar medida…" />
          <CommandList>
            <CommandEmpty>Sem medidas.</CommandEmpty>
            <CommandGroup heading="Medidas">
              {MEASURES.map((item) => (
                <CommandItem key={item.key} value={item.label} onSelect={() => { onChange(item.key); setOpen(false); }}>
                  <span>{item.label}</span>
                  {value === item.key && <Check className="ml-auto size-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ValueList({ fields, max, label, onChange }: { fields: ValueField[]; max: number; label: string; onChange: (fields: ValueField[]) => void }) {
  const update = (index: number, next: ValueField) => onChange(fields.map((item, position) => (position === index ? next : item)));
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {fields.map((field, index) => {
        const def = measure(field.measure);
        return (
          <div key={`${field.measure}-${index}`} className="flex items-center gap-2">
            <MeasurePicker value={field.measure} onChange={(next) => update(index, { measure: next, agg: measure(next).defaultAgg })} />
            <Select value={field.agg} onValueChange={(agg) => update(index, { ...field, agg: agg as AggKind })}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{def.aggregations.map((agg) => <SelectItem key={agg} value={agg}>{AGG_LABELS[agg]}</SelectItem>)}</SelectContent>
            </Select>
            {fields.length > 1 && (
              <Button variant="ghost" size="icon" aria-label="Remover medida" onClick={() => onChange(fields.filter((_, position) => position !== index))}><Trash2 /></Button>
            )}
          </div>
        );
      })}
      {fields.length < max && (
        <Button variant="outline" size="sm" onClick={() => onChange([...fields, { measure: "occupied_hours", agg: "sum" }])}><Plus />Adicionar medida</Button>
      )}
    </div>
  );
}

function MultiFilter({ label, options, value, onChange }: { label: string; options: { id: string; name: string }[]; value: string[]; onChange: (value: string[]) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">{label}{value.length ? ` · ${value.length}` : ""}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 w-64 overflow-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem key={option.id} checked={value.includes(option.id)} onCheckedChange={(checked) => onChange(checked ? [...value, option.id] : value.filter((id) => id !== option.id))}>
            {option.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widget?: AnalyticsWidget | null;
  globalFilters: AnalyticsFilters;
  activities: Activity[];
  onSave: (draft: WidgetDraft) => void;
};

export function ChartBuilderDialog({ open, onOpenChange, widget, globalFilters, activities, onSave }: Props) {
  const [title, setTitle] = useState("");
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [followsGlobal, setFollowsGlobal] = useState(true);
  const [ownFilters, setOwnFilters] = useState<AnalyticsFilters>(globalFilters);
  /** O tamanho deixou de ser configurável: mantém-se o da análise ou o valor por omissão. */
  const width = widget?.grid_w ?? 6;
  const height = widget?.grid_h ?? 3;


  const { data: drivers = [] } = useDrivers();
  const { data: administrators = [] } = useAdministrators();
  const { data: assistants = [] } = useAssistants();
  const { data: tags = [] } = useEventTags();
  const { data: cities = [] } = useCities();

  useEffect(() => {
    if (!open) return;
    setTitle(widget?.title ?? "");
    setConfig(widget ? parseWidgetConfig(widget) : DEFAULT_CONFIG());
    setFollowsGlobal(widget?.follows_global_filters ?? true);
    setOwnFilters(widget && !widget.follows_global_filters ? parseFilters(widget.filters) : { ...globalFilters });
  }, [open, widget, globalFilters]);

  const viz = visualization(config.viz);
  const effectiveFilters = followsGlobal ? globalFilters : ownFilters;
  const { dataset, period } = useWidgetDataset({ config, filters: effectiveFilters, activities });
  const suggestedTitle = useMemo(() => {
    const measureLabel = measure(config.values[0]?.measure).label;
    const axis = dimension(viz.roles.includes("rows") ? config.rows : config.axis);
    return axis ? `${measureLabel} por ${axis.label.toLowerCase()}` : measureLabel;
  }, [config, viz]);

  const patch = (next: Partial<WidgetConfig>) => setConfig((current) => ({ ...current, ...next }));
  const updateOwn = (next: Partial<AnalyticsFilters>) => setOwnFilters((current) => ({ ...current, ...next }));

  /** Escolha explícita do período próprio: ano + semana/mês/trimestre/semestre. */
  const parts = periodParts(ownFilters);
  const setPeriodParts = (year: number, index: number) => updateOwn(rangeForParts(ownFilters.period, year, index));
  const setPeriodType = (period: AnalyticsPeriod) => {
    if (period === "custom") {
      updateOwn({ period });
      return;
    }
    const current = periodParts(ownFilters);
    const index = period === "year" ? 1
      : period === "week" ? Math.min(current.index, isoWeeksInYear(current.year))
      : period === "month" ? Math.min(current.index, 12)
      : period === "quarter" ? Math.min(current.index, 4)
      : Math.min(current.index, 2);
    updateOwn({ period, ...rangeForParts(period, current.year, index) });
  };
  const indexOptions = useMemo(() => {
    if (ownFilters.period === "week") return Array.from({ length: isoWeeksInYear(parts.year) }, (_, i) => ({ value: i + 1, label: `Semana ${i + 1}` }));
    if (ownFilters.period === "month") return MONTH_NAMES_PT.map((name, i) => ({ value: i + 1, label: name }));
    if (ownFilters.period === "quarter") return [1, 2, 3, 4].map((value) => ({ value, label: `T${value}` }));
    if (ownFilters.period === "semester") return [1, 2].map((value) => ({ value, label: `${value}.º semestre` }));
    return [];
  }, [ownFilters.period, parts.year]);

  const submit = () => {
    const cleanTitle = (title.trim() || suggestedTitle).trim();
    onSave({
      title: cleanTitle,
      // As análises pré-definidas (ocupação, disponibilidade, etc.) mantêm a sua chave.
      metric_key: widget && insightInfo(widget.metric_key) ? widget.metric_key : config.values[0]?.measure ?? "service_count",
      visualization: config.viz,
      dimension_key: (viz.roles.includes("rows") ? config.rows : config.axis) ?? null,
      follows_global_filters: followsGlobal,
      grid_w: width,
      grid_h: height,
      config: configToJson(config),
      // Guardar o intervalo concreto juntamente com o tipo é o que permite restaurar
      // exatamente a escolha e recalcular o widget com os seus próprios dados.
      filters: followsGlobal ? {} : JSON.parse(JSON.stringify(ownFilters)),
    });
    onOpenChange(false);
  };

  const roleField = (role: Role) => {
    if (role === "values" || role === "tooltips") return null;
    const value = role === "axis" ? config.axis : role === "legend" ? config.legend : role === "rows" ? config.rows : config.columns;
    const label = role === "axis" ? viz.axisLabel ?? ROLE_LABELS.axis : role === "legend" ? viz.legendLabel ?? ROLE_LABELS.legend : ROLE_LABELS[role];
    return (
      <div key={role} className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
        <FieldPicker
          value={value}
          allowNone={role === "legend"}
          onChange={(next) => patch(role === "axis" ? { axis: next } : role === "legend" ? { legend: next } : role === "rows" ? { rows: next } : { columns: next })}
        />
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-[min(72rem,calc(100vw-1.5rem))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 lg:h-[min(92dvh,56rem)]">
        <DialogHeader className="border-b p-5 pb-4">
          <DialogTitle>{widget ? "Editar análise" : "Nova análise"}</DialogTitle>
          <DialogDescription>Escolha o tipo de gráfico e atribua campos aos papéis visuais. A pré-visualização atualiza em tempo real.</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:overflow-hidden">
          <div className="min-h-0 shrink-0 space-y-6 border-b p-5 pb-8 lg:shrink lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <section className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tipo de visualização</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
                {VISUALIZATIONS.map((item) => {
                  const Icon = VIZ_ICONS[item.icon] ?? BarChart3;
                  const active = item.key === config.viz;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => patch({ viz: item.key, values: config.values.slice(0, item.maxValues) })}
                      className={`flex flex-col items-center gap-1 rounded-md border p-2 text-center text-[11px] leading-tight transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
                    >
                      <Icon className="size-4" />
                      <span className="line-clamp-2">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <p className="text-sm font-semibold">Campos</p>
              {viz.roles.map((role) => roleField(role))}
              {viz.roles.includes("values") && (
                <ValueList fields={config.values} max={viz.maxValues} label={viz.valuesLabel ?? ROLE_LABELS.values} onChange={(values) => patch({ values })} />
              )}
              {viz.roles.includes("tooltips") && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">{ROLE_LABELS.tooltips}</Label>
                  {config.tooltips.map((field, index) => (
                    <div key={`${field.measure}-${index}`} className="flex items-center gap-2">
                      <MeasurePicker value={field.measure} onChange={(next) => patch({ tooltips: config.tooltips.map((item, position) => (position === index ? { measure: next, agg: measure(next).defaultAgg } : item)) })} />
                      <Select value={field.agg} onValueChange={(agg) => patch({ tooltips: config.tooltips.map((item, position) => (position === index ? { ...item, agg: agg as AggKind } : item)) })}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>{measure(field.measure).aggregations.map((agg) => <SelectItem key={agg} value={agg}>{AGG_LABELS[agg]}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" aria-label="Remover detalhe" onClick={() => patch({ tooltips: config.tooltips.filter((_, position) => position !== index) })}><Trash2 /></Button>
                    </div>
                  ))}
                  {config.tooltips.length < 4 && (
                    <Button variant="outline" size="sm" onClick={() => patch({ tooltips: [...config.tooltips, { measure: "occupied_hours", agg: "sum" }] })}><Plus />Adicionar ao detalhe</Button>
                  )}
                </div>
              )}
            </section>

            {config.viz === "kpi" && (
              <section className="space-y-3">
                <p className="text-sm font-semibold">Comparações</p>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label htmlFor="compare-previous" className="text-sm font-normal">Comparar com o período anterior</Label>
                  <Switch id="compare-previous" checked={config.comparePrevious} onCheckedChange={(comparePrevious) => patch({ comparePrevious })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Objetivo (opcional)</Label>
                  <Input type="number" value={config.target ?? ""} onChange={(event) => patch({ target: event.target.value === "" ? null : Number(event.target.value) })} placeholder="Ex.: 80" />
                </div>
              </section>
            )}

            {config.viz !== "kpi" && (
              <section className="space-y-2">
                <p className="text-sm font-semibold">Ordenação</p>
                <div className="flex gap-2">
                  <Select value={config.sort.by} onValueChange={(by) => patch({ sort: { ...config.sort, by: by as "category" | "measure" } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="measure">Pela medida</SelectItem><SelectItem value="category">Pelo nome da categoria</SelectItem></SelectContent>
                  </Select>
                  <Select value={config.sort.direction} onValueChange={(direction) => patch({ sort: { ...config.sort, direction: direction as "asc" | "desc" } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="desc">Descendente</SelectItem><SelectItem value="asc">Ascendente</SelectItem></SelectContent>
                  </Select>
                </div>
              </section>
            )}

            <section className="space-y-3">
              <p className="text-sm font-semibold">Período</p>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="follow-global" className="text-sm font-normal">Seguir filtros globais</Label>
                  <p className="text-xs text-muted-foreground">Desligue para definir o período e os filtros próprios desta análise.</p>
                </div>
                <Switch
                  id="follow-global"
                  checked={followsGlobal}
                  onCheckedChange={(checked) => {
                    setFollowsGlobal(checked);
                    if (!checked && widget?.follows_global_filters) setOwnFilters({ ...globalFilters });
                  }}
                />
              </div>
              {followsGlobal ? (
                <p className="text-xs text-muted-foreground">Período atual do painel: {periodSummary(globalFilters)}.</p>
              ) : (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tipo de período</Label>
                    <Select value={ownFilters.period} onValueChange={(value) => setPeriodType(value as AnalyticsPeriod)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PERIOD_OPTIONS.map((option) => <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    {ownFilters.period === "custom" ? (
                      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="min-w-0 space-y-1.5">
                          <Label htmlFor="widget-period-from">Início</Label>
                          <Input id="widget-period-from" className="min-w-0 w-full" type="date" value={ownFilters.from} onChange={(event) => updateOwn({ period: "custom", from: event.target.value })} />
                        </div>
                        <div className="min-w-0 space-y-1.5">
                          <Label htmlFor="widget-period-to">Fim</Label>
                          <Input id="widget-period-to" className="min-w-0 w-full" type="date" value={ownFilters.to} onChange={(event) => updateOwn({ period: "custom", to: event.target.value })} />
                        </div>
                      </div>
                    ) : (
                      <div className={`grid min-w-0 grid-cols-1 gap-3 ${ownFilters.period === "year" ? "" : "sm:grid-cols-2"}`}>
                        <div className="min-w-0 space-y-1.5">
                          <Label>Ano</Label>
                          <Select value={String(parts.year)} onValueChange={(value) => setPeriodParts(Number(value), parts.index)}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>{YEAR_OPTIONS.map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        {ownFilters.period !== "year" && (
                          <div className="min-w-0 space-y-1.5">
                            <Label>{ownFilters.period === "week" ? "Semana" : ownFilters.period === "month" ? "Mês" : ownFilters.period === "quarter" ? "Trimestre" : "Semestre"}</Label>
                            <Select value={String(parts.index)} onValueChange={(value) => setPeriodParts(parts.year, Number(value))}>
                              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                              <SelectContent>{indexOptions.map((option) => <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">{widgetPeriodLabel(ownFilters)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <MultiFilter label="Motorista" options={drivers.map((item) => ({ id: item.id, name: item.name }))} value={ownFilters.driverIds} onChange={(driverIds) => updateOwn({ driverIds })} />
                    <MultiFilter label="Administrador" options={administrators.map((item) => ({ id: item.id, name: item.name }))} value={ownFilters.administratorIds} onChange={(administratorIds) => updateOwn({ administratorIds })} />
                    <MultiFilter label="Assistente" options={assistants.map((item) => ({ id: item.id, name: item.name }))} value={ownFilters.assistantIds} onChange={(assistantIds) => updateOwn({ assistantIds })} />
                    <MultiFilter label="TAG" options={tags.filter((item) => item.active).map((item) => ({ id: item.id, name: item.label }))} value={ownFilters.tagIds} onChange={(tagIds) => updateOwn({ tagIds })} />
                    <MultiFilter label="Tipo de evento" options={KINDS} value={ownFilters.kinds ?? []} onChange={(kinds) => updateOwn({ kinds })} />
                    <MultiFilter label="Local" options={cities.map((item) => ({ id: item.id, name: item.name }))} value={ownFilters.cityIds ?? []} onChange={(cityIds) => updateOwn({ cityIds })} />
                    <Button variant="ghost" size="sm" onClick={() => setOwnFilters(DEFAULT_FILTERS())}>Repor</Button>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <p className="text-sm font-semibold">Aspeto</p>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Título</Label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={suggestedTitle} />
              </div>
            </section>
          </div>

          <div className="min-h-0 shrink-0 bg-muted/30 p-5 lg:shrink lg:overflow-y-auto">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pré-visualização</p>
            <div className="mt-2 rounded-lg border bg-card p-4">
              <p className="mb-3 truncate text-sm font-semibold">{title.trim() || suggestedTitle}</p>
              <ChartRenderer dataset={dataset} period={period} height={Math.max(220, height * 70)} />
              <ChartLegend dataset={dataset} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{widgetPeriodLabel(effectiveFilters)}</p>
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 z-10 flex-row flex-wrap justify-end gap-2 border-t bg-background p-4">
          <Button variant="outline" className="shrink-0 whitespace-nowrap" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="shrink-0 whitespace-nowrap" onClick={submit}>Guardar análise</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
