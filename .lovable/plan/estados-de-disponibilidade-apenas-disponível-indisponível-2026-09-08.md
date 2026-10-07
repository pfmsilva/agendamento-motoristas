# Estados de disponibilidade: apenas Disponível / Indisponível

Passar a interface a mostrar só dois estados, mantendo os avisos explicativos.

## O que muda para o utilizador

- "Disponível confirmado" passa a "Disponível".
- Situações hoje mostradas como "Condicional" (pouco intervalo entre serviços, serviço fora de Lisboa no mesmo dia, cidade sem tempo de deslocação definido) passam a mostrar "Disponível", com o aviso em texto por baixo, como já acontece.
- "Indisponível" mantém-se para férias/ausências, indisponibilidades e sobreposição de serviços, continuando a distinguir o motivo na mensagem.
- No painel do Gestor, o indicador "Condicionais no dia" é substituído por "Com avisos no dia", para não sugerir um terceiro estado.

## Onde se aplica

Calendário, formulário de novo serviço e edição, "Encontrar motorista disponível", cartões de motorista dos painéis de Gestor e Assistente, avisos de conflito e ajuste de ocupação.

## Detalhe técnico

- `src/lib/scheduling.ts`: `AVAILABILITY_LABEL.AVAILABLE` = "Disponível"; `AVAILABILITY_LABEL.CONDITIONAL` = "Disponível" e a sua classe de cor passa a ser igual à de AVAILABLE; `driverBadge()` devolve `{ label: "Disponível", kind: "available" }` no caso condicional. A lógica interna de cálculo (`CONDITIONAL`) mantém-se para continuar a gerar os avisos.
- `src/components/AvailabilityWarning.tsx`: cabeçalho usa o rótulo já unificado; o grupo de conflitos "A confirmar" mantém-se como bloco de aviso, não como estado.
- `src/components/FindDriverDialog.tsx`: mantém a ordenação (sem conflitos primeiro), mas o texto do estado passa a ser o mesmo para AVAILABLE e CONDITIONAL.
- `src/components/dashboards/ManagerDashboard.tsx`: renomear o KPI para "Com avisos no dia".
- Verificação final: pesquisa por "confirmado"/"Condicional" no código para garantir que não sobra terminologia antiga; typecheck e build.
