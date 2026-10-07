# Uniformizar os blocos de eventos do calendário

## Alterações

- Criar uma estrutura visual reutilizável para o conteúdo dos eventos, com etiqueta de categoria, título e linha secundária consistentes.
- Aplicar a mesma linguagem de cartão às vistas diária, semanal e mensal, incluindo Administração, Garagem, Férias e eventos pessoais/indisponibilidades.
- Preservar integralmente as cores e significados atuais: serviço escuro, deslocação em subtom, ajuste riscado, Garagem clara e Férias cinzentas com referência à cor do motorista.
- Integrar os segmentos de serviço, deslocação e ajuste dentro do mesmo contorno, sem perder a hierarquia visual.
- Tornar Férias um cartão compacto completo, em vez de uma barra fina.
- Adaptar progressivamente o conteúdo à altura disponível: etiqueta, título e hora por ordem de prioridade, sem sobreposição nem transbordo.
- Uniformizar contorno, raio, espaçamento, alinhamento e contraste, incluindo texto claro em fundos escuros e texto escuro em fundos claros.

## Detalhes técnicos

- Centralizar os estilos estruturais e variantes visuais do cartão no calendário, mantendo as misturas de cor reutilizáveis de `src/lib/scheduling.ts`.
- Reutilizar o mesmo conteúdo interno nas ocorrências temporizadas, nos eventos de dia inteiro e nos itens compactos da vista mensal.
- Manter os comportamentos existentes de clique, redimensionamento, tooltips e distribuição de eventos sobrepostos.

## Verificação

- Validar a compilação e os registos de execução.
- Verificar visualmente as vistas diária/semanal e mensal, incluindo eventos curtos e blocos com deslocação/ajuste.
