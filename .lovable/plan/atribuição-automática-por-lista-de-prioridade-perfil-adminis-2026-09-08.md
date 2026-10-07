# Atribuição automática por lista de prioridade, perfil Administrador e fim das delegações

## Situação atual (verificada)

- 4 perfis (`owner`, `manager`, `assistant`, `driver`) no enum `app_role`; a app lê o perfil em `src/lib/auth.tsx` e ramifica em `app.tsx`, `AppShell.tsx`, `admin.tsx`, `analytics.tsx`.
- Assistente → motoristas: tabela `assistant_driver_assignments` (5 ligações ativas, sem ordem; `UNIQUE (assistant_id, driver_id)`). Usada pelas funções `assistant_assigned_driver`, `driver_audience`, pelas políticas de `activities`/`drivers`/`time_off`/`unavailability` e pela ficha de utilizador (`UserEditDialog.tsx`), `ManagerDashboard.tsx` (filtro) e `OwnerDashboard`.
- Serviços: `activities.driver_id` é obrigatório; a assistente escolhe o motorista no `ActivityDialog`. Disponibilidade calculada em `scheduling.ts` (`evaluateAvailability`) no cliente e garantida na base pelo trigger `check_activity_conflicts` (serviços sobrepostos, ausências, indisponibilidades, com ocupação = serviço ± deslocação da cidade).
- Notificações: função `notify` + triggers (`activities_after`, `create_city_pending`); sino com contador no `AppShell`.
- Delegações: tabela `assistant_delegations`, `DelegationDialog`, separador em Administração e visibilidade nas políticas.

## Decisões acordadas

- Administrador: vê o mesmo tipo de informação que a assistente e pode criar/alterar serviços; não gere utilizadores, prioridades, cidades, análises nem administração. Assunção: vê todos os serviços da frota (escolhe o motorista manualmente ao criar, como Owner/Gestor). Se preferir que veja só os serviços que ele próprio criou, é um ajuste de uma linha na política de leitura.
- Assistente edita horário/cidade → a atribuição volta a correr (mantém o motorista se continuar disponível; senão o próximo da lista; sem ninguém → pendente).
- Delegações deixam de existir: a assistente só vê os serviços que ela pediu, com o motorista atribuído. A tabela antiga é mantida (histórico), mas sai da interface e das regras de acesso.
- Owner/Gestor continuam a criar serviços com escolha manual do motorista (gravado como atribuição manual).

## O que muda para cada perfil

- Owner / Gestor: novo separador "Prioridades" em Administração (lista ordenada por assistente, arrastar/setas, número da posição); painel "Atribuição manual pendente" na Agenda; diálogo de atribuição manual; recebem a notificação.
- Assistente: "Novo serviço" sem campo de motorista; o calendário mostra apenas os seus serviços, em faixas por motorista, mais uma faixa "Por atribuir"; cada bloco indica o motorista ou "Por atribuir". Sem cartões de motoristas, sem ausências/indisponibilidades de terceiros, sem delegações.
- Administrador: Agenda com a visão de operações (calendário, criar/editar serviços, encontrar motorista); sem Análises/Administração.
- Motorista: sem alterações visíveis; serviços aparecem/desaparecem do calendário conforme a atribuição.

## Fluxo automático

```text
Assistente grava serviço
  -> função na base (transação única, bloqueio por motorista)
  -> lista de prioridade da assistente, por ordem
  -> para cada motorista: disponível para toda a ocupação (serviço + deslocação)?
       sim -> atribui, estado "automático", notifica o motorista, termina
       não -> regista motivo e continua
  -> nenhum disponível (ou lista vazia) -> serviço fica "Por atribuir",
     notifica Owner e Gestor com título, data, hora, assistente e motivo
Owner/Gestor abre o serviço -> vê motivo e motoristas tentados -> escolhe um
  disponível -> estado "manual", notifica motorista, pendência desaparece
```

Alterar a ordem ou remover um motorista da lista só afeta serviços futuros. Reatribuições manuais nunca são revertidas pela lista.

## Detalhes técnicos

### Base de dados (uma migração, sem apagar dados)

