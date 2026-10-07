# Corrigir ecrã preto no fluxo "Eliminar utilizador"

## Causa do problema (confirmada no código)

Ao abrir a confirmação a partir de "Editar utilizador" ficam **dois diálogos modais abertos ao mesmo tempo**, e três problemas somam-se:

1. **Overlay duplicado e quase opaco**: o popup de edição (`src/components/ui/dialog.tsx`) desenha um fundo manual `bg-black/80`; a confirmação (`alert-dialog.tsx`) desenha outro `bg-black/80` por cima. Dois véus de 80% empilhados ≈ ecrã totalmente preto.
2. **Ordem de camadas errada**: o conteúdo da confirmação fica a `z-50`, **abaixo** do conteúdo do popup de edição (`z-[51]`) — a confirmação fica escondida atrás.
3. **Bloqueio de interação**: o popup de edição é modal, por isso desativa os cliques em tudo o que está fora dele — incluindo a confirmação, que passa a estar visível mas sem responder (aplicação "congelada").

## Correção

**`src/components/admin/UserEditDialog.tsx`**
- Ao clicar em "Eliminar utilizador": **fechar o popup de edição** e abrir a confirmação (nunca ficam os dois abertos).
- Ao clicar em **Cancelar** na confirmação: fechar a confirmação e **reabrir o popup de edição** com os dados que estavam a ser editados.
- Confirmação passa a ter o título **"Eliminar utilizador?"** e o texto **"Tem a certeza de que pretende eliminar este utilizador? Esta ação não pode ser revertida."**, com os botões **Cancelar** e **Eliminar utilizador** (vermelho), como pedido.
- Em sucesso: elimina na base de dados, fecha tudo, lista atualiza de imediato. Em erro: mensagem PT-PT, confirmação fecha e o popup de edição reabre sem alterações.

**`src/components/ui/alert-dialog.tsx`**
- Subir as camadas da confirmação para `z-[60]` (overlay) e `z-[61]` (conteúdo), garantindo que qualquer confirmação futura aberta sobre um diálogo fica sempre por cima.

## Verificação
- Abrir "Editar utilizador" → "Eliminar utilizador": ecrã apenas ligeiramente escurecido, confirmação visível e clicável.
- Cancelar volta ao popup de edição; confirmar elimina o utilizador e ele desaparece da lista mesmo após recarregar.
- Confirmar que os outros diálogos e a confirmação de "pedidos pendentes" continuam iguais.
