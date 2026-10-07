# Correções: RLS, calendários, notificações, cidades e novo serviço

## 1. Erro crítico de RLS ao criar serviço (causa confirmada)

A política de INSERT da tabela de atividades usa a função `can_manage_driver_schedule`, que hoje só devolve verdadeiro para **gestor** ou **assistente com acesso ao motorista**. O papel **owner** não está incluído — por isso qualquer criação de serviço feita pela conta de proprietário é rejeitada. As mesmas regras de UPDATE e DELETE têm exatamente o mesmo problema.

Correção (migração de base de dados):
- Incluir o proprietário na função de autorização de gestão de agenda, para que passe a valer: proprietário ou gestor (qualquer motorista) e assistente apenas para motoristas atribuídos ou delegados com delegação ativa no momento.
- Rever em conjunto as regras de leitura, criação, alteração e eliminação de atividades para ficarem coerentes com esta função.
- Manter a regra de que o motorista **não** pode criar serviços; continua a poder criar ausências, indisponibilidades e ajustar a sua ocupação (regra separada, já existente, que só permite alterar a janela de ocupação da própria atividade).
- A autorização continua a ser avaliada no servidor a partir do utilizador autenticado e das relações da base de dados: alterar o identificador do motorista no pedido não dá acesso — a política volta a ser avaliada para esse motorista e é recusada.
- Sem RLS desativada, sem políticas permissivas, sem chaves de serviço no frontend.

## 2. Calendários — horas sempre à esquerda e alinhadas

- Grelha global de vários motoristas (Gestor/Proprietário/Assistente em "todos"): passa a usar o mesmo eixo temporal vertical à esquerda e dias em colunas, com os motoristas identificados nos blocos (iniciais). Deixa de existir a fila de horas no topo na vista Dia.
- Vista Dia: uma coluna (o dia), horas à esquerda.
- Vista Semana: sete colunas, horas à esquerda.
- Vista Mês: grelha mensal (sem eixo horário), mantida.
- Alinhamento: uma única grelha CSS partilhada entre a coluna das horas e as colunas dos dias, com a mesma altura de linha por hora e o mesmo contentor de scroll; a etiqueta de cada hora é posicionada sobre a respetiva linha da grelha, sem margens ou deslocamentos arbitrários.
- Cabeçalho de dias fixo (sticky) dentro do mesmo contentor, para que o scroll vertical e horizontal nunca desalinhe.
- Verificação nas várias larguras de ecrã.

## 3. Notificações

- Problema A: hoje a marcação como lida só acontece ao fechar o painel e as lidas continuam na lista. Passa a: marcar como lida ao abrir o painel (persistido na base de dados), botão para dispensar uma notificação e botão "Marcar todas como lidas"; as dispensadas são removidas de forma persistente, não apenas escondidas no frontend. O contador do sino conta apenas não lidas.
- Problema B: o painel usa altura máxima no componente errado, pelo que não faz scroll. Corrige-se com altura fixa na área de scroll do painel e lista ordenada da mais recente para a mais antiga; a página não cresce com o número de notificações.

## 4. Pesquisa de cidades

O seletor de cidade (formulário de serviço e procura de motorista) passa a ser um combobox com campo de pesquisa: filtra por nome, sem distinção de maiúsculas/minúsculas, com correspondência parcial e mensagem "Sem resultados". Os dados continuam a vir da tabela de cidades da base de dados.

## 5. Novo serviço — pré-preenchimento contextual

O formulário passa a receber e usar todo o contexto disponível:
- Motorista: o motorista da célula/slot clicado, ou o motorista selecionado no painel, ou o filtro ativo.
- Data e hora de início: a do slot clicado; caso contrário o dia visível no calendário com hora seguinte redonda.
- Origem: cidade base por omissão; Destino: cidade do contexto quando existir.
- Todos os campos continuam editáveis, dentro das permissões do utilizador.

O botão "Novo serviço" das barras superiores (Gestor, Assistente, Proprietário) passa também a transportar este contexto, em vez de abrir o formulário vazio.

## 6. Cabeçalho

Remover o texto "Driveboard" do cabeçalho da aplicação, ficando apenas o ícone. Restante interface mantém-se em português.

## 7. Testes

- Criação de serviço: proprietário e gestor para qualquer motorista (sucesso); assistente para motorista atribuído/delegado (sucesso); assistente para motorista sem acesso (recusado, incluindo manipulação do identificador); motorista a tentar criar serviço (recusado).
- Regressão: autenticação nos quatro papéis, calendários (dia/semana/mês), edição e cancelamento de atividades, cálculo de deslocação, disponibilidade e conflitos, ausências, ajustes do motorista, delegações, análises e notificações.

## Notas técnicas

- Migração: redefinir `can_manage_driver_schedule` incluindo `is_owner()`; revisão das políticas `activities` (SELECT/INSERT/UPDATE/DELETE) para consistência.
- Frontend: `WeekCalendar.tsx` torna-se a grelha temporal única (com suporte multi-motorista); `ResourceCalendar.tsx` deixa de renderizar horas no topo na vista Dia; `AppShell.tsx` (notificações + marca); `ActivityDialog.tsx` e `FindDriverDialog.tsx` (combobox de cidades, pré-preenchimento); `src/lib/data.ts` (marcar lida/dispensar notificações); dashboards passam contexto ao abrir "Novo serviço".
