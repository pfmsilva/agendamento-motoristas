# Tipos de evento no calendário + serviços recorrentes

Quatro tipos de evento claramente distintos na agenda do motorista, com o autor sempre visível, e serviços que se podem repetir todas as semanas, meses ou anos - com motorista decidido ocorrência a ocorrência.

## 1. Tipos de evento

| Tipo | Como nasce | Aspeto |
| --- | --- | --- |
| Administração | Pedido de assistente/administrador ou criado pelo Proprietário/Gestor | Exatamente como hoje: bloco escuro (serviço), subtom médio (deslocação), riscado (ajuste do motorista). Nada muda. |
| Garagem | Gestor ou Proprietário cria diretamente para um motorista | Novo tratamento: subtom claro da cor do motorista com padrão de pontos discreto. Sem riscas, sem cor estranha à paleta. |
| Férias | Motorista ou gestão | Tratamento próprio, com barra lateral e tom de ausência já existente na aplicação. |
| Pessoal | Período criado pelo motorista (consulta, assunto pessoal) | Tratamento atual de indisponibilidade (cinzento tracejado), agora etiquetado. |

Cada bloco recebe uma etiqueta curta - Administração, Garagem, Férias, Pessoal - e a legenda do calendário passa a listar os quatro tipos.

O tratamento de Garagem é uma função reutilizável derivada da cor do motorista, definida num único sítio; mudar o aspeto mais tarde é alterar essa função.

## 2. Autor sempre registado e visível

Tipo de evento e autor são informações separadas: a cor diz o tipo, o texto diz quem criou.

Em cada evento (detalhe e, quando há espaço, no bloco) aparece "Criado por: ..." - assistente, administrador, gestor, proprietário ou o próprio motorista. Os registos já guardam o autor; falta apenas conseguir mostrar o nome, o que se resolve com uma consulta segura que devolve apenas id + nome dos utilizadores.

## 3. Eventos de garagem

- Botão "Novo evento de garagem" na agenda do Proprietário e do Gestor.
- Campos: motorista, título, data/hora de início e fim, notas.
- Classificação automática como Garagem - sem escolher "Administração ou Garagem".
- Sem administrador associado, sem cidade e sem tempo de deslocação.
- Usa os avisos de conflito já existentes: se o motorista estiver de férias, indisponível ou com outro serviço, o aviso aparece antes de gravar.

## 4. Disponibilidade

Não é criado nenhum sistema paralelo. O cálculo atual já considera serviços, férias e indisponibilidades; os eventos de garagem entram nesse mesmo cálculo por serem serviços com motorista. Consequência: um evento de garagem das 09:00 às 11:00 torna o motorista indisponível para um serviço das 10:00 às 12:00, e a atribuição automática passa ao motorista seguinte da hierarquia. Os períodos pessoais criados pelo motorista bloqueiam sempre.

## 5. Serviços recorrentes

No formulário de criação de serviço (assistente, administrador, proprietário, gestor):

- Interruptor "Repetir serviço".
- Frequência: todas as semanas / todos os meses / todos os anos.
- Data de fim da repetição (obrigatória quando a repetição está ligada).
- Meses sem o dia escolhido (31, 30, 29) usam o último dia do mês; 29 de fevereiro em anos não bissextos usa 28.

Cada ocorrência é um serviço independente ligado a uma série:

- O motorista é escolhido em cada ocorrência pela hierarquia do Administrador, conforme a disponibilidade nessa data. Semana 1 pode ficar com o João e a semana 2 com o Pedro.
- Se numa ocorrência não houver motorista disponível, só essa fica por atribuir e segue o processo manual normal do Proprietário/Gestor. As restantes continuam.
- Cancelar uma ocorrência não cancela a série.

Ao editar uma ocorrência de uma série, a aplicação pergunta: **apenas esta**, **esta e as seguintes** ou **toda a série**. Uma reatribuição manual numa ocorrência nunca altera as outras.

## 6. Permissões (sem alterações às existentes)

- Proprietário / Gestor: tudo o que já fazem, mais eventos de garagem e atribuição manual.
- Assistente / Administrador: serviços de administração, agora também recorrentes. Continuam sem ver hierarquias nem estados internos de atribuição.
- Motorista: vê tudo o que lhe diz respeito com tipo e autor, cria férias e períodos pessoais, ajusta a sua ocupação.

## Detalhes técnicos

**Base de dados (uma migração)**
- Novo tipo `event_kind` (`administration`, `garage`) e coluna `activities.event_kind` com valor por omissão `administration`, para não alterar nada do que já existe.
- Validação em trigger: eventos de garagem exigem motorista, não têm administrador nem cidade; serviços de administração mantêm as regras atuais.
- Nova tabela `activity_series` (administrador, assistente, título, tipo, cidade, notas, hora de início/fim, frequência, data de fim, autor) + `activities.series_id` e `activities.series_index`, com GRANTs, RLS alinhada com a de `activities` e `updated_at`.
- RPCs `SECURITY DEFINER`: `create_service_series`, `update_service_series(_scope)`, `cancel_service_series_from`, `create_garage_event`. As de série iteram as ocorrências e chamam `occupation_window` + `pick_driver_by_priority` por ocorrência, marcando `pending_manual` e notificando Proprietário/Gestor apenas quando falha - reutilizando `notify_pending_assignment`.
- Função `SECURITY DEFINER` `public.display_names()` (id, nome) para resolver "Criado por" sem abrir a tabela de perfis.
- Regeneração dos tipos após a migração.

**Frontend**
- `src/lib/scheduling.ts`: `EVENT_KIND_LABEL`, `garageStyle(color)` (subtom claro + `radial-gradient` pontilhado), `vacationStyle(color)`; `SEGMENT_CLASS`/`segmentStyle` de administração ficam intocados.
- `src/components/WeekCalendar.tsx`: escolhe o tratamento pelo tipo de evento, aplica etiquetas compactas e atualiza `OccupationLegend` para quatro entradas.
- Novo `src/components/GarageEventDialog.tsx` reutilizando `AvailabilityWarning` e `DriverStatusBadge`.
- `src/components/ActivityDialog.tsx`: bloco de recorrência na criação e diálogo de âmbito (esta / esta e seguintes / toda a série) na edição; linha "Criado por".
- `src/lib/data.ts`: hooks `useDisplayNames`, `useCreateGarageEvent`, `useCreateServiceSeries`, `useUpdateServiceSeries`, `useCancelSeriesFrom`.
- Dashboards: botão de garagem no Proprietário/Gestor, etiquetas de tipo e autor nos cartões do motorista, assistente e gestão.

**Verificação**
- Verificação de tipos e build.
- Teste real de recorrência semanal com um motorista indisponível numa das semanas, confirmando motorista diferente nessa ocorrência.
- Teste de evento de garagem a bloquear a atribuição automática seguinte.
