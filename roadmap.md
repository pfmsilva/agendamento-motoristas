# Roadmap

## Administrador nos serviços da agenda do Motorista
- [x] Mostrar o Administrador do serviço nas vistas temporais e mensal, detalhes e ajuste
- [x] Preservar os restantes tipos de evento e documentar a apresentação
- [x] Verificar a apresentação com sessão de Motorista B e dados existentes nas quatro vistas e no ajuste

## Libertar horário como lacuna real
- [x] Uniformizar seletores de data e hora com os formulários de serviço
- [x] Subtrair libertações sobrepostas/adjacentes em todos os cálculos de disponibilidade
- [x] Corrigir horas mensais e compromissos anterior/próximo
- [x] Dividir visualmente o serviço no calendário sem evento sobreposto
- [x] Validar seletores PT-PT e a lacuna real com os dados existentes; validação móvel concluída
- [x] Repetir o cartão completo em cada troço ocupado e usar as horas próprias de cada troço

- [x] Substituir a lista de tempos de deslocação pela matriz bidirecional editável
- [x] Redesenhar a matriz com pesquisa contextual, filtros e células compactas sem ruído visual

- [x] Migration: administrator role, priorities, activities columns, RPCs, triggers, policies
- [x] auth/team/UserEditDialog/UsersPanel: Administrador role
- [x] AppShell/app/admin/analytics routing for administrator; remove delegations UI
- [x] PriorityListsPanel + hooks
- [x] ActivityDialog requester mode + ManualAssignDialog
- [x] AssistantDashboard rewrite
- [x] ManagerDashboard pending panel, filters
- [x] WeekCalendar pending lane / driver label
- [x] Null driver_id fixes across dashboards/analytics/FindDriver
- [x] Notification bell: assign link
- [x] Verify end to end (owner priorities, assistant auto-assignment)
- [x] Simplificar gestão de Administradores: gravação automática, arrasto e ações discretas

## Tipos de evento + serviços recorrentes
- [x] Consolidar tipos de evento e TAGs numa única área de gestão contextual
- [x] Gestão global de TAGs: dados, permissões, formulários, calendário e documentação
- [x] Migração: event_kind, activity_series, RPCs garagem/série, display_names
- [x] scheduling.ts: garageStyle/vacationStyle, etiquetas de tipo
- [x] WeekCalendar: Garagem/Férias/Pessoal + legenda + vista mensal
- [x] GarageEventDialog + botão no painel Proprietário/Gestor
- [x] ActivityDialog: recorrência, âmbito da série, "Criado por"
- [x] DriverDashboard: tipo de evento, Administrador/Assistente, criador
- [x] Tratamentos visuais distintos de Garagem e Férias derivados da cor do motorista
- [x] Local obrigatório em Garagem, com pesquisa, deslocação e cidades pendentes
- [x] Modal de pesquisa: compromissos próximos, avisos agrupados e cartões alinhados
- [x] Estrutura visual unificada para todos os eventos nas vistas diária, semanal e mensal
- [x] Pesquisa automática de motorista e horas mensais pela ocupação efetiva
- [x] Privacidade de título e notas da TAG Admin para Gestor e Proprietário
- [x] Dashboard Analytics modular: widgets configuráveis, filtros globais, layouts persistentes e múltiplas vistas
- [x] Metadados e transparência das fórmulas KPI
- [x] Ocupação a 35h/semana com períodos parciais e sem sobreposição
- [x] Mapa de densidade horária interativo por motorista
- [x] Permissões, documentação funcional e validação integral

## Calendário de Assistente e Administrador
- [x] Alargar «Próximos serviços» à largura total do calendário
- [x] Separar a permissão de criação das validações de edição e ajuste

## Consistência do calendário
- [x] Uniformizar o botão «Novo serviço» no calendário do Motorista
- [x] Manter título e conteúdo legíveis nos blocos de eventos curtos
- [x] Permitir eventos do Motorista entre datas diferentes no modal «Novo evento»
- [x] Simplificar o texto do aviso de delegações
- [x] Unificar os formulários de criação e edição de férias/ausências

## Viaturas de Empréstimo
- [x] Fazer as vistas Dia, Semana e Mês ocupar toda a largura disponível
- [x] Suportar alocações permanentes e inspeções dentro dessas alocações
- [x] Preservar e apresentar todos os eventos sobrepostos
- [x] Adicionar seleção direta de data e ação única «Novo»
- [x] Verificar gestão, disponibilidade, auditoria e permissões existentes
- [x] Manter as cores dos eventos no hover e recortar visualmente alocações permanentes nas sobreposições
- [x] Alinhar rigorosamente os eventos com a grelha horária sem alterar a duração visual
- [x] Adicionar pesquisa e filtros combináveis ao calendário de viaturas
- [x] Atualizar a documentação funcional e validar em ecrãs largo e estreito
- [x] Distinguir visualmente alocações permanentes, temporárias e inspeções
- [x] Tornar os tipos de eventos de viaturas configuráveis e históricos
- [x] Remover Hoje e uniformizar o botão Gerir viaturas
- [x] Reordenar a navegação principal
- [x] Exportar Agenda, Viaturas, Análises e Auditoria para Excel estruturado

## Aprovações e locais
- [x] Remover o botão «Hoje» da navegação do calendário
- [x] Motoristas podem propor novos locais pelo mesmo fluxo do Assistente
- [x] Notificar Gestor e Proprietário do novo local, com autor e data/hora, e destacá-lo no painel do Gestor
- [x] Ordenar Origem/Destino com a zona de Lisboa primeiro
- [x] Tipo de evento «Outros» com justificação obrigatória e aprovação de Gestor ou Proprietário
- [x] Estado «Pendente de aprovação» visível no calendário e auditoria completa
- [x] Email ao motorista quando lhe é atribuído um novo serviço — arquitetura pronta e independente de fornecedor (fila `email_outbox` + `src/lib/email/*`); envio real fica para a migração Django, ligando `flushEmailQueue` ao backend de email das settings (`DEFAULT_FROM_EMAIL`, `EMAIL_HOST`, ...)

## Prioridade operacional na página do Gestor
- [x] Mostrar avisos informativos de Férias / Ausência até serem reconhecidos
- [x] Separar claramente contexto e alteração nos ajustes pendentes
- [x] Apresentar o estado «Ocupado» a vermelho em toda a aplicação
- [x] Atualizar documentação funcional e verificar a experiência completa

## Consistência visual e legibilidade
- [x] Substituir hovers dourados genéricos pelo cinzento neutro partilhado
- [x] Corrigir leitura e alinhamento dos avisos de férias/ausências
- [x] Melhorar o encaixe de texto nos eventos de Viaturas de Empréstimo
- [x] Atualizar documentação funcional e validar a interface

## Eliminação segura e consistência visual
- [x] Permitir eliminar permanentemente todos os tipos de evento com confirmação e histórico preservado
- [x] Uniformizar alinhamento e espaçamento da tabela Tipos de evento
- [x] Permitir editar e eliminar todos os motivos de ajuste com confirmação e histórico preservado
- [x] Uniformizar cantos de todos os cartões de Análises
- [x] Atualizar documentação funcional e validar em computador e telemóvel
