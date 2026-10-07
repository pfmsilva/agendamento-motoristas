# Pilot Schedule Wiz — Evolução da aplicação existente

Plano de refinamento em 8 fases, reutilizando a aplicação atual (papéis, autenticação, tabelas, calendário de recursos, dashboards). Nada é reconstruído de raiz e nenhum dado é apagado.

## Auditoria do que já existe

Confirmado por inspeção do código e do esquema:

- Papéis `owner`, `manager`, `assistant`, `driver` já existem em `user_roles`, com funções de acesso (`is_manager`, `is_owner`, `can_view_driver`, `can_manage_driver_schedule`, `assistant_manages_driver`) usadas nas políticas de segurança.
- Já existem `activities`, `drivers`, `assistants`, `assistant_driver_assignments`, `time_off`, `unavailability`, `audit_log`, `notifications`, `app_settings`, todas com segurança ao nível da linha e registo de auditoria por trigger.
- Já existe deteção de conflitos no servidor (trigger `check_activity_conflicts`) com a regra de sobreposição pedida.
- Já existe calendário de recursos (dia/semana/mês) e dashboards por papel, mais Analytics do proprietário.

O que falta face aos requisitos: tabela de cidades e tempos de viagem, separação serviço/ocupação/ajuste do motorista, delegações temporárias, disponibilidade em três estados, calendário semanal em grelha tipo Teams, aprovação de ausências a remover, exportação Excel real, e separação clara entre Agenda e Analytics.

## Fase 1–2 — Segurança e papéis

- `assistant_driver_assignments` ganha `active`; o proprietário passa a controlar as atribuições permanentes.
- Nova tabela `assistant_delegations` (motorista, assistente original, assistente delegado, início, fim, tipo `assistant`/`owner_limited`, criado por, ativo).
- `assistant_manages_driver` passa a considerar delegações ativas na janela temporal atual; expiram automaticamente sem qualquer tarefa agendada.
- Delegação criada pelo proprietário (`owner_limited`) dá acesso operacional à agenda mas nunca a histórico/auditoria nem a dados pessoais, nem permite alterar atribuições — imposto por políticas, não pelo interface.
- Remoção da área genérica de administração para o gestor: gestão de utilizadores, papéis, permissões, atribuições e delegações passam a ser exclusivas do proprietário; o gestor mantém apenas a tabela de cidades e as vistas operacionais.
- Motorista: só pode ler os seus dados e só pode escrever no seu próprio ajuste de ocupação e nas suas ausências — nunca no serviço, cidade, horas ou motorista atribuído.
- Verificação dos 12 testes de segurança pedidos, executados diretamente contra a base de dados com sessões reais de cada papel.

## Fase 3 — Serviço, cidade, viagem e ocupação

- Nova tabela `cities`: nome, tempo de ida Lisboa→cidade, tempo de volta, ativo. Gerida pelo proprietário e pelo gestor. Sem valores fixos no frontend.
- `activities` ganha: cidade, ocupação calculada (início/fim) e ajuste do motorista (início/fim). O período de serviço mantém-se nos campos atuais, sem sobreposição de dados históricos.
- Cálculo automático da ocupação no servidor: serviço menos ida, serviço mais volta. Se a cidade não tiver tempos definidos, o utilizador é avisado explicitamente e a ocupação fica igual ao serviço — nunca se assume um tempo.
- Ocupação efetiva = ajuste do motorista quando existe, caso contrário ocupação calculada. Conflitos e disponibilidade passam a usar a ocupação efetiva.
- Ajuste do motorista fica auditado (valor antigo e novo).

## Fase 4 — Calendários

- Novo calendário semanal em grelha (horas na vertical, dias na horizontal, dia atual assinalado, navegação por semana), predefinido para motorista e assistente. Dia/Semana/Mês em todas as vistas.
- Uma atividade é desenhada como um único bloco com segmentos: azul escuro (serviço), azul médio (viagem calculada), azul muito claro (ajuste do motorista).
- Gestor mantém o calendário de recursos existente com todos os motoristas em linhas, distinguidos por iniciais/etiquetas e não por cores diferentes.
- Assistente vê apenas os seus motoristas e os delegados, com indicação visível de que motorista está a ser visto e de que o acesso é temporário.

## Fase 5 — Disponibilidade

Três estados com motivo sempre visível:

- Indisponível: sobreposição com ocupação efetiva, férias, ausência ou indisponibilidade.
- Condicional: sem sobreposição, mas dentro de uma margem configurável de outra ocupação, ou já com serviço fora de Lisboa nesse dia, ou cidade sem tempo de viagem definido.
- Disponível confirmado: nenhum dos anteriores.

"Encontrar motorista disponível" passa a receber data, horas, cidade e origem/destino opcionais, devolve os três grupos com motivos e permite escolher o motorista diretamente.

## Fase 6 — Delegações no interface

- Assistente: criar substituição (escolher assistente, início e fim), ver e revogar as suas delegações.
- Proprietário: criar delegações limitadas com início e fim.
- Criação, alteração e expiração registadas na auditoria.

## Fase 7 — Agenda vs Analytics

- Agenda: exclusivamente calendário, atividades, disponibilidade, ocupação e conflitos.
- Analytics: exclusivamente dados — utilização, horas de serviço, horas de viagem, ocupação total, número de atividades, conflitos, ausências e ajustes. Versão operacional para o gestor, versão alargada para o proprietário.

## Fase 8 — Ausências e relatórios

- Ausências do motorista deixam de ter aprovação: bloqueiam a disponibilidade imediatamente e ficam visíveis para o gestor e para o assistente responsável.
- Exportação Excel real (ficheiro .xlsx) para o proprietário, com filtros por intervalo de datas, motorista, assistente, tipo, estado, serviço, viagem, ocupação, ajustes e ausências.

## Visual

Mantém-se a identidade atual (base branca/neutra fria, azul #023F5A como cor principal, ouro #9B7D40 apenas como acento, Open Sans com Stella no display). Os azuis oficiais passam a ser usados como escala de segmentos do calendário. Interface de motorista otimizada para telemóvel, sem prejudicar o calendário em desktop.

## Notas técnicas

- Migrações aditivas: novas colunas anuláveis com preenchimento retroativo (ocupação calculada = serviço nas atividades existentes), nenhuma tabela removida.
- O cálculo de ocupação e a validação de conflitos vivem em triggers na base de dados, para que continuem a valer mesmo em pedidos diretos à API.
- Delegações avaliadas por comparação temporal dentro das funções de segurança, garantindo expiração automática.
- Sem chave de serviço no frontend; toda a autorização por políticas de linha.
