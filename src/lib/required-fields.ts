/**
 * Mensagens de campos obrigatórios em PT-PT, geradas dinamicamente
 * a partir dos campos que faltam preencher.
 */

export type RequiredField = {
  /** Rótulo do campo tal como aparece na interface, sem artigo. */
  label: string;
  /** Género gramatical do rótulo, para concordância. */
  gender?: "m" | "f";
  /** Verdadeiro quando o campo está preenchido. */
  filled: boolean;
};

const article = (gender: "m" | "f") => (gender === "f" ? "A" : "O");

/**
 * Devolve a mensagem para os campos em falta, ou null se estiver tudo preenchido.
 * Ex.: "O motorista e o início do serviço são obrigatórios."
 */
export function missingFieldsMessage(fields: RequiredField[]): string | null {
  const missing = fields.filter((f) => !f.filled);
  if (missing.length === 0) return null;

  const names = missing.map((f) => `${article(f.gender ?? "m")} ${f.label}`);
  const first = names[0]!;

  if (names.length === 1) {
    const gender = missing[0]!.gender ?? "m";
    return `${first} é obrigatóri${gender === "f" ? "a" : "o"}.`;
  }

  const list = `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`
    // apenas o primeiro artigo mantém maiúscula
    .replace(/(?!^)\b(O|A) /g, (m) => m.toLowerCase());

  const allFeminine = missing.every((f) => (f.gender ?? "m") === "f");
  return `${list} são obrigatóri${allFeminine ? "as" : "os"}.`;
}
