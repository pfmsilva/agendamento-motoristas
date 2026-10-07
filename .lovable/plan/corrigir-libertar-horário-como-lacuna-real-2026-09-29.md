# Corrigir «Libertar horário» como lacuna real

## Objetivo
Fazer a libertação funcionar como uma subtração da ocupação existente, com os mesmos seletores de data e hora dos serviços e uma representação visual realmente vazia no calendário.

## Alterações
- Substituir os campos nativos do formulário por `DateInput` e `TimeInput`, em `DD/MM/AAAA` e `HH:mm` (24 horas).
- Centralizar a normalização de intervalos libertados: unir intervalos sobrepostos ou adjacentes e subtraí-los à ocupação dos serviços.
- Aplicar essa ocupação segmentada à pesquisa, atribuição automática/manual, conflitos, estados e cálculo das horas mensais, tanto na interface como nas funções da base de dados.
- Calcular «Anterior» e «Próximo» a partir dos segmentos ocupados restantes, para mostrar o fim às 12:00 e o reinício às 14:00 no exemplo indicado.
- Dividir visualmente o bloco do serviço no calendário, deixando os intervalos libertados como espaço vazio; manter clique/edição do serviço nos segmentos visíveis e suportar várias libertações sobrepostas ou adjacentes.
- Manter a edição/remoção da libertação acessível sem desenhar um evento sobre o serviço.
- Atualizar «Regras e Automação» e os testes das funções de intervalos.

## Verificação
- Testar um serviço 09:00–18:00 com libertação 12:00–14:00 na pesquisa, atribuição, conflitos, horas mensais e calendário.
- Confirmar «Anterior» até 12:00 e «Próximo» desde 14:00.
- Confirmar várias libertações sobrepostas/adjacentes e formatos PT-PT em ecrãs largo e estreito.
