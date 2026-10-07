# Entrada imediata após criar conta (sem confirmação de email)

## Objetivo

Criar conta com email + palavra-passe passa a dar acesso imediato à aplicação, sem email de confirmação e sem qualquer bloqueio por email não confirmado.

## Alterações

1. **Configuração de autenticação (backend)**
   - Ativar a confirmação automática de email, de modo que o registo devolva de imediato uma sessão válida.
   - Manter ativos: entrada com email/palavra-passe, entrada com Google (sem alterações) e recuperação de palavra-passe por email.

2. **Ecrã de autenticação (`src/routes/auth.tsx`)**
   - Após criar a conta, encaminhar diretamente para a aplicação.
   - Remover a mensagem "Confirme o email para poder entrar" e o texto de aviso sobre email de confirmação.
   - Manter a nota de que o perfil (permissões) é atribuído pelo Proprietário — isso continua a ser o que determina o acesso às funcionalidades, não o email.

3. **Mensagens de erro (`src/lib/errors.ts`)**
   - Retirar a regra "email not confirmed", que deixa de se aplicar. As restantes mensagens PT-PT mantêm-se.

## Notas técnicas

- `supabase.auth.signUp` passará a devolver sessão; o caminho "sem sessão" deixa de existir na prática, mas mantém-se um fallback silencioso que tenta a entrada imediata caso a sessão não venha.
- Sem alterações ao fluxo `lovable.auth.signInWithOAuth("google", …)` nem a `/reset-password`.
- Teste ponto a ponto: criar conta nova → sessão ativa → perfil criado na base de dados → entrada no ecrã de perfil pendente.
