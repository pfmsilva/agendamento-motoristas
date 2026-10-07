/**
 * Notificações por email do domínio (independentes do fornecedor).
 *
 * As regras de negócio chamam `sendNewServiceEmail(driver, service)`; quem
 * envia é o backend devolvido por `getEmailBackend()`. Em Django, manter esta
 * função como serviço de domínio e ligá-la ao backend de email das settings.
 */

import { getEmailBackend, type EmailMessage, type EmailSendResult } from "./backend";

export type EmailDriver = {
  id: string;
  name: string;
  /** Email do perfil do utilizador associado ao motorista. */
  email: string | null;
};

export type EmailService = {
  id: string;
  /** ISO 8601 do início do serviço. */
  start: string;
  end?: string | null;
};

const SUBJECT = "Novo serviço atribuído";
const BODY =
  "Foi-lhe atribuído um novo serviço. Consulte a aplicação Gestão de Frota para ver os respetivos detalhes.";

const formatPt = (iso: string) =>
  new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(new Date(iso));

/** Constrói a mensagem; só inclui dados que o Motorista já pode ver. */
export function buildNewServiceEmail(driver: EmailDriver, service: EmailService): EmailMessage {
  return {
    to: driver.email ?? "",
    subject: SUBJECT,
    body: `${BODY}\n\nData e hora: ${formatPt(service.start)}.`,
    template: "new_service_assigned",
    context: { driver_id: driver.id, driver_name: driver.name, activity_id: service.id },
  };
}

/**
 * Notifica o motorista de um serviço que lhe foi atribuído.
 * A deteção de "nova atribuição" (criado já com motorista, motorista passa a
 * existir, ou muda de motorista) é feita antes de chamar esta função.
 */
export async function sendNewServiceEmail(
  driver: EmailDriver,
  service: EmailService,
): Promise<EmailSendResult> {
  if (!driver.email) {
    return { sent: false, backend: "none", reason: "driver_without_email" };
  }
  return getEmailBackend().send(buildNewServiceEmail(driver, service));
}
