# Eliminar pedidos de acesso pendentes

## O que se passa hoje

Na Administração → Utilizadores, a secção "Contas pendentes de perfil" só tem o botão **Editar**. Não existe nenhuma ação de eliminar — por isso nada acontece e o pedido continua na lista.

Além disso, mesmo que se acrescentasse um botão, a base de dados não permite apagar contas a partir do navegador: a tabela de perfis está protegida contra eliminação e a conta de acesso em si só pode ser removida do lado do servidor. Uma solução só visual faria o pedido reaparecer ao atualizar a página.

## O que vou fazer

- Acrescentar um botão **Eliminar** em cada pedido pendente (mesmo estilo dos restantes botões da página).
- Ao clicar, aparece uma confirmação: "Tem a certeza de que pretende eliminar este pedido?" com **Cancelar** e **Eliminar**, avisando que a ação é definitiva.
- Ao confirmar, a conta é realmente removida no servidor: perfil, permissões e a própria conta de acesso. A lista atualiza-se de imediato e o pedido não volta a aparecer depois de recarregar.
- Se falhar, mostro uma mensagem clara em português e o pedido mantém-se na lista.
- Só o Proprietário pode eliminar; a verificação é feita no servidor, não apenas escondendo o botão.
- Segurança: só é possível eliminar pedidos ainda sem perfil atribuído e nunca a própria conta. Contas já com perfil (e portanto com histórico) continuam a usar apenas desativar.
- Aprovar, editar e desativar mantêm-se exatamente como estão.

## Detalhes técnicos

- Novo `src/lib/admin.functions.ts` com `deletePendingAccount` (`createServerFn`, `.middleware([requireSupabaseAuth])`, validação Zod do `userId`).
- Handler: confirma via `context.supabase` que quem chama tem `user_roles.role = 'owner'`; recusa se `userId === context.userId`; confirma que o alvo não tem linha em `user_roles` (é mesmo um pedido pendente). Só depois faz `await import("@/integrations/supabase/client.server")` e chama `supabaseAdmin.auth.admin.deleteUser(userId)`, deixando o `profiles` cair por `ON DELETE CASCADE` de `profiles.id → auth.users.id` (removo explicitamente linhas residuais de `notifications` se necessário; `drivers.user_id`/`assistants.user_id` ficam a `null` por FK, preservando o histórico).
- Sem migração: nenhuma política nova é necessária porque a eliminação passa pelo cliente privilegiado no servidor.
- `src/lib/data.ts`: hook `useDeletePendingAccount()` com `useServerFn`, invalidando `profiles`, `user_roles`, `drivers`, `assistants`.
- `src/components/admin/UsersPanel.tsx`: botão "Eliminar" apenas nas linhas pendentes + `AlertDialog` (shadcn) de confirmação, `toast` de sucesso/erro via `errorMessagePt`.
- `src/start.ts` já regista `attachSupabaseAuth`, portanto o token é enviado automaticamente.
