/**
 * Interface de envio (backend de email) e implementação temporária.
 *
 * A lógica de negócio depende apenas de `EmailBackend`. Trocar de fornecedor
 * — ou passar para o backend de email do Django — é substituir a implementação
 * devolvida por `getEmailBackend()`, sem tocar nas regras de atribuição.
 */

import { getEmailConfig } from "./config";

export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
  /** Identificador do modelo (ex.: "new_service_assigned"). */
  template: string;
  /** Dados do evento que originou a mensagem, para registo/depuração. */
  context?: Record<string, unknown>;
};

export type EmailSendResult = {
  sent: boolean;
  /** "console" enquanto não existir fornecedor real; depois "django" ou outro. */
  backend: string;
  reason?: string;
};

export interface EmailBackend {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/**
 * Protótipo: não envia nada, apenas regista que a mensagem seria enviada.
 * Substituível pelo backend real sem alterar quem o chama.
 */
export const consoleEmailBackend: EmailBackend = {
  name: "console",
  async send(message) {
    const from = getEmailConfig().defaultFromEmail;
    console.info(
      `Email notification queued: ${message.subject} → ${message.to} (de ${from}, modelo ${message.template})`,
    );
    return { sent: false, backend: "console", reason: "email_backend_not_configured" };
  },
};

/** Ponto único de escolha do backend. Em Django, devolver o backend de settings. */
export function getEmailBackend(): EmailBackend {
  // Enquanto `EMAIL_HOST`/`EMAIL_ENABLED` não estiverem definidos, fica a consola.
  return consoleEmailBackend;
}
