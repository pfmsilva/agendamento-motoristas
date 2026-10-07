/**
 * Processamento da fila de email (`email_outbox`).
 *
 * A base de dados enfileira uma mensagem sempre que um serviço passa a ter
 * motorista ou muda de motorista (trigger `t_activities_email_assignment`),
 * pelo que nunca há envios duplicados por recarregar, abrir ou editar campos
 * não relacionados. Aqui só se entrega a mensagem ao backend configurado.
 *
 * Em Django: substituir por uma tarefa (management command/celery) que percorre
 * a mesma fila e usa `django.core.mail` com as settings centrais.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getEmailBackend } from "./backend";

export const flushEmailQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const backend = getEmailBackend();

    const { data, error } = await supabaseAdmin
      .from("email_outbox")
      .select("id, template, recipient_email, subject, body, payload")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);

    let processed = 0;
    for (const row of data ?? []) {
      const result = await backend.send({
        to: row.recipient_email,
        subject: row.subject,
        body: row.body,
        template: row.template,
        context: (row.payload as Record<string, unknown>) ?? {},
      });
      await supabaseAdmin
        .from("email_outbox")
        .update({
          // Sem fornecedor real a mensagem fica registada como "logged".
          status: result.sent ? "sent" : "logged",
          error: result.reason ?? null,
          processed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      processed += 1;
    }

    return { processed, backend: backend.name };
  });
