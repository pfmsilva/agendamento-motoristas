/**
 * Modelo de dados da especificação funcional ("Regras e Automação").
 *
 * Fonte única: as secções da página e as exportações (Excel/JSON) são
 * geradas a partir das mesmas estruturas definidas em `src/lib/spec/*`.
 * Nunca duplicar a descrição de uma regra: atualizar a regra existente.
 */

export type SpecCategory =
  | "Perfis e permissões"
  | "Serviços"
  | "Motoristas"
  | "Administração"
  | "Delegações"
  | "Calendário"
  | "Deslocações"
  | "Garagem"
  | "Viaturas de empréstimo"
  | "Férias"
  | "Notificações"
  | "Auditoria"
  | "Automações"
  | "Dados"
  | "Análises"
  | "Validações";

export const SPEC_CATEGORIES: SpecCategory[] = [
  "Perfis e permissões",
  "Serviços",
  "Motoristas",
  "Administração",
  "Delegações",
  "Calendário",
  "Deslocações",
  "Garagem",
  "Viaturas de empréstimo",
  "Férias",
  "Notificações",
  "Auditoria",
  "Automações",
  "Dados",
  "Análises",
  "Validações",
];

export type SpecState = "Implementado" | "Parcial" | "Necessita validação";

/** Área funcional da aplicação que implementa a regra (não é código-fonte). */
export type SpecArea =
  | "permissões"
  | "serviços"
  | "disponibilidade"
  | "recorrência"
  | "delegações"
  | "notificações"
  | "férias"
  | "garagem"
  | "viaturas"
  | "calendário"
  | "deslocações"
  | "auditoria"
  | "dados"
  | "análises";

export type SpecVerificationStatus = "Verificada" | "Necessita revisão";

export type ProfileName = "Proprietário" | "Gestor" | "Assistente" | "Administrador" | "Motorista";

export type SpecRule = {
  /** Identificador estável, usado nas exportações e nas referências cruzadas. */
  id: string;
  name: string;
  category: SpecCategory;
  state: SpecState;
  description: string;
  profiles: ProfileName[];
  trigger: string;
  conditions: string[];
  behaviour: string[];
  result: string;
  exceptions: string[];
  data: string[];
  visibility: string;
  audit: string;
  notifications: string;
  technical: string;
  /** Verdadeiro quando o comportamento atual é ambíguo, incompleto ou inconsistente. */
  needsValidation: boolean;
  /** Área funcional que implementa a regra; por omissão é deduzida da categoria. */
  area?: SpecArea;
  /** Data da última verificação manual (DD/MM/AAAA); as automáticas são datadas na hora. */
  verifiedOn?: string;
};

export type SpecAutomation = {
  id: string;
  name: string;
  category: SpecCategory;
  trigger: string;
  conditions: string[];
  profiles: ProfileName[];
  data: string[];
  steps: string[];
  result: string;
  exceptions: string[];
  fallback: string;
  audit: string;
  notifications: string;
  needsValidation: boolean;
  area?: SpecArea;
  verifiedOn?: string;
};

export type SpecProfile = {
  name: ProfileName;
  pages: string[];
  actions: string[];
  sees: string[];
  hidden: string[];
  creates: string[];
  edits: string[];
  deletes: string[];
  delegates: string;
  adjusts: string;
  calendar: string;
};

export type SpecEntity = {
  name: string;
  table: string;
  purpose: string;
  fields: string[];
  relations: string[];
  retention: string;
};

export type SpecValidation = {
  id: string;
  area: SpecCategory;
  field: string;
  rule: string;
  message: string;
  enforcedIn: "Base de dados" | "Interface" | "Interface + Base de dados";
};

export type SpecVisibility = {
  area: string;
  information: string;
  owner: string;
  manager: string;
  assistant: string;
  administrator: string;
  driver: string;
  note: string;
};

export type SpecNotification = {
  id: string;
  event: string;
  recipients: string;
  excluded: string;
  title: string;
  content: string;
  action: string;
};

export type SpecAudit = {
  action: string;
  entity: string;
  trigger: string;
  fields: string;
};

export type SpecChange = {
  date: string;
  category: SpecCategory | "Documentação";
  rule: string;
  what: string;
  before: string;
  after: string;
  author: string;
};

export type SpecDjangoNote = {
  area: string;
  entities: string;
  serverSide: string;
  notes: string;
};
