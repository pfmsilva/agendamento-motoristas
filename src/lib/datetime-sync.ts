/**
 * Regra global de sincronização Início → Fim.
 *
 * O Fim só é corrigido automaticamente quando o novo Início passa a ser
 * posterior ao Fim atual. Caso contrário, o valor de Fim escolhido pelo
 * utilizador mantém-se exatamente como está (e continua sempre editável).
 *
 * A comparação usa data + hora completas, nunca apenas a hora.
 */

/** Combina data (YYYY-MM-DD) e hora (HH:MM) num valor comparável. */
export function combineDateTime(date: string, time: string): string {
  return `${date}T${time}`;
}

/**
 * Devolve o Fim a aplicar para um novo Início.
 * Ambos os valores devem estar no formato ISO local "YYYY-MM-DDTHH:MM".
 */
export function syncEndWithStart(nextStart: string, currentEnd: string): string {
  if (!nextStart) return currentEnd;
  if (!currentEnd) return nextStart;
  return nextStart > currentEnd ? nextStart : currentEnd;
}

/**
 * Variante para formulários com data e hora em campos separados.
 * Devolve a nova data e hora de fim.
 */
export function syncEndParts(
  nextStartDate: string,
  nextStartTime: string,
  endDate: string,
  endTime: string,
): { date: string; time: string } {
  const nextEnd = syncEndWithStart(
    combineDateTime(nextStartDate, nextStartTime),
    combineDateTime(endDate, endTime),
  );
  const [date = endDate, time = endTime] = nextEnd.split("T");
  return { date, time };
}
