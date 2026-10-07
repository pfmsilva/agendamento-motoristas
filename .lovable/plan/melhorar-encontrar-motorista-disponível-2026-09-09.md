# Melhorar “Encontrar motorista disponível”

## Alterações
- Calcular, para cada motorista, o compromisso ou indisponibilidade imediatamente anterior e seguinte ao período pesquisado, incluindo motoristas disponíveis; quando não existir contexto próximo, mostrar uma mensagem neutra.
- Manter os conflitos atuais bem diferenciados (serviço sobreposto, férias/ausência, indisponibilidade, intervalo reduzido e deslocação por configurar), agrupando avisos repetidos numa única secção legível.
- Reorganizar cada resultado num cartão com estrutura fixa: nome e estado no topo, contexto e avisos em colunas alinhadas, e ação numa área consistente à direita no ecrã largo e abaixo no telemóvel.
- Manter disponíveis primeiro e indisponíveis depois, preservando a ordem de prioridade original dentro de cada grupo.
- Simplificar o resumo para “Ocupação prevista”, com data e horas em formato PT-PT e indicação explícita da deslocação incluída.

## Detalhes técnicos
- Usar os intervalos efetivos das atividades e os períodos de férias/indisponibilidade já carregados, sem alterar a lógica de atribuição automática.
- Considerar como contexto próximo os eventos adjacentes no mesmo dia ou até 24 horas antes/depois do período pesquisado.
- Reutilizar os tokens visuais existentes para estados, avisos, superfícies e botões.

## Validação
- Confirmar datas DD/MM/AAAA e horas de 24 horas.
- Confirmar cartões com alturas variáveis sem deslocar badges ou botões.
- Confirmar ordenação estável e apresentação de compromissos anteriores/seguintes para motoristas disponíveis e indisponíveis.
