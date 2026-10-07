# Recuperação de palavra-passe

Qualquer utilizador — Proprietário, Gestor, Assistente, Motorista ou conta ainda pendente de perfil — passa a poder repor a sua palavra-passe sozinho, por email, sem intervenção do Proprietário.

## Pré-requisito: domínio de email

Para enviar emails com a marca Driveboard e texto em PT-PT é preciso configurar primeiro um domínio de envio (tem de ser um domínio seu). Depois de concluído, crio os modelos de email em PT-PT.

## O que passa a existir

**Na página de entrar**

- Ligação bem visível "Esqueci-me da palavra-passe", por baixo do campo da palavra-passe.
- Ao clicar, abre um pequeno formulário onde se introduz apenas o email.
- Resposta sempre igual, quer o email exista ou não: "Se existir uma conta com esse email, enviámos as instruções para repor a palavra-passe." (não revela quem está registado).

**Email de recuperação (PT-PT)**

- Escrito em Português de Portugal, com a identidade visual da aplicação (azul #023F5A, Open Sans, remetente "Driveboard").
- Contém apenas um botão/ligação para definir nova palavra-passe. Nunca inclui a palavra-passe atual nem qualquer palavra-passe.
- Ligação com validade limitada e de uso único: depois de a palavra-passe ser alterada (ou de expirar) deixa de funcionar.

**Nova página "Definir nova palavra-passe"** (`/reset-password`, pública)

- Aberta a partir da ligação do email; valida que a sessão vem mesmo de um pedido de recuperação.
- Dois campos: nova palavra-passe e confirmação, com mínimo de 8 caracteres e verificação de coincidência.
- Se a ligação estiver expirada ou já usada: mensagem em PT-PT com botão para pedir nova ligação.
- Após gravar: confirmação, terminação da sessão temporária e reencaminhamento para a entrada, onde o utilizador entra normalmente com a nova palavra-passe.

**Perfis e permissões**

- A recuperação funciona igual para todos os perfis e também para contas sem perfil atribuído; essas contas, ao entrar, continuam a ver o ecrã "pendente de aprovação".
- O Proprietário continua a poder alterar perfil, permissões e estado ativo/inativo, mas nunca vê nem define palavras-passe de terceiros — nada na área de Utilizadores expõe credenciais.

**Mensagens**

- Todos os textos de erro e sucesso ficam em PT-PT, através do tradutor de erros já existente (ligação, limite de tentativas, ligação inválida, palavra-passe demasiado curta).

## Notas técnicas

- `src/routes/auth.tsx`: separador/estado "recuperar", chamada a `resetPasswordForEmail` com `redirectTo: ${window.location.origin}/reset-password`; resposta neutra independentemente do resultado.
- Nova rota pública `src/routes/reset-password.tsx` (SSR, sem gate de autenticação) com `head()` próprio; deteta o evento `PASSWORD_RECOVERY` / token no URL e chama `supabase.auth.updateUser({ password })` (sem `current_password`, por ser sessão de recuperação); `signOut()` no fim.
- `src/lib/errors.ts`: acrescentar regras para "same password", "token expired/invalid" e limite de envio de emails.
- Modelos de email de autenticação gerados para o projeto e traduzidos para PT-PT (recuperação, confirmação de conta, alteração de email, etc.), com as cores e tipografia de `src/styles.css`.
- Sem alterações de base de dados: a validade e o uso único do token são geridos pelo serviço de autenticação.

<presentation-actions>
<presentation-open-email-setup>Configurar domínio de email</presentation-open-email-setup>
</presentation-actions>
