# Corrigir criação de conta com email e palavra-passe

## Causa real (confirmada nos registos de autenticação)

Os pedidos de criação de conta estão a ser recusados pelo serviço de autenticação com o erro:

> "Password is known to be weak and easy to guess, please choose a different one." (HTTP 422)

Ou seja: a conta **não é criada** porque a verificação de palavras-passe comprometidas (HIBP) está ativa e a palavra-passe usada — `demo1234`, que o formulário preenche automaticamente por ser a palavra-passe das contas de demonstração — consta de listas públicas de fugas de dados.

Como a lista de tradução de erros não tem regra para "palavra-passe fraca", a mensagem cai no genérico "Ocorreu um erro. Tente novamente.", escondendo a causa.

Verificado também: o formulário está corretamente ligado ao backend, o gatilho que cria o perfil na base de dados (`profiles`) funciona e não há políticas a bloquear o registo. O Google não é afetado.

## O que vai ser feito

1. **Formulário de criação de conta**
   - Deixar de pré-preencher a palavra-passe de demonstração no separador "Criar conta" (campos limpos e independentes dos de entrada).
   - Validação antes de submeter: nome, email e palavra-passe obrigatórios, email com formato válido, mínimo de 8 caracteres — com mensagens PT-PT específicas por campo.
   - Indicação visível: "Escolha uma palavra-passe segura, com pelo menos 8 caracteres e que não use em nenhum outro site."

2. **Mensagens de erro claras (PT-PT)**
   - Palavra-passe comprometida/fraca: "Esta palavra-passe é demasiado comum e já apareceu em fugas de dados. Escolha outra."
   - Email já registado, email inválido, palavra-passe demasiado curta, falha de ligação, demasiadas tentativas: mensagens próprias.
   - Erros inesperados continuam a mostrar a mensagem genérica, mas o erro técnico passa a ser registado na consola para debugging.

3. **Fluxo pós-criação**
   - Depois da criação, mensagem explícita sobre o passo seguinte (confirmar email, se aplicável, e aguardar atribuição de perfil pelo Proprietário) em vez de assumir entrada imediata.

4. **Teste ponto a ponto**
   - Criar conta com uma palavra-passe forte, confirmar a criação da conta e do perfil na base de dados, e a entrada na aplicação até ao ecrã de perfil pendente.

## Detalhes técnicos

- `src/lib/errors.ts`: novas regras para `weak and easy to guess` / `pwned`, `invalid email` / `email address ... invalid`, `signup requires a valid password`, `password should be at least`; manter a tradução existente.
- `src/routes/auth.tsx`: separar estado do formulário de registo do de entrada, validação local antes de `supabase.auth.signUp`, `console.error` do erro original antes de mostrar a mensagem traduzida.
- Sem alterações ao fluxo Google (`lovable.auth.signInWithOAuth`), sem alterações à base de dados nem à configuração de autenticação (a proteção HIBP mantém-se ativa por segurança).
