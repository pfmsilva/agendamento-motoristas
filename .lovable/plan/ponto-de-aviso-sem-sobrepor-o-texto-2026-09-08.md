# Ponto de aviso sem sobrepor o texto

Objetivo: o ponto de "Cidades e deslocações" (e de "Administração") fica no canto superior direito da caixa, mas nunca sobre o texto — o rótulo fica sempre totalmente legível.

## Causa actual

- O ponto tem 8 px e está colado a 6 px da borda direita (ocupa a faixa 6-14 px a contar da direita).
- O separador "Cidades e deslocações" tem apenas 12 px de espaço à direita do texto, pelo que as últimas letras ficam por baixo do ponto.

## Correcção

- `src/routes/_authenticated/admin.tsx`: no `TabsTrigger value="cities"`, além de `relative`, aplicar `pr-5` (20 px de espaço à direita) **apenas quando existem cidades por configurar** (`pendingCities > 0`). Sem pendentes, o separador fica exactamente como está hoje.
- `src/components/AppShell.tsx`: a mesma lógica nos dois links "Administração" (nav do computador e menu lateral do telemóvel): `pr-5` condicionado à existência de pendentes, mantendo `relative` e o ponto em `right-1.5 top-1.5 size-2`.
- Resultado: com o ponto visível, o texto termina a 20 px da borda e o ponto ocupa 6-14 px, com ~6 px de folga — dentro da caixa, fora da área de texto, sem alterar tamanho/tipo de letra nem o alinhamento do texto.
- Nada mais muda: cor, tamanho do ponto, comportamento de aparecer/desaparecer e a lógica de contagem ficam iguais.

## Verificação

- Typecheck + build.
- Playwright como Proprietário: capturas do separador, nav do computador e menu do telemóvel a confirmar que o ponto não toca no texto.
