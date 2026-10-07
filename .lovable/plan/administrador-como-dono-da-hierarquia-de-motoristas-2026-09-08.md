# Administrador como dono da hierarquia de motoristas

A hierarquia de motoristas deixa de pertencer ao assistente e passa a pertencer ao Administrador. O assistente serve um ou mais Administradores e herda a hierarquia do Administrador escolhido.

## Situação atual (verificada)

- Perfis existentes: Proprietário, Gestor, Administrador, Assistente, Motorista. Só existe uma conta Administrador ("Administrator Demo").
- Existem fichas para motoristas e assistentes, mas **não existe ficha de Administrador** - é apenas um perfil de conta.
- A lista de prioridade está hoje ligada ao assistente (`assistant_driver_assignments`) e é usada na atribuição automática, nas listas de Administração → Prioridades e na ficha do utilizador.
- Cada serviço guarda o assistente requerente, o motorista e se a atribuição foi automática ou manual; não guarda Administrador.

## Decisões acordadas

- Cada assistente com lista atual dá origem a um novo Administrador que herda essa lista, para não se perder nada.
- A ficha de Administrador é independente da conta: pode existir sem utilizador e ser ligada mais tarde.
- As delegações têm data de início e fim; terminada a data, o assistente deixa de poder criar serviços para esse Administrador (os serviços já criados mantêm-se intactos).

## O que passa a acontecer

- **Proprietário / Gestor**: em Administração passam a gerir Administradores (criar, editar, ativar/desativar), a hierarquia de motoristas de cada Administrador (adicionar, remover, reordenar, com a posição visível) e a ligação dos assistentes a Administradores (o principal e as delegações com datas). O mesmo motorista pode estar em várias hierarquias.
- **Assistente**: cria serviços sem escolher motorista. Se serve só um Administrador, o serviço fica automaticamente desse Administrador. Se serve mais do que um (por delegação ativa), aparece no formulário um campo "Serviço para" com a lista de Administradores. Vê os serviços dos Administradores que serve, com Administrador, motorista e tipo de atribuição.
- **Administrador**: volta a poder criar serviços, mas apenas para o seu próprio contexto - sem campo de escolha de Administrador. Vê os seus serviços e os motoristas atribuídos. Continua sem gerir hierarquias, utilizadores, assistentes, motoristas, atribuições manuais, análises ou administração.
- **Motorista**: no calendário e na ficha de cada serviço passa a ver o Administrador a que o serviço pertence e o assistente que o pediu.
- **Atribuição automática**: percorre a hierarquia do Administrador do serviço e atribui o primeiro motorista livre para toda a ocupação. Sem ninguém livre, fica "Por atribuir" e o Proprietário e o Gestor são avisados, podendo atribuir manualmente qualquer motorista disponível; o serviço mantém o Administrador original.
- Reordenar uma hierarquia só afeta serviços futuros; nenhum serviço existente é reatribuído.

## Detalhes técnicos

### Base de dados (uma migração, sem perder dados)

- Nova tabela `administrators` (`name`, `user_id` opcional, `active`, timestamps) com GRANTs, RLS (leitura para autenticados; escrita Proprietário/Gestor), auditoria e `touch_updated_at`. Cria-se uma ficha para a conta Administrador existente.
- Nova tabela `administrator_driver_priorities` (`administrator_id`, `driver_id`, `priority`, `active`, timestamps), `UNIQUE (administrator_id, driver_id)`. Escrita Proprietário/Gestor; leitura para Proprietário/Gestor, o próprio Administrador e assistentes ligados.
- Nova tabela `assistant_administrators` (`assistant_id`, `administrator_id`, `relationship_type` enum `primary|delegated`, `start_date`, `end_date` nulos para o principal, `active`). Um único principal por assistente (índice parcial único). Escrita Proprietário/Gestor.
- Migração de dados: para cada assistente com lista, cria-se `administrators` com o nome "Administração - <assistente>", copia-se a lista para `administrator_driver_priorities` pela ordem atual e cria-se a ligação `primary`. `assistant_driver_assignments` fica só como histórico (sai da interface e da lógica).
- `activities` ganha `administrator_id` (FK, nulo permitido para o histórico); preenchimento retroativo a partir do assistente requerente quando existir. Novos serviços exigem-no.
- Funções: `my_administrator_id()`, `assistant_administrators(_assistant_id)` (só ligações ativas dentro das datas), `pick_driver_by_priority` passa a receber `_administrator_id` e a ler `administrator_driver_priorities`; `set_administrator_priorities(_administrator_id, _driver_ids[])` substitui `set_assistant_priorities`.
- RPCs: `create_service_auto` e `update_service_auto` passam a aceitar `_administrator_id`, validando que quem chama é o próprio Administrador ou um assistente com ligação ativa a esse Administrador; `assign_service_driver` mantém-se para Proprietário/Gestor e não altera o Administrador do serviço.
- Políticas de `activities`: leitura para Proprietário/Gestor, o motorista do serviço, o Administrador do serviço e assistentes com ligação ativa a esse Administrador; criação/edição via RPC para Administrador e assistentes; escrita direta Proprietário/Gestor. `can_edit_activities()` mantém-se Proprietário/Gestor; o Administrador cria apenas pela RPC.
- Notificações de "atribuição manual necessária" passam a indicar o Administrador.

### Aplicação

- `src/lib/data.ts`: hooks `useAdministrators`, `useAdministratorPriorities`, `useSetAdministratorPriorities`, `useAssistantAdministrators` e mutações de ligação/delegação; `useCreateServiceAuto`/`useUpdateServiceAuto` passam a enviar o Administrador; remoção dos hooks da lista por assistente.
- `PriorityListEditor` passa a receber `administratorId`; `PriorityListsPanel` passa a listar Administradores. Novo painel de Administradores (fichas + assistentes ligados + delegações com datas) em Administração, seguindo os padrões existentes.
- `UserEditDialog`: perfil Administrador mostra a sua hierarquia (só leitura para o próprio, editável por Proprietário/Gestor); perfil Assistente mostra o Administrador principal e as delegações em vez da lista de motoristas.
- `ActivityDialog`: campo "Serviço para" visível apenas ao assistente com mais do que um Administrador ativo; oculto para Administrador e para assistente com um só. A hierarquia usada nas verificações passa a ser a do Administrador escolhido.
- `AssistantDashboard`: serviços dos Administradores servidos, com o Administrador visível em cada bloco/ficha. `ManagerDashboard`: filtro por Administrador e Administrador visível no painel de pendentes; para o perfil Administrador volta o botão "Novo serviço" (contexto próprio), sem atribuição manual. `DriverDashboard` e `ServiceViewDialog`: mostram Administrador e assistente requerente.
- Texto novo em PT-PT ("Administrador", "Serviço para", "Hierarquia de motoristas", "Delegação temporária").

### Verificação

- Criar dois Administradores com hierarquias diferentes e o mesmo motorista em ambas.
- Assistente com um Administrador: cria serviço sem campo extra e recebe o primeiro motorista livre da hierarquia certa.
- Assistente com delegação ativa: aparece o campo, e cada escolha usa a hierarquia correspondente.
- Fim da delegação: deixa de poder criar para esse Administrador; serviços antigos mantêm-se.
- Administrador: cria serviço sem campo de Administrador, não acede a Administração/Análises nem à atribuição manual.
- Motorista com serviços de Administradores diferentes distingue-os no calendário.
- Reordenar hierarquia não altera serviços existentes.
