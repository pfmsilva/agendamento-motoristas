import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { runSpecVerification, specArea, type SpecVerificationMap } from "@/lib/spec/verification";
import { ChevronDown, Download, FileJson, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { downloadExcel, downloadJson } from "@/lib/spec/export";
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
} from "@/lib/spec/content";
import { SPEC_CATEGORIES, type SpecCategory } from "@/lib/spec/types";

export const Route = createFileRoute("/_authenticated/rules")({
  head: () => ({
    meta: [
      { title: "Regras e Automação · Gestão de Frota" },
      {
        name: "description",
        content:
          "Documentação funcional completa da gestão de frota: regras, automações, permissões, validações e modelo de dados.",
      },
      { property: "og:title", content: "Regras e Automação · Gestão de Frota" },
      {
        property: "og:description",
        content: "Fonte única da lógica funcional da aplicação, pesquisável e exportável.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RulesPage,
});

const SECTIONS = [
  { id: "perfis", label: "Perfis e permissões" },
  { id: "regras", label: "Regras funcionais" },
  { id: "automacoes", label: "Automações" },
  { id: "validacoes", label: "Validações e mensagens" },
  { id: "visibilidade", label: "Matriz de visibilidade" },
  { id: "notificacoes", label: "Notificações" },
  { id: "auditoria", label: "Auditoria" },
  { id: "entidades", label: "Entidades e dados" },
  { id: "django", label: "Notas para Django" },
  { id: "historico", label: "Histórico de alterações" },
];

const matches = (query: string, ...parts: (string | string[] | undefined)[]) => {
  if (!query) return true;
  const hay = parts
    .flatMap((p) => (Array.isArray(p) ? p : [p ?? ""]))
    .join(" ")
    .toLowerCase();
  return hay.includes(query.toLowerCase());
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="whitespace-pre-line text-sm">{value || "—"}</p>
    </div>
  );
}

function ListField({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {values.length === 0 ? (
        <p className="text-sm">—</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-4 text-sm">
          {values.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Card({
  title,
  subtitle,
  badges,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  badges: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="panel overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-4 text-left hover:bg-muted/40"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            {badges}
          </div>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <ChevronDown className={`mt-1 size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="grid gap-4 border-t p-4 md:grid-cols-2">{children}</div>}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0 align-top">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 whitespace-pre-line">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Indicador discreto do estado de verificação de uma regra. */
function VerificationChip({ status, date }: { status: string; date?: string | undefined }) {
  const review = status === "Necessita revisão";
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
        review ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground"
      }`}
      title={date ? `Última verificação: ${date}` : undefined}
    >
      {status}
      {date ? ` · ${date}` : ""}
    </span>
  );
}

function RulesPage() {
  const { user, loading } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<SpecCategory | "todas">("todas");
  const [onlyReview, setOnlyReview] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  // Verificação automática: compara a regra documentada com a implementação atual.
  const { data: verification } = useQuery<SpecVerificationMap>({
    queryKey: ["spec-verification"],
    queryFn: runSpecVerification,
    enabled: user?.role === "owner",
    staleTime: 60_000,
  });
  const check = (id: string) => verification?.[id];
  const needsReview = (id: string, fallback: boolean) =>
    verification ? verification[id]?.status === "Necessita revisão" : fallback;


  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rules = useMemo(
    () =>
      SPEC_RULES.filter(
        (r) =>
          (category === "todas" || r.category === category) &&
          (!onlyReview || needsReview(r.id, r.needsValidation)) &&
          matches(
            search,
            r.id,
            r.name,
            r.category,
            r.description,
            r.trigger,
            r.result,
            r.visibility,
            r.technical,
            r.conditions,
            r.behaviour,
            r.exceptions,
            r.data,
            r.profiles,
          ),
      ),
    [search, category, onlyReview],
  );

  const automations = useMemo(
    () =>
      SPEC_AUTOMATIONS.filter(
        (a) =>
          (category === "todas" || category === "Automações") &&
          (!onlyReview || needsReview(a.id, a.needsValidation)) &&
          matches(search, a.id, a.name, a.trigger, a.result, a.fallback, a.steps, a.conditions, a.exceptions, a.data),
      ),
    [search, category, onlyReview],
  );

  const validations = useMemo(
    () =>
      SPEC_VALIDATIONS.filter(
        (v) =>
          (category === "todas" || v.area === category) &&
          !onlyReview &&
          matches(search, v.id, v.area, v.field, v.rule, v.message),
      ),
    [search, category, onlyReview],
  );

  const pending = useMemo(
    () => [
      ...SPEC_RULES.filter((r) => needsReview(r.id, r.needsValidation)).map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category as string,
        section: "regras",
        issues: verification?.[r.id]?.issues ?? [],
      })),
      ...SPEC_AUTOMATIONS.filter((a) => needsReview(a.id, a.needsValidation)).map((a) => ({
        id: a.id,
        name: a.name,
        category: "Automações",
        section: "automacoes",
        issues: verification?.[a.id]?.issues ?? [],
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [verification],
  );

  const reviewCount = pending.length;


  if (loading) return <p className="p-6 text-sm text-muted-foreground">A carregar…</p>;
  if (user?.role !== "owner") {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="panel p-6">
          <h1 className="font-display text-lg font-semibold">Regras e Automação</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta área é exclusiva do Proprietário.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Regras e Automação</h1>
            <p className="text-sm text-muted-foreground">
              Documentação funcional completa do que a aplicação faz hoje: regras, automações, permissões,
              validações, exceções e dados. Versão {SPEC_VERSION}.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void downloadExcel(verification)}>
              <Download className="mr-2 size-4" />
              Exportar para Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadJson(verification)}>
              <FileJson className="mr-2 size-4" />
              Exportar JSON
            </Button>
          </div>
        </div>
        <p className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
          Esta página é a fonte única da lógica funcional. Sempre que uma regra, permissão, automação ou
          validação mudar, esta documentação e as exportações têm de ser atualizadas na mesma alteração, com
          uma linha nova no histórico. Cada regra mostra o seu estado de verificação: <strong>Verificada</strong> ou{" "}
          <strong>Necessita revisão</strong> ({reviewCount}). As incoerências só são assinaladas quando há prova
          concreta na aplicação ou nos dados atuais.
        </p>
      </header>

      {pending.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sem pontos pendentes de validação. Nenhuma incoerência detetada entre a documentação e a aplicação.
        </p>
      ) : (
        <div className="panel space-y-2 border-destructive/40 p-4">
          <h2 className="font-display text-base font-semibold">Pontos a validar ({pending.length})</h2>
          <p className="text-xs text-muted-foreground">
            Comportamentos sem decisão confirmada ou incoerências detetadas entre a regra documentada e a
            aplicação. Desaparecem daqui assim que forem resolvidos.
          </p>
          <ul className="divide-y">
            {pending.map((p) => (
              <li key={p.id} className="space-y-1 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {p.id} · {p.name}
                  </span>
                  <Badge variant="outline">{p.category}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => {
                      setSearch("");
                      setCategory("todas");
                      setOnlyReview(false);
                      setOpenIds((prev) => new Set(prev).add(p.id));
                      requestAnimationFrame(() =>
                        document.getElementById(p.section)?.scrollIntoView({ behavior: "smooth" }),
                      );
                    }}
                  >
                    Ver regra
                  </Button>
                </div>
                {p.issues.map((issue) => (
                  <p key={issue} className="text-xs text-destructive">
                    {issue}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}


      <nav className="panel flex flex-wrap gap-1.5 p-3">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="panel grid gap-3 p-3 md:grid-cols-[2fr_1fr_auto_auto]">
        <div>
          <Label className="text-xs">Pesquisar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Regra, automação, campo, mensagem…"
              className="pl-8"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Categoria</Label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SpecCategory | "todas")}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="todas">Todas</option>
            {SPEC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button
            variant={onlyReview ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyReview((v) => !v)}
          >
            Necessita validação
          </Button>
        </div>
        <div className="flex items-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setOpenIds(new Set([...rules.map((r) => r.id), ...automations.map((a) => a.id)]))
            }
          >
            Expandir
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpenIds(new Set())}>
            Fechar
          </Button>
        </div>
      </div>

      <Section
        id="perfis"
        title="Perfis e permissões"
        description="O que cada perfil vê, faz, cria, edita e nunca vê."
      >
        <div className="grid gap-3">
          {SPEC_PROFILES.map((p) => (
            <Card
              key={p.name}
              title={p.name}
              subtitle={p.pages.join(" · ")}
              badges={null}
              open={openIds.has(p.name)}
              onToggle={() => toggle(p.name)}
            >
              <ListField label="O que faz" values={p.actions} />
              <ListField label="O que vê" values={p.sees} />
              <ListField label="O que não vê" values={p.hidden} />
              <ListField label="Cria" values={p.creates} />
              <ListField label="Edita" values={p.edits} />
              <ListField label="Remove" values={p.deletes} />
              <Field label="Delegação" value={p.delegates} />
              <Field label="Ajuste de ocupação" value={p.adjusts} />
              <Field label="Calendário" value={p.calendar} />
            </Card>
          ))}
        </div>
      </Section>

      <Section
        id="regras"
        title={`Regras funcionais (${rules.length})`}
        description="Cada regra com condições, comportamento, resultado, exceções, dados, visibilidade e auditoria."
      >
        <div className="grid gap-3">
          {rules.length === 0 && (
            <p className="panel p-4 text-sm text-muted-foreground">Sem regras para os filtros escolhidos.</p>
          )}
          {rules.map((r) => (
            <Card
              key={r.id}
              title={`${r.id} · ${r.name}`}
              subtitle={r.description}
              badges={
                <>
                  <Badge variant="outline">{r.category}</Badge>
                  <Badge variant={r.state === "Implementado" ? "secondary" : "destructive"}>{r.state}</Badge>
                  <span className="text-[11px] text-muted-foreground">{specArea(r)}</span>
                  <VerificationChip
                    status={needsReview(r.id, r.needsValidation) ? "Necessita revisão" : "Verificada"}
                    date={check(r.id)?.checkedAt}
                  />
                </>
              }
              open={openIds.has(r.id)}
              onToggle={() => toggle(r.id)}
            >
              <Field label="Perfis abrangidos" value={r.profiles.join(", ")} />
              <Field label="Quando acontece" value={r.trigger} />
              <ListField label="Condições" values={r.conditions} />
              <ListField label="Comportamento" values={r.behaviour} />
              <Field label="Resultado" value={r.result} />
              <ListField label="Exceções" values={r.exceptions} />
              <ListField label="Dados envolvidos" values={r.data} />
              <Field label="Visibilidade" value={r.visibility} />
              <Field label="Auditoria" value={r.audit} />
              <Field label="Notificações" value={r.notifications} />
              <Field label="Notas técnicas" value={r.technical} />
              <Field label="Área funcional" value={specArea(r)} />
              <Field
                label="Verificação"
                value={
                  check(r.id)
                    ? `${check(r.id)!.status} · ${check(r.id)!.method} · ${check(r.id)!.checkedAt}` +
                      (check(r.id)!.issues.length ? `\n${check(r.id)!.issues.join("\n")}` : "")
                    : "—"
                }
              />
            </Card>
          ))}
        </div>
      </Section>

      <Section
        id="automacoes"
        title={`Automações (${automations.length})`}
        description="Fluxos automáticos, passo a passo, com alternativas quando falham."
      >
        <div className="grid gap-3">
          {automations.length === 0 && (
            <p className="panel p-4 text-sm text-muted-foreground">Sem automações para os filtros escolhidos.</p>
          )}
          {automations.map((a) => (
            <Card
              key={a.id}
              title={`${a.id} · ${a.name}`}
              subtitle={a.trigger}
              badges={
                <>
                  <span className="text-[11px] text-muted-foreground">{specArea(a)}</span>
                  <VerificationChip
                    status={needsReview(a.id, a.needsValidation) ? "Necessita revisão" : "Verificada"}
                    date={check(a.id)?.checkedAt}
                  />
                </>
              }
              open={openIds.has(a.id)}
              onToggle={() => toggle(a.id)}
            >
              <Field label="Perfis abrangidos" value={a.profiles.join(", ")} />
              <ListField label="Condições" values={a.conditions} />
              <ListField label="Passos" values={a.steps} />
              <Field label="Resultado" value={a.result} />
              <ListField label="Exceções" values={a.exceptions} />
              <Field label="Alternativa quando falha" value={a.fallback} />
              <ListField label="Dados envolvidos" values={a.data} />
              <Field label="Auditoria" value={a.audit} />
              <Field label="Notificações" value={a.notifications} />
            </Card>
          ))}
        </div>
      </Section>

      <Section
        id="validacoes"
        title={`Validações e mensagens (${validations.length})`}
        description="Campos obrigatórios, regras de gravação e o texto exato apresentado."
      >
        <Table
          head={["ID", "Área", "Campo", "Regra", "Mensagem", "Onde é garantida"]}
          rows={validations.map((v) => [v.id, v.area, v.field, v.rule, v.message, v.enforcedIn])}
        />
      </Section>

      <Section
        id="visibilidade"
        title="Matriz de visibilidade"
        description="Quem vê o quê, por perfil."
      >
        <Table
          head={["Área", "Informação", "Proprietário", "Gestor", "Assistente", "Administrador", "Motorista", "Nota"]}
          rows={SPEC_VISIBILITY.filter((v) =>
            matches(search, v.area, v.information, v.owner, v.manager, v.assistant, v.administrator, v.driver, v.note),
          ).map((v) => [v.area, v.information, v.owner, v.manager, v.assistant, v.administrator, v.driver, v.note])}
        />
      </Section>

      <Section id="notificacoes" title="Notificações" description="Que evento gera que aviso e para quem.">
        <Table
          head={["ID", "Evento", "Recebem", "Não recebem", "Título", "Conteúdo", "Ação"]}
          rows={SPEC_NOTIFICATIONS.filter((n) => matches(search, n.id, n.event, n.recipients, n.title, n.content)).map(
            (n) => [n.id, n.event, n.recipients, n.excluded, n.title, n.content, n.action],
          )}
        />
      </Section>

      <Section id="auditoria" title="Auditoria" description="Ações registadas e informação guardada.">
        <Table
          head={["Ação", "Entidade", "Quando é registada", "O que guarda"]}
          rows={SPEC_AUDIT.filter((a) => matches(search, a.action, a.entity, a.trigger, a.fields)).map((a) => [
            a.action,
            a.entity,
            a.trigger,
            a.fields,
          ])}
        />
      </Section>

      <Section
        id="entidades"
        title="Entidades e dados"
        description="Modelo de dados, relações e regras de retenção."
      >
        <Table
          head={["Entidade", "Tabela", "Objetivo", "Campos principais", "Relações", "Retenção"]}
          rows={SPEC_ENTITIES.filter((e) => matches(search, e.name, e.table, e.purpose, e.fields, e.relations)).map(
            (e) => [e.name, e.table, e.purpose, e.fields.join(", "), e.relations.join("\n"), e.retention],
          )}
        />
      </Section>

      <Section
        id="django"
        title="Notas para implementação em Django"
        description="Que lógica tem de viver obrigatoriamente no servidor."
      >
        <Table
          head={["Área", "Entidades", "Lógica no servidor", "Notas"]}
          rows={SPEC_DJANGO.filter((d) => matches(search, d.area, d.entities, d.notes)).map((d) => [
            d.area,
            d.entities,
            d.serverSide,
            d.notes,
          ])}
        />
      </Section>

      <Section
        id="historico"
        title="Histórico de alterações"
        description="Registo das mudanças funcionais documentadas: o que mudou, antes e depois."
      >
        <Table
          head={["Data", "Categoria", "Regra", "Alteração", "Antes", "Depois", "Autor"]}
          rows={SPEC_CHANGES.map((c) => [c.date, c.category, c.rule, c.what, c.before, c.after, c.author])}
        />
      </Section>
    </div>
  );
}
