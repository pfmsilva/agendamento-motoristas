# Analytics configurável e mapas de ocupação

## Objetivo
Transformar **Análises** num construtor de painéis operacionais reutilizável. O Proprietário cria, organiza e partilha painéis; o Gestor consulta, filtra e interage com os painéis partilhados, sem alterar a sua configuração.

## Experiência da página
- Criar uma barra superior com seletor de painel, novo painel, duplicar, partilhar, repor configuração e guardar alterações.
- Adicionar filtros globais de período, motorista, Administrador, Assistente e TAG, aplicados em conjunto a todos os widgets que optem por os seguir.
- Disponibilizar ao Proprietário uma grelha editável com adicionar, editar, duplicar, remover, arrastar, redimensionar e guardar widgets.
- Manter o Gestor em modo de consulta: pode mudar filtros, período e navegar/interagir, mas não altera painéis nem widgets.
- Adaptar a grelha a ecrãs pequenos, preservando leitura, controlos e detalhes dos gráficos.

## Construtor de widgets
- Criar um catálogo extensível de métricas, dimensões, visualizações e respetiva compatibilidade, sem análises codificadas diretamente na página.
- O formulário de widget permite configurar título, métrica, visualização, período próprio ou filtros globais, motoristas, Administrador, Assistente, TAG, cidade/Garagem e dimensões aplicáveis.
- Suportar cartão KPI, barras verticais/horizontais, linha, área, circular/donut, empilhado, tabela e mapa de densidade.
- Guardar a definição completa e a posição/tamanho de cada widget, permitindo acrescentar novas métricas e dimensões ao catálogo no futuro sem refazer o construtor.

## Persistência, partilha e permissões
- Criar modelos para painéis, widgets e partilhas, com ordenação, dimensões da grelha, filtros e configuração estruturada.
- Painéis podem ser privados ou partilhados para consulta com o perfil Gestor; apenas o Proprietário cria, edita, partilha, repõe ou elimina.
- Aplicar políticas de acesso no servidor: cada utilizador só recebe painéis e resultados permitidos; dados confidenciais de eventos Admin nunca entram nos resultados analíticos.
- Auditar criação, edição, duplicação, reposição, partilha e eliminação de painéis/widgets.
- Criar um painel inicial partilhado com KPIs operacionais, detalhe por motorista, evolução e o novo mapa de densidade horária.

## Motor analítico comum
- Calcular os resultados diretamente a partir dos mesmos eventos operacionais do calendário, usando sempre a ocupação efetiva final: ajuste manual, senão ocupação calculada, senão horário do serviço.
- Excluir cancelados por omissão, limitar cada intervalo ao período e unir sobreposições por motorista antes de somar, evitando dupla contagem.
- Disponibilizar consultas agregadas e parametrizadas para métricas, séries, categorias, tabelas e densidade, respeitando filtros e permissões.
- Atualizar automaticamente os resultados através da sincronização já existente quando serviços, deslocações, ajustes, férias ou indisponibilidades mudarem.

## KPI de ocupação e fórmulas transparentes
- Definir capacidade padrão como **7 horas por dia útil / 35 horas por semana**, proporcional aos dias úteis incluídos em semanas parciais.
- Retirar à capacidade as férias aprovadas e as indisponibilidades ativas, sem reduzir abaixo de zero.
- Calcular ocupação individual como `minutos efetivamente ocupados únicos ÷ minutos de capacidade disponível × 100`.
- Calcular o agregado como `soma dos minutos ocupados únicos ÷ soma da capacidade disponível dos motoristas filtrados × 100`.
- Associar a cada KPI metadados reutilizáveis: fórmula, significado, inclusões, exclusões, pressupostos, unidade e filtros/período ativos.
- Mostrar esses metadados num tooltip acessível pelo valor/cartão e por um ícone de informação, para KPIs atuais e futuros.

## Mapa de densidade horária
- Adicionar por omissão uma matriz com uma linha por motorista e 24 células, das 00:00 às 23:00.
- Para cada célula, calcular serviços que tocaram nessa hora, dias distintos ocupados, minutos ocupados únicos e percentagem dos dias úteis analisados.
- Dividir intervalos entre dias/horas corretamente e unir sobreposições antes de somar.
- Normalizar a intensidade dentro do período de forma consistente para comparação entre motoristas, mantendo zero neutro.
- Mostrar no detalhe: motorista, hora, período, serviços, dias ocupados, tempo total e percentagem dos dias úteis.
- Permitir Semana, Mês (predefinição), Semestre e Ano, com navegação para período anterior/seguinte.

## Documentação e validação
- Atualizar **Regras e Automação**, modelo de dados, permissões, fórmulas, automações, auditoria e notas Django; acrescentar o histórico funcional e manter as exportações Excel/JSON alinhadas.
- Atualizar os tipos gerados após a migração.
- Validar cálculos com intervalos sobrepostos, ajustes, viagens, semanas parciais, férias e indisponibilidades.
- Validar Proprietário e Gestor em desktop e ecrã pequeno: criação, arrasto, redimensionamento, filtros, partilha, reposição, tooltips e densidade.
- Confirmar compilação, página sem erros e atualização automática após alterações operacionais.
