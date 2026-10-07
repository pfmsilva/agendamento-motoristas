# Correções, alinhamento e QA funcional

Passagem de correção sobre a aplicação existente. Sem funcionalidades novas, sem redesenho, sem mexer nas regras de segurança.

## 1. Tempo de deslocação: um único valor por cidade

Situação atual confirmada: a tabela de cidades tem dois campos (`outbound_minutes`, `return_minutes`), ambos pedidos no formulário de administração e ambos usados no cálculo de ocupação.

Correção:
- Acrescentar um único campo `travel_minutes` à tabela de cidades, preenchido a partir dos valores já existentes (o maior dos dois, para não perder tempo de deslocação real). Nenhum dado é apagado.
- O cálculo de ocupação passa a usar esse valor único para ida e volta.
- O formulário de cidades passa a ter um só campo "Tempo de deslocação a partir de Lisboa" (formato horas/minutos, ex.: 3h33).
- Os campos antigos ficam sincronizados com o novo valor durante esta transição, para não partir nada que ainda os leia.

Exemplo verificado no fim: Braga 3h33, serviço 14:00–18:00 → ocupação 10:27–21:33.

## 2. Agenda vs Análises (Proprietário)

Causa identificada: a rota `/app` (Agenda) e a rota `/analytics` renderizam exatamente o mesmo componente quando o utilizador é Proprietário. São literalmente a mesma página.

Correção:
- **Agenda do Proprietário** passa a ser uma vista operacional centrada no calendário (motoristas, atividades, serviço/deslocação/ajuste, disponibilidade, conflitos, criação e atribuição), reutilizando o calendário de recursos já existente com âmbito total da frota.
- **Análises** deixa de ter qualquer calendário e fica só como painel de reporting: KPIs (atividades, horas de serviço, horas de deslocação, ocupação total, utilização, carga por motorista, conflitos, ausências, ajustes de motorista), gráficos (evolução temporal, por tipo, por motorista, por assistente), tabela detalhada, filtros e intervalo de datas, exportação CSV.
- Separam-se as métricas de **serviço** e **deslocação** (hoje só existem "horas" agregadas) e acrescentam-se os contadores de conflitos e de ajustes, que já existem nos dados.
- Para o Gestor aplica-se a mesma separação: Agenda operacional, Análises analítica.

## 3. Alinhamento do calendário

Causa identificada no calendário semanal: o cabeçalho dos dias e o corpo do grelha são dois contentores flex independentes; o corpo tem barra de deslocação vertical própria, cuja largura reduz a área das colunas do corpo mas não a do cabeçalho. Daí o desalinhamento progressivo até ao último dia.

Correção estrutural (sem offsets fixos):
- Cabeçalho e corpo passam a partilhar exatamente a mesma definição de colunas (uma grelha única: coluna fixa das horas + colunas de dia iguais).
- A deslocação vertical passa a envolver cabeçalho e corpo em conjunto, com o cabeçalho fixo no topo, para que a barra de deslocação nunca altere a largura relativa das colunas.
- Alinhamento das etiquetas de hora com as linhas horárias e continuidade das linhas verticais do cabeçalho para o corpo.
- Verificação nas vistas Dia, Semana e Mês, em várias larguras de ecrã, com deslocação vertical e horizontal. O mesmo mecanismo é aplicado ao calendário de recursos onde exista o mesmo padrão.

## 4. Auditoria de elementos interativos

Percorrer sistematicamente cada ecrã (Agenda, Análises, Administração, painéis de Assistente e Motorista, diálogos de atividade, delegação, procura de motorista) e para cada botão, separador, filtro, seletor, navegação de calendário e ação de diálogo confirmar: responde ao clique, executa a ação real na base de dados, atualiza a interface, mostra erro quando falha, respeita o perfil do utilizador e persiste após recarregar.

Elementos apresentados como funcionais mas sem comportamento implementado são ligados ou removidos — não ficam botões mortos.

## 5. Mensagens de erro e sucesso

Garantir feedback explícito em todas as ações importantes: gravação bem-sucedida, falha de gravação, conflito de horário, tempo de deslocação não configurado para a cidade, ação não autorizada. Nenhuma falha silenciosa; erros vindos da base de dados são mostrados ao utilizador em português.

## 6. Verificação ponta a ponta por perfil

Testes reais com sessão iniciada em cada perfil (Proprietário, Gestor, Assistente, Motorista) usando o navegador automatizado:
- criação, edição e cancelamento de atividade;
- atribuição de motorista e procura de motorista disponível;
- registo de ausência;
- ajuste de ocupação pelo motorista (serviço original preservado, ajuste afeta disponibilidade e conflitos);
- delegação temporária;
- gestão de perfis e de cidades;
- confirmação de que a mesma atividade aparece nos calendários de Gestor, Assistente e Motorista sem duplicação;
- confirmação de que acessos não autorizados continuam a ser recusados.

## Notas técnicas

- Alteração de base de dados: uma migração que adiciona `cities.travel_minutes`, faz o backfill a partir dos campos existentes, atualiza a função de cálculo de ocupação e mantém os campos antigos sincronizados. Sem remoção de colunas nem de dados nesta fase.
- Ficheiros previstos: `src/components/WeekCalendar.tsx`, `src/components/ResourceCalendar.tsx`, `src/routes/_authenticated/app.tsx`, `src/routes/_authenticated/analytics.tsx`, novo painel de agenda do Proprietário, `src/components/dashboards/OwnerDashboard.tsx`, `src/lib/analytics.ts`, `src/lib/scheduling.ts`, `src/routes/_authenticated/admin.tsx`, `src/components/ActivityDialog.tsx`, `src/components/FindDriverDialog.tsx`, `src/lib/data.ts`.
- RLS e políticas não são enfraquecidas. Onde uma ação falhar por autorização, corrige-se o pedido do frontend, não a política.
- No final: resumo do que estava errado, o que foi corrigido, ficheiros alterados, alterações de base de dados, o que foi testado e o que ficar por resolver.
