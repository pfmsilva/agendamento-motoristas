import { addDays, addMonths, addWeeks, addYears } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

export type RecurrenceFreq = Database["public"]["Enums"]["recurrence_freq"];

export const RECURRENCE_OPTIONS: RecurrenceFreq[] = ["daily", "weekly", "monthly", "yearly"];

/**
 * Limite único de ocorrências de uma série, igual na aplicação e na base de
 * dados. Cerca de 2,3 anos numa repetição semanal.
 */
export const MAX_OCCURRENCES = 120;

export const RECURRENCE_LIMIT_MESSAGE =
  "A repetição selecionada ultrapassa o limite máximo de 120 ocorrências. Reduza o período de repetição.";

/** Mesma regra da base de dados: soma n semanas / meses / anos à data base. */
export function shiftBy(date: Date, freq: RecurrenceFreq, n: number): Date {
  if (freq === "daily") return addDays(date, n);
  if (freq === "weekly") return addWeeks(date, n);
  if (freq === "monthly") return addMonths(date, n);
  return addYears(date, n);
}

/**
 * Datas de todas as ocorrências (a primeira incluída), até ao fim do dia
 * "repetir até". Cada data dá origem a um evento independente.
 */
export function occurrenceDates(
  start: Date,
  freq: RecurrenceFreq,
  until: string,
  options: { cap?: boolean } = {},
): Date[] {
  const [y, m, d] = until.split("-").map(Number);
  if (!y || !m || !d) return [start];
  const limit = new Date(y, m - 1, d, 23, 59, 59, 999);
  const out: Date[] = [];
  for (let i = 0; i <= MAX_OCCURRENCES; i++) {
    const next = shiftBy(start, freq, i);
    if (next > limit) break;
    // Nunca truncar em silêncio: acima do limite a criação é recusada.
    if (out.length >= MAX_OCCURRENCES) {
      if (options.cap) break;
      throw new Error(RECURRENCE_LIMIT_MESSAGE);
    }
    out.push(next);
  }
  return out.length ? out : [start];
}

/**
 * Horizonte de repetição sem data de fim: mesmo limite usado na base de dados
 * (12 meses), prolongado automaticamente à medida que o tempo avança.
 */
export function openEndedUntil(from: Date = new Date()): string {
  const d = addMonths(from, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Dias da semana ISO (1 = segunda … 7 = domingo), igual à base de dados. */
export const WEEKDAY_LABELS: { value: number; short: string }[] = [
  { value: 1, short: "Seg" },
  { value: 2, short: "Ter" },
  { value: 3, short: "Qua" },
  { value: 4, short: "Qui" },
  { value: 5, short: "Sex" },
  { value: 6, short: "Sáb" },
  { value: 7, short: "Dom" },
];

/** Nº de ocorrências que a configuração escolhida geraria (sem limite). */
export function countOccurrences(start: Date, freq: RecurrenceFreq, until: string, weekdays: number[] = []): number {
  const [y, m, d] = until.split("-").map(Number);
  if (!y || !m || !d) return 1;
  const limit = new Date(y, m - 1, d, 23, 59, 59, 999);
  if (freq === "weekly" && weekdays.length) {
    let count = 0;
    for (let day = new Date(start); day <= limit && count <= MAX_OCCURRENCES; day = addDays(day, 1)) {
      if (weekdays.includes(((day.getDay() + 6) % 7) + 1)) count++;
    }
    return Math.max(count, 1);
  }
  let n = 0;
  while (shiftBy(start, freq, n) <= limit) {
    n++;
    if (n > MAX_OCCURRENCES) break;
  }
  return Math.max(n, 1);
}

/** Mensagem a mostrar quando a repetição escolhida passa do limite, ou null. */
export function recurrenceLimitError(
  start: Date,
  freq: RecurrenceFreq,
  until: string,
  weekdays: number[] = [],
): string | null {
  return countOccurrences(start, freq, until, weekdays) > MAX_OCCURRENCES ? RECURRENCE_LIMIT_MESSAGE : null;
}

/** Uma ocorrência com problema (por exemplo conflito) não impede as restantes. */
export async function runOccurrences(
  dates: Date[],
  run: (start: Date, index: number) => Promise<unknown>,
): Promise<{ created: number; failed: { date: Date; message: string }[] }> {
  let created = 0;
  const failed: { date: Date; message: string }[] = [];
  for (const [i, date] of dates.entries()) {
    try {
      await run(date, i);
      created++;
    } catch (e) {
      failed.push({ date, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { created, failed };
}
