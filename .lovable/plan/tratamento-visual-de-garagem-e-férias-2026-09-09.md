# Tratamento visual de Garagem e Férias

## Alterações

- Manter os três tratamentos atuais de Administração sem qualquer alteração: serviço sólido escuro, deslocação em subtom médio e ajuste riscado.
- Reformular Garagem como um quarto tratamento próprio: fundo muito claro derivado da cor do motorista, contorno sólido nessa cor e texto escuro de alto contraste, sem riscas nem padrões.
- Reformular Férias com base cinzenta clara, um subtom discreto derivado da cor do motorista, texto escuro e um pequeno indicador/contorno na cor do motorista.
- Manter o tratamento distinto dos eventos Pessoais.
- Aplicar os mesmos estilos reutilizáveis à vista diária/semanal, vista mensal, cartões relevantes e legenda.

## Detalhes técnicos

- Centralizar as misturas de cor e contraste em `src/lib/scheduling.ts`, atualizando `garageStyle(color)` e `vacationStyle(color)`.
- Passar sempre a cor atribuída ao motorista para o estilo de Férias em `src/components/WeekCalendar.tsx`.
- Usar tokens semânticos da aplicação para o cinzento, superfícies e texto; a única cor variável continua a ser o token de identidade do motorista.
- Remover o padrão pontilhado atual de Garagem e garantir que apenas o ajuste do motorista usa riscas.
- Verificar compilação e renderização das variantes na legenda e no calendário.
