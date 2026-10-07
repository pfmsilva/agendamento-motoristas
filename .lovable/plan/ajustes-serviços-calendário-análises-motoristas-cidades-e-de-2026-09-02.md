# Ajustes: serviços, calendário, análises, motoristas, cidades e delegações

## 1. Novo serviço — campos removidos

- Remover do formulário os campos "Tipo de atividade" e "Passageiro / executivo".
- Na gravação, o tipo passa a ser sempre o valor por omissão (`trip`) e o passageiro fica vazio — sem alterações de base de dados, para não perder o histórico já registado.
- Remover o passageiro dos sítios onde era mostrado/pesquisado (cartão do motorista, pesquisa do gestor). O histórico antigo continua legível na Auditoria.

## 2. Calendário — deslocação mais sólida

- Manter exatamente a cor do serviço.
- Aumentar a densidade do bloco de deslocação (mistura da cor do motorista de 42% para ~68% de cor), com texto escuro legível e uma linha de separação subtil face ao serviço.
- Ajustar apenas o estilo da deslocação; ajuste do motorista e indisponibilidade ficam como estão, mantendo a hierarquia visual serviço → deslocação → ajuste.

## 3. Análises — área de reporting completa

Reestruturar a página em quatro blocos, com um cabeçalho de filtros comum.

**Filtros (aplicados a tudo):** período (esta semana / mês / trimestre / ano / últimos 90 dias / personalizado), motorista, assistente, cidade, tipo de serviço, incluir ou excluir cancelados, e comparação com o período anterior.

**Resumo:** cartões com serviços, horas de serviço, horas de deslocação, ocupação total, utilização %, média por motorista, taxa de cancelamento, conflitos forçados, dias de ausência e horas de indisponibilidade — cada um com variação face ao período anterior.

**Tendências:** evolução de serviços e horas ao longo do tempo (dia/semana/mês, automático conforme o período), com a linha do período anterior sobreposta; distribuição por dia da semana e por hora de início (mapa de calor) para perceber picos.

**Motoristas:** tabela ordenável com serviços, horas de serviço, horas de deslocação, ocupação, média por serviço, dias trabalhados, ausências, indisponibilidade, utilização % e ajustes feitos; gráfico de horas por motorista e ranking de utilização. Exportação CSV.

**Cidades e serviços:** serviços e horas por cidade, peso da deslocação por cidade (tempo em estrada vs. tempo de serviço), top destinos, e mix de serviços por estado. Tabela por cidade com exportação CSV.

**Delegações e assistentes:** volume de serviços e horas por assistente (pool de motoristas atribuídos), delegações ativas/expiradas no período e motoristas cobertos.

Tudo calculado a partir dos dados já carregados; os cálculos ficam em `src/lib/analytics.ts` com testes de sanidade manuais nos fluxos principais.

## 4. Motoristas — edição e desativação

- A paleta de cores deixa de estar aberta em cada linha da listagem. Cada motorista passa a ter um botão "Editar" que abre um diálogo com: nome, cor, assistente(s) atribuído(s), estado ativo/inativo e restantes dados do perfil.
- Remover o campo "Código" (formulário de criação e listagem). A coluna fica na base de dados para não perder histórico, mas deixa de ser usada na aplicação.
- "Eliminar" passa a ser desativação (soft delete): o motorista é marcado como inativo, deixa de aparecer para novos serviços, atribuições e pesquisas de disponibilidade, mas mantém-se visível — marcado como inativo — em calendários, análises e histórico, para todos os perfis. Nenhum serviço, deslocação ou registo é apagado.
- Confirmação explícita antes de desativar, indicando quantos serviços históricos ficam preservados, e possibilidade de reativar.

## 5. Cidades — Lisboa

- Manter o comportamento atual de Lisboa; corrigir apenas o alinhamento do texto na lista de cidades, para que nome, etiquetas e campos fiquem alinhados à esquerda e consistentes com as restantes linhas.

## 6. Delegações do Owner

- Painel de delegações reescrito para gestão completa pelo Owner: criar delegação escolhendo a pessoa (assistente) e um ou mais motoristas de uma só vez, com período de início e fim.
- Lista agrupada por pessoa, mostrando a que motoristas tem acesso e em que período, com estados ativa / expirada / revogada.
- Editar uma delegação existente (motorista, período, ativa/inativa) e revogar.
- Os acessos continuam a ser aplicados na base de dados: um assistente só vê e edita os motoristas que lhe estão atribuídos ou delegados dentro do período. Sem delegação válida, os dados não ficam acessíveis por nenhuma página, filtro ou URL.

## Notas técnicas

- Sem migração destrutiva: `employee_code` e `passenger` mantêm-se na base de dados; a desativação de motoristas usa a coluna `active` já existente.
- Verificar as políticas atuais de `assistant_delegations` para confirmar que o Owner pode criar/editar delegações de qualquer assistente; se faltar cobertura, é adicionada uma migração apenas de políticas.
- Ficheiros principais: `src/components/ActivityDialog.tsx`, `src/lib/scheduling.ts` (estilo da deslocação), `src/lib/analytics.ts` e `src/components/dashboards/OwnerDashboard.tsx`, `src/routes/_authenticated/admin.tsx` (motoristas, cidades, delegações), `src/lib/data.ts` (filtros de motoristas ativos).

## Testes após implementação

Criar serviço sem os campos removidos; ver o bloco de deslocação no calendário; percorrer os filtros e exportações das Análises; editar e desativar um motorista confirmando que o histórico se mantém; criar/editar/revogar uma delegação e confirmar, com sessão de assistente, que só vê os motoristas permitidos.
