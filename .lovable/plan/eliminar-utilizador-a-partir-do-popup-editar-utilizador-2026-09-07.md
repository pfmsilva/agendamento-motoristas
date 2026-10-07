# Eliminar utilizador a partir do popup "Editar utilizador"

## O que se passa hoje

O popup "Editar utilizador" não tem nenhuma opção de eliminação — só existe "Eliminar" na lista, e apenas para contas pendentes. Além disso, a função de servidor atual (`deletePendingAccount`) recusa apagar contas que já tenham perfil atribuído, e a base de dados bloqueia a eliminação de contas com registos associados (serviços criados, férias aprovadas, etc.).

## O que vou fazer

- **Nova opção no popup**: no fundo do "Editar utilizador", uma secção separada por linha, com o botão **"Eliminar utilizador"** a vermelho (estilo discreto `ghost`/texto vermelho destrutivo — não parece um botão de Guardar/Editar).
- **Confirmação**: ao clicar abre o segundo popup "Tem a certeza de que pretende eliminar este utilizador?" com **Cancelar** e **Eliminar utilizador** (botão vermelho sólido, o mesmo padrão `AlertDialog` já usado na lista de pedidos pendentes).
- **Eliminação real no servidor**: remove a conta de acesso, o perfil, as permissões e as notificações. As referências ao utilizador em registos históricos (serviços, férias, indisponibilidades, delegações) ficam anuladas — o histórico mantém-se. A ficha de motorista/assistente associada NÃO é apagada: fica "sem conta" e o histórico de serviços preserva-se.
- **Resultado**: o popup fecha, a lista atualiza de imediato e o utilizador não reaparece após recarregar.
- **Falhas**: mensagem clara em PT-PT e o utilizador mantém-se na lista.
- **Proteções (verificadas no servidor, não apenas escondendo o botão)**:
  - Só o Proprietário pode eliminar.
  - Ninguém pode eliminar a própria conta.
  - O último Proprietário continua protegido (regra já existente na base de dados).
- **Fichas sem conta** (motorista/assistente sem login): a mesma opção elimina a ficha; se a ficha tiver histórico de serviços, a eliminação é recusada com a indicação de a desativar em vez de eliminar.
- O botão "Eliminar" da lista de contas pendentes mantém-se como está.

## Detalhes técnicos

- `src/lib/admin.functions.ts`: nova `deleteUserAccount` (`createServerFn` + `requireSupabaseAuth` + Zod). Verifica `has_role(owner)` e não-autoeliminação via `context.supabase`; depois, via `supabaseAdmin`: anula `activities.created_by/updated_by`, `time_off.requested_by/approved_by`, `unavailability.created_by`, `assistant_delegations.created_by`, `drivers.user_id`, `assistants.user_id` (preserva fichas e histórico) e apaga `notifications`; por fim `auth.admin.deleteUser` (cascata trata de `profiles` e `user_roles`). O trigger `protect_last_owner` bloqueia a eliminação do último Proprietário — erro convertido por `errorMessagePt`.
- `src/lib/admin.functions.ts`: nova `deleteUnlinkedRecord` para fichas sem conta (`kind: "driver" | "assistant"`): recusa se existirem atividades/serviços associados ("desative em vez de eliminar"), senão apaga a ficha. Permissões: Proprietário ou Gestor, coerente com `drivers`/`assistants`.
- `src/lib/data.ts`: hooks `useDeleteUserAccount()` e `useDeleteUnlinkedRecord()` invalidando `profiles`, `user_roles`, `drivers`, `assistants`.
- `src/components/admin/UserEditDialog.tsx`: secção final "Zona de perigo" (separada por `border-t`) com texto explicativo e botão `variant="ghost" className="text-destructive hover:text-destructive"`; `AlertDialog` de confirmação com botão de ação em `bg-destructive`; em sucesso fecha o popup e mostra toast; em erro, toast PT-PT e nada muda. Botão escondido para `isSelf`.
- Sem migração de base de dados — a eliminação passa pelo cliente privilegiado no servidor.
