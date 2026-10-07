/**
 * Turns backend / library errors (which arrive in English) into PT-PT messages
 * so nothing technical or English-language ever reaches the user.
 */
const RULES: Array<{ match: RegExp; message: string }> = [
  { match: /weak and easy to guess|pwned|leaked password|password is known to be weak/i, message: "Esta palavra-passe é demasiado comum e já apareceu em fugas de dados. Escolha outra." },
  { match: /unable to validate email address|invalid email|email address.*invalid|invalid format/i, message: "O email introduzido não é válido." },
  { match: /signup requires a valid password|password cannot be empty/i, message: "Introduza uma palavra-passe válida." },
  { match: /signups? (are )?(not allowed|disabled)/i, message: "A criação de contas está desativada de momento." },
  { match: /row-level security|violates row-level security|permission denied|not authorized|unauthorized|insufficient/i, message: "Sem permissão para efetuar esta operação." },

  { match: /jwt|token|session|refresh token/i, message: "A sessão expirou. Volte a iniciar sessão." },
  { match: /invalid login credentials/i, message: "Credenciais inválidas." },
  
  { match: /user already registered|already registered/i, message: "Já existe uma conta com este email." },
  { match: /password should be at least/i, message: "A palavra-passe tem de ter pelo menos 8 caracteres." },
  { match: /new password should be different|same as the old password/i, message: "A nova palavra-passe tem de ser diferente da anterior." },
  { match: /otp.*expired|token has expired|invalid.*(otp|recovery)|link is invalid/i, message: "Esta ligação de recuperação é inválida ou expirou. Peça uma nova." },
  { match: /over_email_send_rate_limit|email rate limit/i, message: "Já foram enviados vários emails. Aguarde alguns minutos antes de tentar novamente." },
  { match: /rate limit|too many requests/i, message: "Demasiadas tentativas. Tente novamente dentro de momentos." },

  { match: /conflict|overlap|sobreposi/i, message: "Conflito de horário com outra ocupação do motorista." },
  { match: /duplicate key|already exists|unique constraint/i, message: "Este registo já existe." },
  { match: /foreign key|violates foreign key/i, message: "Existem dados associados que impedem esta operação." },
  { match: /not null|null value in column/i, message: "Faltam campos obrigatórios." },
  { match: /check constraint|invalid input/i, message: "Os dados introduzidos não são válidos." },
  { match: /no rows|not found|does not exist/i, message: "Registo não encontrado." },
  { match: /network|failed to fetch|timeout|timed out/i, message: "Falha de ligação. Verifique a Internet e tente novamente." },
];

export function errorMessagePt(error: unknown, fallback = "Ocorreu um erro. Tente novamente."): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error
          ? String((error as { message: unknown }).message ?? "")
          : "";
  if (!raw) return fallback;
  for (const rule of RULES) if (rule.match.test(raw)) return rule.message;
  // Anything still in English (no accented/PT hint) falls back to the generic message.
  return /[áàâãéêíóôõúç]/i.test(raw) ? raw : fallback;
}
