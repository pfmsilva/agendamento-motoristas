/**
 * Configuração central do envio de email.
 *
 * Único local onde o remetente e o servidor de email são definidos. Nenhuma
 * regra de negócio conhece o fornecedor: só este ficheiro lê configuração.
 *
 * Migração para Django: substituir a leitura de `process.env` pelas settings
 * equivalentes (`DEFAULT_FROM_EMAIL`, `EMAIL_HOST`, `EMAIL_PORT`,
 * `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `EMAIL_USE_SSL`).
 * Os nomes das variáveis são propositadamente os mesmos.
 */

export type EmailConfig = {
  defaultFromEmail: string;
  host: string | null;
  port: number | null;
  user: string | null;
  password: string | null;
  useTls: boolean;
  useSsl: boolean;
  /** Quando falso, nada é enviado: as mensagens ficam apenas registadas. */
  enabled: boolean;
};

const bool = (v: string | undefined, fallback = false) =>
  v === undefined ? fallback : ["1", "true", "yes", "on"].includes(v.toLowerCase());

/** Lê a configuração no servidor (nunca no browser: só é chamada em handlers). */
export function getEmailConfig(): EmailConfig {
  const env = process.env;
  const host = env['EMAIL_HOST'] ?? null;
  return {
    // Placeholder até existir conta de envio; nunca escrito noutro ficheiro.
    defaultFromEmail: env['DEFAULT_FROM_EMAIL'] ?? "nao-responder@exemplo.invalid",
    host,
    port: env['EMAIL_PORT'] ? Number(env['EMAIL_PORT']) : null,
    user: env['EMAIL_HOST_USER'] ?? null,
    password: env['EMAIL_HOST_PASSWORD'] ?? null,
    useTls: bool(env['EMAIL_USE_TLS'], true),
    useSsl: bool(env['EMAIL_USE_SSL']),
    // Sem servidor configurado, o backend de consola é o único ativo.
    enabled: bool(env['EMAIL_ENABLED']) && Boolean(host),
  };
}
