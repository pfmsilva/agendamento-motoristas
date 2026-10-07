# Perfis de utilizador geridos pelo Proprietário

Hoje uma conta nova fica sem perfil e não existe nenhum ecrã onde o Proprietário possa atribuir perfis — as funções de leitura e escrita de perfis existem no código mas nunca são usadas, e as regras da base de dados só permitem ao Gestor mexer em perfis (o Proprietário não). Este plano fecha esse circuito.

## O que passa a existir

**Novo separador "Utilizadores" na Administração (só Proprietário)**

- Lista de todas as contas: nome, email, perfil atual, ficha ligada (motorista/assistente) e estado ativo/inativo.
- Destaque no topo para as **contas pendentes** (sem perfil atribuído), com contador.
- Para cada pessoa, o Proprietário escolhe o perfil: Proprietário, Gestor, Assistente ou Motorista — e pode alterá-lo mais tarde.
- Ao escolher Motorista ou Assistente, no mesmo painel escolhe-se a ficha correspondente: ligar a uma ficha existente ou criar uma nova com o nome da pessoa. A conta fica ligada a essa ficha.
- Ao mudar de perfil, a ligação antiga é desfeita (a ficha mantém-se, com todo o histórico).
- Proteção: o Proprietário não se pode despromover a si próprio nem remover o último Proprietário.
- Poder desativar/reativar o acesso de uma conta.

**Conta pendente**

- Quem entra sem perfil vê um ecrã dedicado "Conta pendente de aprovação", sem navegação para Agenda, Análises ou Administração.
- Todos os Proprietários recebem uma notificação quando uma conta nova fica pendente.

**Permissões efetivas por perfil (aplicadas na aplicação e na base de dados)**

- Proprietário: acesso total, incluindo Utilizadores, Atribuições, Delegações e Auditoria.
- Gestor: Agenda, Análises e Administração limitada a Pessoas e Cidades/deslocações (como hoje); sem Utilizadores, Delegações nem Auditoria.
- Assistente: Agenda dos motoristas atribuídos/delegados.
- Motorista: apenas a sua própria informação.

## Notas técnicas

Migração (uma só):

- Políticas de `user_roles`: substituir as políticas de inserção/atualização/eliminação de `is_manager()` por `is_owner()`, para que a atribuição de perfis seja exclusiva do Proprietário. Leitura mantém-se (próprio + `is_admin_view()`).
- Política de atualização de `profiles`: trocar `is_manager()` por `is_owner()` na parte administrativa (o próprio continua a poder atualizar-se).
- Salvaguarda em trigger sobre `user_roles`: impedir remover/alterar o último papel `owner`.
- Trigger de notificação: ao criar um perfil sem papel, notificar todos os utilizadores com papel `owner` ("Nova conta pendente de perfil").
- Permitir ao Proprietário definir `drivers.user_id` e `assistants.user_id` (as políticas de escrita atuais dessas tabelas já cobrem `is_owner()`; confirmar e ajustar se necessário).

Frontend:

- `src/lib/data.ts`: reutilizar `useProfiles`, `useUserRoles`, `useSetUserRole`, `useSetProfileActive`; acrescentar mutação que liga/desliga a conta à ficha de motorista/assistente na mesma operação.
- Novo `src/components/admin/UsersPanel.tsx` com a lista, secção de pendentes e o seletor de perfil + ficha.
- `src/routes/_authenticated/admin.tsx`: novo separador "Utilizadores" visível apenas ao Proprietário; manter Pessoas e Cidades para o Gestor.
- `src/routes/_authenticated/route.tsx` ou `AppShell`: encaminhar contas sem perfil para o ecrã de pendente; `analytics` e `admin` já bloqueiam por perfil e mantêm-se.
- `src/lib/auth.tsx` mantém o carregamento do papel; o ecrã pendente reage a `role === null`.

Sem perda de dados: nenhuma ficha, serviço ou histórico é apagado em qualquer destas alterações.
