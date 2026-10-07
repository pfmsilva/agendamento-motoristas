# Indicador simples de cidades por configurar

Objetivo: substituir o badge com número por um pequeno ponto de aviso, discreto mas visível, ao lado de "Administração" e de "Cidades e deslocações".

## Comportamento

- O indicador passa a ser apenas um ponto pequeno (sem números, sem contagem).
- Aparece quando existe pelo menos uma cidade ativa sem tempo de deslocação configurado.
- Desaparece automaticamente quando não houver cidades pendentes (a lógica de contagem existente mantém-se; apenas deixa de ser mostrada).
- Cor: o âmbar de aviso do sistema (`--leave`, #b66113) — já usado nos avisos de configuração e com bom contraste sobre o fundo branco do cabeçalho, mantendo a harmonia com a paleta.
- Texto de acessibilidade mantido em PT-PT ("Cidades por configurar") via `title`/`aria-label`, sem números visíveis.

## Detalhes técnicos

1. `src/components/AppShell.tsx` — reescrever `PendingCitiesDot` (usado nos dois locais: links "Administração" no menu desktop e no menu lateral do telemóvel): renderizar um único `span` redondo pequeno (`size-2`, `rounded-full`, `bg-leave`) em vez do badge com número; manter o retorno `null` quando `count <= 0` (a lógica interna `usePendingCitiesCount()` continua a calcular a contagem, só deixa de ser exibida).
2. `src/routes/_authenticated/admin.tsx` — não precisa de alteração: o separador "Cidades e deslocações" usa o mesmo `PendingCitiesDot` e herda o novo visual.
3. Verificação: typecheck/build e confirmação visual no cabeçalho e no separador.
