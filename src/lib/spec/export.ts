/** Exportações da especificação funcional: Excel (várias folhas) e JSON. */
import {
  SPEC_AUDIT,
  SPEC_AUTOMATIONS,
  SPEC_CHANGES,
  SPEC_DJANGO,
  SPEC_ENTITIES,
  SPEC_NOTIFICATIONS,
  SPEC_PROFILES,
  SPEC_RULES,
  SPEC_VALIDATIONS,
  SPEC_VERSION,
  SPEC_VISIBILITY,
} from "./content";
import { specArea, type SpecVerificationMap } from "./verification";

const list = (v: string[]) => (v.length ? v.map((x) => `• ${x}`).join("\n") : "—");

const verif = (map: SpecVerificationMap | undefined, id: string) => map?.[id];

function stamp() {
  return new Date().toISOString().slice(0, 10).split("-").reverse().join("-");
}

export function specJson(verification?: SpecVerificationMap) {
  const withStatus = <T extends { id: string; category: never | string }>(item: T) => {
    const v = verif(verification, item.id);
    return {
      ...item,
      area_funcional: specArea(item as never),
      verification_status: v?.status ?? "Verificada",
      verification_method: v?.method ?? "Documental",
      verification_issues: v?.issues ?? [],
      last_verified: v?.checkedAt ?? SPEC_VERSION,
    };
  };
  return {
    documento: "Regras e Automação",
    versao: SPEC_VERSION,
    geradoEm: new Date().toISOString(),
    perfis: SPEC_PROFILES,
    regras: SPEC_RULES.map(withStatus),
    automacoes: SPEC_AUTOMATIONS.map(withStatus),
    validacoes: SPEC_VALIDATIONS,
    visibilidade: SPEC_VISIBILITY,
    notificacoes: SPEC_NOTIFICATIONS,
    auditoria: SPEC_AUDIT,
    entidades: SPEC_ENTITIES,
    notasDjango: SPEC_DJANGO,
    historico: SPEC_CHANGES,
  };
}

export function downloadJson(verification?: SpecVerificationMap) {
  const blob = new Blob([JSON.stringify(specJson(verification), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `regras-e-automacao-${stamp()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadExcel(verification?: SpecVerificationMap) {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();

  const add = (name: string, rows: Record<string, string>[], widths: number[]) => {
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(book, sheet, name);
  };

  add(
    "Regras",
    SPEC_RULES.map((r) => ({
      ID: r.id,
      Regra: r.name,
      Categoria: r.category,
      Estado: r.state,
      Descrição: r.description,
      Perfis: r.profiles.join(", "),
      "Quando acontece": r.trigger,
      Condições: list(r.conditions),
      Comportamento: list(r.behaviour),
      Resultado: r.result,
      Exceções: list(r.exceptions),
      "Dados envolvidos": list(r.data),
      Visibilidade: r.visibility,
      Auditoria: r.audit,
      Notificações: r.notifications,
      "Notas técnicas": r.technical,
      "Necessita validação": r.needsValidation ? "Sim" : "Não",
      "Área funcional": specArea(r),
      "Estado de verificação": verif(verification, r.id)?.status ?? "Verificada",
      "Como foi verificada": verif(verification, r.id)?.method ?? "Documental",
      "Incoerências detetadas": list(verif(verification, r.id)?.issues ?? []),
      "Última verificação": verif(verification, r.id)?.checkedAt ?? SPEC_VERSION,
    })),
    [10, 34, 20, 18, 60, 30, 34, 44, 60, 34, 40, 40, 34, 30, 34, 50, 18, 20, 22, 22, 50, 20],
  );

  add(
    "Automações",
    SPEC_AUTOMATIONS.map((a) => ({
      ID: a.id,
      Automação: a.name,
      "Quando dispara": a.trigger,
      Condições: list(a.conditions),
      Perfis: a.profiles.join(", "),
      Passos: list(a.steps),
      Resultado: a.result,
      Exceções: list(a.exceptions),
      Alternativa: a.fallback,
      "Dados envolvidos": list(a.data),
      Auditoria: a.audit,
      Notificações: a.notifications,
      "Necessita validação": a.needsValidation ? "Sim" : "Não",
      "Área funcional": specArea(a),
      "Estado de verificação": verif(verification, a.id)?.status ?? "Verificada",
      "Como foi verificada": verif(verification, a.id)?.method ?? "Documental",
      "Incoerências detetadas": list(verif(verification, a.id)?.issues ?? []),
      "Última verificação": verif(verification, a.id)?.checkedAt ?? SPEC_VERSION,
    })),
    [10, 34, 40, 44, 26, 70, 40, 40, 34, 40, 34, 44, 18, 20, 22, 22, 50, 20],
  );

  add(
    "Perfis",
    SPEC_PROFILES.map((p) => ({
      Perfil: p.name,
      Páginas: list(p.pages),
      "O que faz": list(p.actions),
      "O que vê": list(p.sees),
      "O que não vê": list(p.hidden),
      Cria: list(p.creates),
      Edita: list(p.edits),
      Remove: list(p.deletes),
      Delegação: p.delegates,
      Ocupação: p.adjusts,
      Calendário: p.calendar,
    })),
    [18, 44, 60, 50, 50, 40, 40, 40, 44, 40, 44],
  );

  add(
    "Validações",
    SPEC_VALIDATIONS.map((v) => ({
      ID: v.id,
      Área: v.area,
      Campo: v.field,
      Regra: v.rule,
      Mensagem: v.message,
      "Onde é garantida": v.enforcedIn,
    })),
    [10, 18, 22, 50, 60, 24],
  );

  add(
    "Visibilidade",
    SPEC_VISIBILITY.map((v) => ({
      Área: v.area,
      Informação: v.information,
      Proprietário: v.owner,
      Gestor: v.manager,
      Assistente: v.assistant,
      Administrador: v.administrator,
      Motorista: v.driver,
      Nota: v.note,
    })),
    [18, 34, 26, 26, 22, 22, 24, 50],
  );

  add(
    "Notificações",
    SPEC_NOTIFICATIONS.map((n) => ({
      ID: n.id,
      Evento: n.event,
      Destinatários: n.recipients,
      "Não recebem": n.excluded,
      Título: n.title,
      Conteúdo: n.content,
      Ação: n.action,
    })),
    [10, 44, 30, 30, 34, 44, 26],
  );

  add(
    "Auditoria",
    SPEC_AUDIT.map((a) => ({
      Ação: a.action,
      Entidade: a.entity,
      "Quando é registada": a.trigger,
      "O que guarda": a.fields,
    })),
    [44, 20, 34, 44],
  );

  add(
    "Entidades",
    SPEC_ENTITIES.map((e) => ({
      Entidade: e.name,
      Tabela: e.table,
      Objetivo: e.purpose,
      Campos: list(e.fields),
      Relações: list(e.relations),
      Retenção: e.retention,
    })),
    [24, 34, 44, 50, 44, 44],
  );

  add(
    "Notas Django",
    SPEC_DJANGO.map((d) => ({
      Área: d.area,
      Entidades: d.entities,
      "Lógica no servidor": d.serverSide,
      Notas: d.notes,
    })),
    [22, 30, 22, 80],
  );

  add(
    "Histórico",
    SPEC_CHANGES.map((c) => ({
      Data: c.date,
      Categoria: c.category,
      Regra: c.rule,
      Alteração: c.what,
      Antes: c.before,
      Depois: c.after,
      Autor: c.author,
    })),
    [12, 20, 20, 50, 44, 44, 14],
  );

  XLSX.writeFile(book, `regras-e-automacao-${stamp()}.xlsx`);
}
