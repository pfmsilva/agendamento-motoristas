import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, LineChart, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip as ChartTooltip, XAxis, YAxis, ZAxis } from "recharts";
import { labelCount, labelHours, labelPercent, outsideLabel, pointLabel, segmentLabel, stackTotalLabel } from "./chart-labels";
import { datasetCell, formatValue, paletteColor, visualization, type Dataset } from "@/lib/analytics-query";

/** Formatação concisa dos rótulos desenhados sobre os gráficos. */
const labelFormat = (unit: string) => (unit === "percent" ? labelPercent : unit === "hours" ? labelHours : labelCount);

const LEVEL_MIXES = [12, 23, 34, 45, 56, 67, 79, 94] as const;

function levelColour(value: number, ranked: number[]) {
  if (value <= 0 || !ranked.length) return "var(--muted)";
  if (ranked.length === 1) return `color-mix(in srgb, var(--primary) 94%, var(--muted))`;
  const rank = ranked.findIndex((item) => item >= value);
  const percentile = Math.max(0, rank) / (ranked.length - 1);
  const level = Math.min(8, 1 + Math.floor(percentile * 8));
  return `color-mix(in srgb, var(--primary) ${LEVEL_MIXES[level - 1]}%, var(--muted))`;
}

type TooltipRow = { label: string; value: string; color?: string | undefined };

