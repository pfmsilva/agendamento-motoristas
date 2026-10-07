export type TooltipRow = { label: string; value: string; color?: string };

/** Cartão de tooltip comum às análises pré-definidas (alto contraste, PT-PT). */
export function InsightTooltip({ title, subtitle, rows }: { title: string; subtitle?: string; rows: TooltipRow[] }) {
  return (
    <div className="min-w-44 rounded-md border border-primary/20 bg-primary px-3 py-2 text-xs text-primary-foreground shadow-lg">
      <p className="font-semibold">{title}</p>
      {subtitle && <p className="mt-0.5 text-[11px] text-primary-foreground/80">{subtitle}</p>}
      <ul className="mt-1 space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 opacity-90">
              {row.color && <span className="size-2 rounded-[2px]" style={{ background: row.color }} />}
              {row.label}
            </span>
            <span className="font-medium tabular-nums">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmptyInsight({ message = "Sem dados no período selecionado." }: { message?: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{message}</p>;
}
