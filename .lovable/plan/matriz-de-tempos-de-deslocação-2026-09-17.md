# Matriz de tempos de deslocação

## Objetivo
Substituir, no separador **Cidades e deslocações**, o formulário e a lista linear de rotas por uma matriz compacta e editável, sem alterar os cálculos, permissões ou dados existentes.

## Alterações
- Mostrar uma linha e coluna por local ativo, agrupando `Casa` e todos os locais `Lisboa - …` numa única entrada **Lisboa / Casa**.
- Mostrar o mesmo valor nos dois sentidos a partir do único registo de rota já existente.
- Manter a diagonal não editável com `—`; a célula Lisboa-local ↔ Lisboa-local mostra `01h00` como valor fixo.
- Mostrar `—` nas rotas ainda não configuradas, sem assumir zero ou o tempo do destino.
- Ao selecionar uma célula editável, abrir uma edição compacta de horas e minutos; guardar atualiza imediatamente ambos os lados da matriz.
- Permitir remover uma rota configurada dentro da mesma edição, reutilizando a ação atual.
- Adicionar pesquisa simples para reduzir simultaneamente as linhas e colunas visíveis.
- Manter cabeçalho e primeira coluna fixos, com deslocação horizontal e vertical quando necessário.

## Documentação e validação
- Atualizar a regra funcional CITY-001 e o histórico de alterações da página **Regras e Automação** para descrever a matriz.
- Verificar compilação e testar visualmente a matriz, a edição, o espelho bidirecional, a pesquisa e os estados fixos/vazios.

## Fora de âmbito
- Nenhuma alteração ao modelo de dados, rotas existentes, cálculo de ocupação, calendário, motoristas, eventos, notificações, análises ou disponibilidade.