function TooltipCard({ title, subtitle, rows }: { title: string; subtitle?: string; rows: TooltipRow[] }) {
  return (
    <div className="min-w-52 rounded-md border border-primary-foreground/15 bg-primary p-3 text-primary-foreground shadow-lg">
      <p className="text-sm font-semibold leading-tight">{title}</p>
      {subtitle && <p className="mt-0.5 text-xs leading-tight text-primary-foreground/80">{subtitle}</p>}
      <div className="mt-2 space-y-1 border-t border-primary-foreground/25 pt-2 text-xs leading-relaxed">
        {rows.map((row) => (
          <div key={`${row.label}-${row.value}`} className="flex justify-between gap-4">
            <span className="flex items-center gap-1.5 text-primary-foreground/80">
              {row.color && <span className="size-2 rounded-[2px]" style={{ backgroundColor: row.color }} aria-hidden />}
              {row.label}
            </span>
            <span className="font-medium">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartRenderer({ dataset, period, height = 240 }: { dataset: Dataset; period: string; height?: number }) {
  const { config } = dataset;
  const viz = visualization(config.viz);

  const data = useMemo(() => dataset.categories.map((category) => {
    const row: Record<string, string | number> = { id: category.id, name: category.label };
    let total = 0;
    for (const series of dataset.series) total += datasetCell(dataset, category.id, series.key)?.value ?? 0;
    for (const series of dataset.series) {
      const raw = datasetCell(dataset, category.id, series.key)?.value ?? 0;
      row[series.key] = viz.percentStack && total ? (raw / total) * 100 : raw;
      row[`${series.key}__raw`] = raw;
    }
    row["__total"] = total;
    return row;
  }), [dataset, viz.percentStack]);

  const unit = dataset.series[0]?.unit ?? "number";
  const displayUnit = viz.percentStack ? "percent" : unit;
  const showServiceCounts = config.values[0]?.measure === "occupied_hours" && config.axis === "driver";

  if (viz.key === "kpi") {
    const delta = dataset.kpi.previous !== null && dataset.kpi.previous !== 0 ? ((dataset.kpi.value - dataset.kpi.previous) / dataset.kpi.previous) * 100 : null;
    return (
      <div className="flex min-h-28 flex-col justify-end gap-1">
        <span className="text-4xl font-semibold text-primary">{formatValue(dataset.kpi.value, dataset.kpi.unit)}</span>
        {dataset.kpi.previous !== null && (
          <p className="text-xs text-muted-foreground">
            Período anterior: {formatValue(dataset.kpi.previous, dataset.kpi.unit)}
            {delta !== null && <span className={delta >= 0 ? "ml-2 text-available" : "ml-2 text-destructive"}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)}%</span>}
          </p>
        )}
        {dataset.kpi.target !== null && <p className="text-xs text-muted-foreground">Objetivo: {formatValue(dataset.kpi.target, dataset.kpi.unit)}</p>}
      </div>
    );
  }

  if (dataset.empty) return <p className="py-10 text-center text-sm text-muted-foreground">Sem dados para os filtros selecionados.</p>;

  if (viz.key === "heatmap" || viz.key === "matrix") {
    const ranked = [...new Set(dataset.categories.flatMap((category) => dataset.series.map((series) => datasetCell(dataset, category.id, series.key)?.value ?? 0)).filter((value) => value > 0))].sort((a, b) => a - b);
    const heat = viz.key === "heatmap";
    return (
      <div className="overflow-x-auto pb-1">
        <table className="w-full min-w-[680px] border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="w-40" />
              {dataset.series.map((series) => <th key={series.key} className="px-1 pb-1 text-center text-[10px] font-medium text-muted-foreground">{series.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {dataset.categories.map((category) => (
              <tr key={category.id}>
                <td className="truncate pr-2 text-xs font-medium">{category.label}</td>
                {dataset.series.map((series) => {
                  const cell = datasetCell(dataset, category.id, series.key);
                  const value = cell?.value ?? 0;
                  return heat ? (
                    <td key={series.key} className="p-0">
                      <div
                        title={`${category.label} · ${series.label}: ${formatValue(value, unit)}`}
                        className="h-8 rounded-[3px] border border-primary/10"
                        style={{ backgroundColor: levelColour(value, ranked) }}
                      />
                    </td>
                  ) : (
                    <td key={series.key} className="rounded-[3px] bg-muted/50 px-2 py-1.5 text-right tabular-nums">{formatValue(value, unit)}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {heat && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Menor frequência</span>
            <span className="inline-block size-3 rounded-[2px] border border-primary/10" style={{ backgroundColor: "var(--muted)" }} />
            {LEVEL_MIXES.map((mix) => <span key={mix} className="inline-block size-3 rounded-[2px] border border-primary/10" style={{ backgroundColor: `color-mix(in srgb, var(--primary) ${mix}%, var(--muted))` }} />)}
            <span>Maior frequência</span>
          </div>
        )}
      </div>
    );
  }

  if (viz.key === "table") {
    return (
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2">Categoria</th>
              {dataset.series.map((series) => (
                <th key={series.key} className="pb-2 text-right">
                  <span className="inline-flex items-center justify-end gap-1.5">
                    <span className="size-2 rounded-[2px]" style={{ backgroundColor: series.color }} aria-hidden />
                    {series.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataset.categories.map((category) => (
              <tr key={category.id} className="border-b last:border-0">
                <td className="py-2 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {category.color && <span className="size-2 rounded-[2px]" style={{ backgroundColor: category.color }} aria-hidden />}
                    {category.label}
                  </span>
                </td>
                {dataset.series.map((series) => <td key={series.key} className="py-2 text-right tabular-nums">{formatValue(datasetCell(dataset, category.id, series.key)?.value ?? 0, series.unit)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const tooltip = (
    <ChartTooltip
      cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
      content={({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        const point = payload[0]?.payload as Record<string, number | string> | undefined;
        if (!point) return null;
        const categoryId = String(point["id"]);
        const rows: TooltipRow[] = payload.map((item) => {
          const key = String(item.dataKey);
          const series = dataset.series.find((entry) => entry.key === key);
          const raw = Number(point[`${key}__raw`] ?? item.value ?? 0);
          const serviceCount = datasetCell(dataset, categoryId, key)?.serviceCount ?? 0;
          const countLabel = `${serviceCount} ${serviceCount === 1 ? "serviço" : "serviços"}`;
          return {
            label: series?.label ?? key,
            value: `${formatValue(raw, series?.unit ?? unit)}${viz.percentStack ? ` · ${Number(item.value ?? 0).toFixed(0)}%` : ""}${showServiceCounts ? ` · ${countLabel}` : ""}`,
            color: series?.color ?? dataset.categories.find((category) => category.id === categoryId)?.color,
          };
        });
        const first = payload[0] ? datasetCell(dataset, categoryId, String(payload[0].dataKey)) : undefined;
        for (const extra of first?.extras ?? []) rows.push(extra);
        if (dataset.series.length > 1) {
          const totalServices = dataset.series.reduce((sum, series) => sum + (datasetCell(dataset, categoryId, series.key)?.serviceCount ?? 0), 0);
          rows.push({
            label: "Total",
            value: `${formatValue(Number(point["__total"] ?? 0), unit)}${showServiceCounts ? ` · ${totalServices} ${totalServices === 1 ? "serviço" : "serviços"}` : ""}`,
          });
        }
        return <TooltipCard title={String(label)} subtitle={period} rows={rows} />;
      }}
    />
  );

  if (viz.key === "pie" || viz.key === "donut") {
    const key = dataset.series[0]?.key ?? "value_0";
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey={key} nameKey="name" innerRadius={viz.key === "donut" ? 55 : 0} outerRadius={88}>
            {data.map((row, index) => <Cell key={String(row["id"])} fill={dataset.categories[index]?.color ?? paletteColor(index)} />)}
          </Pie>
          <ChartTooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0]?.payload as Record<string, number | string> | undefined;
            if (!point) return null;
            const category = dataset.categories.find((item) => item.id === String(point["id"]));
            return (
              <TooltipCard
                title={String(point["name"])}
                subtitle={period}
                rows={[{ label: dataset.series[0]?.label ?? "Valor", value: formatValue(Number(point[key] ?? 0), unit), color: category?.color ?? dataset.series[0]?.color }]}
              />
            );
          }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (viz.key === "scatter") {
    const [x, y] = dataset.series;
    if (!x || !y) return <p className="py-10 text-center text-sm text-muted-foreground">Escolha duas medidas (X e Y) para a dispersão.</p>;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" dataKey={x.key} name={x.label} tick={{ fontSize: 11 }} />
          <YAxis type="number" dataKey={y.key} name={y.label} tick={{ fontSize: 11 }} width={48} />
          <ZAxis range={[70, 70]} />
          <ChartTooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0]?.payload as Record<string, string | number>;
            return <TooltipCard title={String(point["name"])} subtitle={period} rows={[{ label: x.label, value: formatValue(Number(point[x.key]), x.unit) }, { label: y.label, value: formatValue(Number(point[y.key]), y.unit) }]} />;
          }} />
          <Scatter data={data} fill="var(--primary)">
            {data.map((row, index) => <Cell key={String(row["id"])} fill={dataset.categories[index]?.color ?? "var(--primary)"} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  const horizontal = !!viz.horizontal;
  const xAxis = horizontal
    ? <XAxis type="number" allowDecimals={displayUnit !== "number"} tick={{ fontSize: 11 }} domain={viz.percentStack ? [0, 100] : [0, "auto"]} tickFormatter={(value: number) => formatValue(value, displayUnit)} />
    : <XAxis dataKey="name" type="category" tick={{ fontSize: 11 }} interval={0} angle={dataset.categories.length > 6 ? -25 : 0} textAnchor={dataset.categories.length > 6 ? "end" : "middle"} height={dataset.categories.length > 6 ? 60 : 30} />;
  const yAxis = horizontal
    ? <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} interval={0} />
    : <YAxis type="number" allowDecimals={displayUnit !== "number"} width={56} tick={{ fontSize: 11 }} domain={viz.percentStack ? [0, 100] : [0, "auto"]} tickFormatter={(value: number) => formatValue(value, displayUnit)} />;
  const grid = <CartesianGrid strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} />;
  const chartHeight = horizontal ? Math.max(height, dataset.categories.length * 34 + 50) : height;

  const format = labelFormat(displayUnit);
  const showPointLabels = data.length <= 8 && dataset.series.length <= 2;

  if (viz.key === "line" || viz.key === "area") {
    const Chart = viz.key === "line" ? LineChart : AreaChart;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <Chart data={data} margin={{ top: 18, right: showPointLabels ? 30 : 16, bottom: 4, left: showPointLabels ? 12 : 0 }}>
          {grid}{xAxis}{yAxis}{tooltip}
          {dataset.series.map((series) => viz.key === "line"
            ? (
              <Line key={series.key} dataKey={series.key} name={series.label} stroke={series.color} strokeWidth={2} dot={showPointLabels}>
                {showPointLabels && <LabelList dataKey={series.key} content={pointLabel(format)} />}
              </Line>
            )
            : (
              <Area key={series.key} dataKey={series.key} name={series.label} stroke={series.color} fill={series.color} fillOpacity={0.18}>
                {showPointLabels && <LabelList dataKey={series.key} content={pointLabel(format)} />}
              </Area>
            ))}
        </Chart>
      </ResponsiveContainer>
    );
  }

  if (viz.key === "combo") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 20, right: 16, bottom: 4, left: 0 }}>
          {grid}{xAxis}{yAxis}{tooltip}
          {dataset.series.map((series, index) => index === 0
            ? (
              <Bar key={series.key} dataKey={series.key} name={series.label} fill={series.color} radius={[3, 3, 0, 0]}>
                {dataset.categories.map((category) => <Cell key={category.id} fill={category.color ?? series.color} />)}
                <LabelList dataKey={series.key} content={outsideLabel(format)} />
              </Bar>
            )
            : <Line key={series.key} dataKey={series.key} name={series.label} stroke={series.color} strokeWidth={2} dot={false} />)}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  const lastSeries = dataset.series[dataset.series.length - 1];
  const showTotal = !!viz.stacked && !viz.percentStack && dataset.series.length > 1;

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 20, right: horizontal ? 56 : 24, bottom: 4, left: 0 }}>
        {grid}{xAxis}{yAxis}{tooltip}
        {dataset.series.map((series) => (
          <Bar key={series.key} dataKey={series.key} name={series.label} fill={series.color} {...(viz.stacked ? { stackId: "stack" } : {})} radius={viz.stacked ? 0 : horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}>
            {!viz.stacked && dataset.categories.map((category) => <Cell key={category.id} fill={category.color ?? series.color} />)}
            <LabelList
              dataKey={series.key}
              content={viz.stacked ? segmentLabel(format, series.color) : outsideLabel(format, horizontal)}
            />
            {showTotal && series.key === lastSeries?.key && (
              <LabelList dataKey="__total" content={stackTotalLabel(labelFormat(unit), horizontal)} />
            )}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChartLegend({ dataset }: { dataset: Dataset }) {
  if (dataset.series.length < 2 || ["heatmap", "table", "matrix", "kpi", "pie", "donut", "scatter"].includes(dataset.config.viz)) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {dataset.series.map((series) => (
        <li key={series.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: series.color }} aria-hidden />
          <span>{series.label}</span>
        </li>
      ))}
    </ul>
  );
}
