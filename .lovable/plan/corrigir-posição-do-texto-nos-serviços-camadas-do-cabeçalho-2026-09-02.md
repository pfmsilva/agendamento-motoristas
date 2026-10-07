# Corrigir posição do texto nos serviços + camadas do cabeçalho

## Problema 1 — Texto posicionado sobre o bloco inteiro

Hoje, em `src/components/WeekCalendar.tsx` (`ActivityBlock`), o overlay de texto usa `top-0` relativo ao bloco de ocupação completo (deslocação + ajuste + serviço). Quando há deslocação/ajuste antes do serviço, o texto aparece sobre essa zona em vez da zona escura do serviço.

### Correção
- Calcular dinamicamente o deslocamento vertical do início do serviço dentro do bloco, reutilizando a mesma função `blockStyle()` já usada para posicionar os blocos:
  - `serviceTop = blockStyle(svcInicio, svcFim, dia, startHour).top - box.top`, limitado a `>= 0` (serviço pode começar antes do bloco visível/dia).
  - O overlay de texto passa a usar `style={{ top: serviceTop }}` em vez de `top-0`, ficando alinhado ao topo da zona escura (tempo efetivo do serviço).
- Manter a altura máxima do texto limitada à zona do serviço (`maxHeight` = altura do serviço visível), para não transbordar para o ajuste inferior em blocos curtos.
- Durante o drag de ajuste, o `serviceTop` recalcula sozinho porque deriva de `svcS/svcE` e de `box`, sem offsets fixos.
- Não se altera a renderização dos segmentos (deslocação/ajuste) — apenas a posição do conteúdo.

## Problema 2 — Texto dos serviços passa por cima do cabeçalho no scroll

Causa: as células sticky do cabeçalho usam `z-20`/`z-30`, mas o overlay de texto dentro de cada bloco também usa `z-20`. Como as colunas dos dias vêm depois no DOM, com z-index igual o texto ganha a sobreposição durante o scroll.

### Correção
- Elevar a camada do cabeçalho: canto esquerdo `z-50`, células dos dias `z-40`, eixo das horas `z-30` (abaixo do cabeçalho, acima dos blocos).
- Garantir que o conteúdo dos dias fica numa camada inferior: colunas dos dias com `z-0` (cria stacking context próprio), para que os `z-20` internos dos blocos nunca escapem por cima do cabeçalho, independentemente do número de serviços.
- O cabeçalho mantém fundo sólido (`bg-surface`) para cobrir totalmente o conteúdo ao fazer scroll.

## Ficheiros alterados
- `src/components/WeekCalendar.tsx` — único ficheiro (posicionamento do texto em `ActivityBlock`; z-index do cabeçalho/colunas na vista semana/dia).

## Verificação
- Build OK e verificação visual com Playwright: serviço com deslocação + ajuste mostra o texto dentro da zona escura; scroll vertical mantém o cabeçalho sempre por cima dos blocos.
