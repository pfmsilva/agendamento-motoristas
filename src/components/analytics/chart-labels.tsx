/**
 * Rótulos de valor desenhados diretamente nos gráficos das Análises.
 * Objetivo: ler o número principal sem passar o rato; o detalhe fica no tooltip.
 */

/* Formatação PT-PT --------------------------------------------------- */

/** Contagens sempre em número inteiro. */
export const labelCount = (value: number) => Math.round(value).toLocaleString("pt-PT");

/** Durações concisas: "45m", "12h", "1h 30m". */
export function labelDuration(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

export const labelHours = (hours: number) => labelDuration(hours * 60);

/** Percentagens sem casas decimais, exceto valores pequenos onde a decimal importa. */
export function labelPercent(value: number) {
  if (value > 0 && value < 10) return `${value.toFixed(1).replace(".", ",")}%`;
  return `${Math.round(value)}%`;
}

/* Contraste ----------------------------------------------------------- */

const contrastCache = new Map<string, boolean>();

/** Verdadeiro quando a cor de fundo é escura e o texto por cima deve ser claro. */
export function isDarkColor(color: string) {
  const cached = contrastCache.get(color);
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") return true;
  let value = color.trim();
  const variable = value.match(/var\((--[^),]+)\)/);
  if (variable) value = getComputedStyle(document.documentElement).getPropertyValue(variable[1]!).trim();
  let r = 0;
  let g = 0;
  let b = 0;
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  const rgb = value.match(/rgba?\(([^)]+)\)/);
  if (hex) {
    const raw = hex[1]!.length === 3 ? hex[1]!.split("").map((c) => c + c).join("") : hex[1]!;
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
  } else if (rgb) {
    const parts = rgb[1]!.split(/[ ,/]+/).map(Number);
    [r, g, b] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  } else {
    return true;
  }
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const dark = luminance < 0.62;
  contrastCache.set(color, dark);
  return dark;
}

/* Conteúdos de rótulo ------------------------------------------------- */

type LabelProps = {
  x?: number | string | undefined;
  y?: number | string | undefined;
  width?: number | string | undefined;
  height?: number | string | undefined;
  value?: number | string | undefined;
  payload?: Record<string, unknown> | undefined;
};

const num = (value: number | string | undefined) => (typeof value === "number" ? value : Number(value ?? 0));

type Format = (value: number) => string;

/** Rótulo fora da barra (acima nas verticais, à direita nas horizontais). */
export function outsideLabel(format: Format, horizontal = false) {
  return function OutsideLabel(props: LabelProps) {
    const value = num(props.value);
    if (!value) return null;
    const x = num(props.x);
    const y = num(props.y);
    const width = num(props.width);
    const height = num(props.height);
    if (horizontal) {
      return (
        <text x={x + width + 6} y={y + height / 2} dominantBaseline="central" textAnchor="start" fontSize={11} fontWeight={600} fill="var(--foreground)">
          {format(value)}
        </text>
      );
    }
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)">
        {format(value)}
      </text>
    );
  };
}

/** Rótulo dentro de um segmento empilhado; esconde-se quando não há espaço legível. */
export function segmentLabel(format: Format, color: string | ((payload?: Record<string, unknown>) => string)) {
  return function SegmentLabel(props: LabelProps) {
    const value = num(props.value);
    if (!value) return null;
    const x = num(props.x);
    const y = num(props.y);
    const width = num(props.width);
    const height = num(props.height);
    const text = format(value);
    const needed = text.length * 6.2 + 8;
    if (width < needed || height < 14) return null;
    const resolvedColor = typeof color === "function" ? color(props.payload) : color;
    const light = isDarkColor(resolvedColor);
    return (
      <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10.5}
        fontWeight={600}
        fill={light ? "var(--primary-foreground)" : "var(--foreground)"}
      >
        {text}
      </text>
    );
  };
}

/** Total da barra empilhada, colocado no fim do último segmento. */
export function stackTotalLabel(format: Format, horizontal = false) {
  return function StackTotalLabel(props: LabelProps) {
    const value = num(props.value);
    if (!value) return null;
    const x = num(props.x);
    const y = num(props.y);
    const width = num(props.width);
    const height = num(props.height);
    if (horizontal) {
      return (
        <text x={x + width + 8} y={y + height / 2} dominantBaseline="central" textAnchor="start" fontSize={11} fontWeight={700} fill="var(--foreground)">
          {format(value)}
        </text>
      );
    }
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--foreground)">
        {format(value)}
      </text>
    );
  };
}

/** Rótulo de um ponto de linha/área, usado apenas quando há poucos pontos. */
export function pointLabel(format: Format) {
  return function PointLabel(props: LabelProps) {
    const value = num(props.value);
    if (!value) return null;
    return (
      <text x={num(props.x)} y={num(props.y) - 8} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--foreground)">
        {format(value)}
      </text>
    );
  };
}