- `app_role`: novo valor `administrator`; função `is_administrator()`.
- `assistant_driver_assignments`: nova coluna `priority integer`; `UNIQUE (assistant_id, priority) DEFERRABLE INITIALLY DEFERRED`; preenchimento inicial das ligações ativas por `created_at`, nome do motorista (1..n). RPC `set_assistant_priorities(_assistant_id, _driver_ids uuid[])` (Owner/Gestor) reescreve a ordem numa transação; políticas de escrita apenas Owner/Gestor, leitura Owner/Gestor/Administrador/a própria assistente.
- `activities`: `driver_id` passa a permitir vazio; novas colunas `assistant_id` (FK `assistants`, backfill via `created_by` → `assistants.user_id`), `assignment_status` enum (`automatic`, `manual`, `pending_manual`; existentes = `manual`), `assignment_attempts jsonb` (motoristas considerados e motivo), `assigned_at`.
- Nova função `driver_is_available(_driver_id, _start, _end, _ignore_activity)` com exatamente a mesma lógica do trigger `check_activity_conflicts` (o trigger passa a usá-la; continua a bloquear gravações inválidas e a respeitar `override_conflict`).
- RPCs `SECURITY DEFINER`: `create_service_auto(...)` (assistente), `update_service_auto(...)` (assistente; reavalia atribuição), `assign_service_driver(_activity_id, _driver_id, _override)` (Owner/Gestor; grava `manual`). Usam `pg_advisory_xact_lock` por motorista para impedir dupla atribuição em criações simultâneas.
- Triggers ajustados a `driver_id` nulo (`activities_after`, `activities_driver_adjust_guard`, `check_activity_conflicts`); `activities_after` notifica o motorista na atribuição/reatribuição, o anterior na transferência, e a assistente requerente nas alterações. Nova notificação `kind='assignment_pending'`, `entity_type='activity'`, para todos os Owners e Gestores.
- Políticas: `activities` leitura = Owner/Gestor/Administrador ou `assistant_id = my_assistant_id()` ou `driver_id = my_driver_id()`; escrita direta = Owner/Gestor/Administrador (assistente só via RPC; motorista mantém ajuste de ocupação). `drivers` leitura para assistentes e administradores (nomes). `time_off`/`unavailability`: assistentes deixam de ver/gerir. `driver_audience`, `can_view_driver`, `can_manage_driver_schedule` deixam de depender de delegações/atribuições de assistente. Políticas de `assistant_delegations` reduzidas a leitura do Owner. `assistants`/`profiles` legíveis pelo Administrador (nomes).

### Aplicação

- `auth.tsx`, `team.ts`, `UserEditDialog.tsx`, `UsersPanel.tsx`: perfil "Administrador"; sem ficha associada.
- `app.tsx`/`AppShell.tsx`/`analytics.tsx`/`admin.tsx`: Administrador → `ManagerDashboard` (Agenda apenas); Owner/Gestor → separador "Prioridades"; separador "Delegações" removido.
- Novo `components/admin/PriorityListsPanel.tsx` (por assistente: lista ordenada com arrastar via `@dnd-kit/sortable` e botões subir/descer, adicionar/remover motorista, posição visível). A secção "Motoristas que gere" da ficha do assistente passa a mostrar/editar a mesma lista ordenada; a secção do motorista mostra em que listas está e em que posição (só leitura).
- `data.ts`: `useSetAssistantPriorities`, `useCreateServiceAuto`, `useUpdateServiceAuto`, `useAssignServiceDriver`, `usePendingAssignments`; remoção dos hooks de delegações/atribuição antiga; tipos com `driver_id: string | null`.
- `ActivityDialog.tsx`: modo `requester` (assistente) sem seleção de motorista, com bloco "Motorista: X (automático/manual) / Por atribuir"; modos Owner/Gestor/Administrador mantêm a escolha manual e mostram assistente requerente e tipo de atribuição.
- Novo `ManualAssignDialog.tsx`: detalhes do serviço, motivo, motoristas tentados (indisponíveis, com motivo), motoristas disponíveis com o `DriverStatusBadge` existente, gravação; reutiliza `evaluateAvailability`.
- `AssistantDashboard.tsx`: só os seus serviços; faixa "Por atribuir" (pseudo-motorista) no `WeekCalendar`; remoção de cartões de motoristas, ausências, indisponibilidades, conflitos e delegações; `DelegationDialog.tsx` deixa de ser usado.
- `ManagerDashboard.tsx`: painel "Atribuição manual pendente", filtro por assistente via `activities.assistant_id`, calendário e pesquisa tolerantes a serviço sem motorista.
- `WeekCalendar.tsx`: bloco mostra motorista quando pedido; suporte a faixa de pendentes. `DriverDashboard.tsx`, `OwnerDashboard.tsx`, `FindDriverDialog.tsx`, `analytics.tsx`: ajustes a `driver_id` nulo.
- Sino de notificações: notificações de pendência com ligação "Atribuir motorista" (abre o diálogo na Agenda); contador atual mantido.
- Texto novo todo em PT-PT ("Por atribuir", "Atribuição manual necessária", "Automática", "Manual", "Lista de prioridade").

### Verificação

- Assistente com lista: cria serviço → motorista nº1 disponível atribuído; com nº1 de férias → nº2; calendário do motorista e da assistente atualizados; notificação ao motorista.
- Lista vazia ou todos indisponíveis → "Por atribuir", notificação a Owner e Gestor, atribuição manual pelo Gestor remove a pendência e notifica o motorista.
- Reatribuição manual: serviço sai do calendário do antigo e entra no novo, sem duplicados.
- Reordenar lista não altera serviços existentes.
- Administrador: acede à Agenda, cria/edita serviços, não vê Análises/Administração nem consegue alterar prioridades/utilizadores (também por política na base).
- Criações simultâneas: teste com duas chamadas em paralelo à RPC para o mesmo horário → motoristas distintos.
