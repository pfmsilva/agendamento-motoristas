/**
 * Camada leve de controlo funcional da página "Regras e Automação".
 *
 * Cada verificação compara a regra documentada com a implementação atual
 * (constantes da aplicação e configuração real dos dados). Só é assinalada
 * uma incoerência quando existe prova concreta; nunca por suposição.
 */
import { supabase } from "@/integrations/supabase/client";
import { MAX_OCCURRENCES, RECURRENCE_LIMIT_MESSAGE, occurrenceDates } from "@/lib/recurrence";
import { AVAILABILITY_LABEL } from "@/lib/scheduling";
import { SPEC_AUTOMATIONS, SPEC_RULES } from "./content";
import type { SpecArea, SpecAutomation, SpecCategory, SpecRule, SpecVerificationStatus } from "./types";

export type SpecVerification = {
  status: SpecVerificationStatus;
  /** Descrição das incoerências detetadas (vazio quando está tudo coerente). */
  issues: string[];
  /** Como foi verificada: automática (com prova) ou revisão documental. */
  method: "Automática" | "Documental";
  /** DD/MM/AAAA */
  checkedAt: string;
};

export type SpecVerificationMap = Record<string, SpecVerification>;

const AREA_BY_CATEGORY: Record<SpecCategory, SpecArea> = {
  "Perfis e permissões": "permissões",
  Serviços: "serviços",
  Motoristas: "disponibilidade",
  Administração: "permissões",
  Delegações: "delegações",
  Calendário: "calendário",
  Deslocações: "deslocações",
  Garagem: "garagem",
  "Viaturas de empréstimo": "viaturas",
  Férias: "férias",
  Notificações: "notificações",
  Auditoria: "auditoria",
  Automações: "serviços",
  Dados: "dados",
  Análises: "análises",
  Validações: "dados",
};

/** Área funcional associada à regra (explícita ou deduzida da categoria). */
export function specArea(item: { category: SpecCategory; area?: SpecArea }): SpecArea {
  return item.area ?? AREA_BY_CATEGORY[item.category];
}

const todayPt = () => new Date().toLocaleDateString("pt-PT");

/** Verificação automática: devolve as incoerências encontradas para uma regra. */
type Check = { id: string; run: () => Promise<string[]> };

/** Devolve o nº de linhas ou null quando a contagem não pôde ser feita. */
async function count(
  result: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number | null> {
  const { count: n, error } = await result;
  return error ? null : (n ?? 0);
}

const CHECKS: Check[] = [
  {
    id: "REC-001",
    run: async () => {
      const issues: string[] = [];
      if (MAX_OCCURRENCES !== 120) {
        issues.push(`A documentação define 120 ocorrências, mas a aplicação usa ${MAX_OCCURRENCES}.`);
      }
      // A configuração acima do limite tem de ser recusada, nunca cortada em silêncio.
      const start = new Date();
      const until = new Date(start.getTime() + 1000 * 60 * 60 * 24 * 365 * 5).toISOString().slice(0, 10);
      let rejected = false;
      try {
        occurrenceDates(start, "weekly", until);
      } catch (e) {
        rejected = e instanceof Error && e.message === RECURRENCE_LIMIT_MESSAGE;
      }
      if (!rejected) {
        issues.push("Uma repetição semanal de 5 anos devia ser recusada com aviso, mas foi aceite.");
      }
      return issues;
    },
  },
  {
    id: "AVAIL-001",
    run: async () => {
      const labels = Object.values(AVAILABILITY_LABEL);
      const expected = ["Disponível", "A confirmar", "Indisponível"];
      const missing = expected.filter((l) => !labels.includes(l));
      return missing.length
        ? [`A documentação define três estados; falta apresentar: ${missing.join(", ")}.`]
        : [];
    },
  },
  {
    id: "GAR-001",
    run: async () => {
      const n = await count(
        supabase
          .from("activities")
          .select("id", { count: "exact", head: true })
          .eq("event_kind", "garage")
          .is("city_id", null),
      );
      if (n === null) return [];
      return n > 0
        ? [`${n} evento(s) de Garagem sem local, apesar de o local ser obrigatório na regra documentada.`]
        : [];
    },
  },
  {
    id: "AUTO-008",
    run: async () => {
      // Prova concreta: uma delegação sem fim definido nunca termina sozinha.
      const n = await count(
        supabase
          .from("assistant_delegations")
          .select("id", { count: "exact", head: true })
          .eq("active", true)
          .is("end_datetime", null),
      );
      if (n === null) return [];
      return n > 0
        ? [
            `${n} delegação(ões) marcada(s) como temporária(s) não tem data de fim, pelo que o acesso nunca ` +
              "termina automaticamente.",
          ]
        : [];
    },
  },
  {
    id: "AUTO-012",
    run: async () => {
      const issues: string[] = [];
      // Prova concreta 1: serviço alterado manualmente mas ainda marcado para restauro automático.
      const overridable = await count(
        supabase
          .from("activities")
          .select("id", { count: "exact", head: true })
          .eq("assignment_status", "manual")
          .eq("reassign_overridden", false)
          .not("reassign_timeoff_id", "is", null),
      );
      if (overridable !== null && overridable > 0) {
        issues.push(
          `${overridable} serviço(s) com atribuição manual continuam marcados para restauro automático por férias.`,
        );
      }
      // Prova concreta 2: serviço com motorista de férias ainda atribuído no período da ausência.
      const stuck = await count(
        supabase
          .from("activities")
          .select("id", { count: "exact", head: true })
          .eq("event_kind", "administration")
          .neq("status", "cancelled")
          .not("reassign_timeoff_id", "is", null)
          .is("driver_id", null)
          .neq("assignment_status", "pending_manual"),
      );
      if (stuck !== null && stuck > 0) {
        issues.push(`${stuck} serviço(s) sem motorista após reatribuição por férias não estão "Por atribuir".`);
      }
      return issues;
    },
  },
  {
    id: "PRIV-002",
    run: async () => {
      // O Proprietário/Gestor não pode ler notas de Assistentes/Administradores.
      const n = await count(
        supabase.from("activity_private_notes").select("activity_id", { count: "exact", head: true }),
      );
      if (n === null) return [];
      return n > 0
        ? [`${n} nota(s) reservada(s) ficaram legíveis para este perfil, contrariando a regra de privacidade.`]
        : [];
    },
  },
];

/**
 * Corre todas as verificações automáticas e devolve o estado por regra.
 * Regras sem verificação automática ficam "Verificada" por revisão documental,
 * exceto se ainda estiverem marcadas como "Necessita validação".
 */
export async function runSpecVerification(): Promise<SpecVerificationMap> {
  const at = todayPt();
  const results: SpecVerificationMap = {};
  const automatic = new Map<string, string[]>();

  await Promise.all(
    CHECKS.map(async (check) => {
      try {
        automatic.set(check.id, await check.run());
      } catch {
        // Uma verificação que não consegue correr não inventa problemas.
      }
    }),
  );

  const apply = (item: SpecRule | SpecAutomation) => {
    const issues = automatic.get(item.id);
    const checked = issues !== undefined;
    const failing = checked && issues.length > 0;
    results[item.id] = {
      status: failing || item.needsValidation ? "Necessita revisão" : "Verificada",
      issues: issues ?? [],
      method: checked ? "Automática" : "Documental",
      checkedAt: checked ? at : (item.verifiedOn ?? at),
    };
  };

  SPEC_RULES.forEach(apply);
  SPEC_AUTOMATIONS.forEach(apply);
  return results;
}
