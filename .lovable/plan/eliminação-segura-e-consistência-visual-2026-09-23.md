# Eliminação segura e consistência visual

## Alterações

- Em «Tipos de evento», acrescentar uma ação «Eliminar» em todas as linhas e um diálogo de confirmação que explique a remoção permanente.
- Permitir eliminar também tipos base e tipos já usados, retirando-os imediatamente das novas escolhas sem apagar nem alterar serviços e séries existentes.
- Guardar no serviço e na série uma cópia do nome do tipo usado, para o histórico continuar legível depois de a configuração ser eliminada.
- Uniformizar a tabela de tipos de evento: cabeçalho e tabela alinhados, largura total, espaçamento horizontal consistente, células equilibradas e ações adaptadas a ecrãs pequenos.
- Em «Motivos de ajuste», retirar o selo e as restrições de «motivo base»; todos os motivos terão edição e eliminação permanentes com confirmação.
- Guardar no serviço uma cópia do nome do motivo escolhido e desligar com segurança a referência ao motivo eliminado, mantendo detalhes, aprovações, auditoria e exportações históricos legíveis.
- Uniformizar todos os cartões de Análises com o mesmo raio dos cartões arredondados existentes, sem alterar dados, filtros, cálculos ou interações.
- Atualizar «Regras e Automação» e o histórico de alterações funcional com as novas regras de eliminação e retenção histórica.

## Detalhes técnicos

- Aplicar uma migração aditiva: novas colunas de nome histórico, preenchimento dos registos existentes, atualização dos gatilhos/funções de gravação e remoção das proteções de eliminação dos registos base.
- Alterar a referência de `activities.adjustment_reason_id` para ficar nula quando o motivo é eliminado; o nome histórico permanece no registo.
- Manter as TAGs associadas independentes: eliminar um tipo não elimina a respetiva TAG nem altera a TAG já gravada nos eventos.
- Reutilizar os diálogos, botões, tabela e tokens visuais existentes.

## Verificação

- Eliminar, com confirmação, um tipo usado e um não usado, incluindo um tipo base; confirmar que desaparecem das novas escolhas e que serviços/séries históricos continuam legíveis.
- Eliminar, com confirmação, um motivo usado e um não usado, incluindo um motivo base; confirmar detalhes, aprovação, auditoria e exportação históricas.
- Confirmar edição dos motivos sem qualquer distinção visual de origem.
- Validar alinhamento da tabela e ações sem cortes em computador e telemóvel.
- Validar que todos os cartões e contentores de visualização em Análises usam o mesmo arredondamento.
- Confirmar compilação, erros de execução e os fluxos principais com uma sessão autorizada.
