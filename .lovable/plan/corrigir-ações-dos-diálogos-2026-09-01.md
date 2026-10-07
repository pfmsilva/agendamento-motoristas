# Corrigir ações dos diálogos

## Objetivo
Garantir que os botões executam a ação, mostram o resultado atualizado e só fecham o diálogo quando a operação estiver realmente concluída.

## Alterações
1. **Sincronizar gravação e atualização visual**
   - Fazer as mutações aguardarem pela atualização das consultas relevantes em vez de iniciarem a atualização em segundo plano.
   - Manter o diálogo aberto enquanto a operação está em curso e bloquear cliques repetidos.
   - Fechar apenas depois de a nova atividade, delegação, ajuste ou indisponibilidade estar disponível no estado da aplicação.

2. **Corrigir feedback dos botões**
   - Mostrar estado de processamento no próprio botão (`A guardar…`, `A delegar…`, etc.).
   - Em caso de erro, manter o diálogo aberto e apresentar a mensagem no conteúdo do diálogo.
   - Em caso de sucesso, fechar e apresentar a confirmação.

3. **Clarificar “Encontrar motorista disponível”**
   - O botão de escolha passará a indicar que seleciona o motorista e abre o formulário do serviço, em vez de sugerir que a atribuição já foi gravada.
   - Preservar motorista, horário completo e cidade ao transitar para “Novo serviço”.

4. **Validar os fluxos afetados**
   - Testar criação e edição de serviço, escolha de motorista disponível, criação e revogação de delegação, ajuste de ocupação e registo de indisponibilidade.
   - Confirmar que falhas de permissões ou conflitos não fecham o diálogo nem criam ações duplicadas.

## Detalhes técnicos
- Ajustar a invalidação de consultas em `src/lib/data.ts` para devolver e aguardar as promessas das consultas relevantes.
- Uniformizar os estados pendentes e mensagens nos componentes de diálogo.
- Corrigir a passagem do fim do horário no fluxo `FindDriverDialog` → `ManagerDashboard` → `ActivityDialog`.
- Não alterar o modelo de dados nem as regras de acesso, porque as gravações recentes foram confirmadas na base de dados.
