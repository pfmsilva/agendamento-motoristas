# Atualizar Viaturas de Empréstimo, navegação e exportações

## Resultado
- O calendário distingue claramente «Alocação permanente», «Alocação temporária» e «Inspeção», mantendo a aparência atual da inspeção.
- O cabeçalho deixa de mostrar «Hoje» e «Gerir viaturas» passa a botão com ícone, moldura e alinhamento igual às restantes ações.
- Os tipos de evento de Viaturas passam a ser totalmente configuráveis no Backoffice, sem lista fixa no código.
- A navegação principal fica ordenada: Agenda → Viaturas de Empréstimo → Análises → Administração → Regras e Automação, respeitando as permissões atuais.
- Viaturas, Análises e tabelas relevantes da Administração passam a exportar registos estruturados para Excel.

## Implementação
1. Criar uma configuração própria de tipos de evento de Viaturas, com nome, estado, ordem, cor e regras operacionais configuráveis (campos exigidos, possibilidade de permanência e comportamento de conflito/sobreposição). Migrar «Alocação» e «Inspeção» como tipos iniciais, preservando todos os eventos existentes.
2. Permitir ao Proprietário criar, editar, ativar/desativar e eliminar estes tipos no Backoffice. A eliminação terá confirmação e preservará o nome/cor/regra usados nos eventos históricos através de snapshots, sem referências partidas.
3. Substituir as opções fixas nos formulários, filtros, detalhe diário, mensagens e calendário de Viaturas pela configuração ativa. Tipos inativos ou eliminados deixam de aparecer em novos registos, mas continuam legíveis no histórico.
4. Manter a inspeção com o estilo tracejado atual. Aplicar cores semânticas distintas às alocações permanentes e temporárias em todas as vistas e atualizar a legenda com as três entradas pedidas; os restantes tipos usam a cor configurada.
5. Remover «Hoje» do calendário de Viaturas e converter «Gerir viaturas» num botão `outline` com ícone de gestão de viaturas, altura e alinhamento consistentes com as restantes ações.
6. Reordenar os links no menu largo e móvel sem alterar quem pode aceder a cada área.
7. Criar exportação Excel de Viaturas com uma linha por evento e campos de viatura, matrícula, tipo, permanência, pessoa, datas/horas, estado, notas, cancelamento, autor e timestamps; respeitar período, pesquisa e filtros atuais.
8. Manter a exportação detalhada de Análises e completá-la com todos os campos operacionais existentes relevantes, continuando a exportar cada ocorrência recorrente numa linha e a respeitar os filtros ativos.
9. Adicionar exportação estruturada às listas relevantes da Administração: Utilizadores, Cidades/rotas, Administradores/prioridades, Tipos de evento, Motivos de ajuste e Auditoria, cada uma com uma linha por registo e apenas os dados permitidos ao perfil atual.
10. Atualizar «Regras e Automação» e o histórico funcional na mesma alteração.

## Dados e segurança
- Nova tabela pública de tipos de evento de Viaturas com permissões explícitas, RLS e gestão limitada aos perfis autorizados.
- Alterações aditivas ao modelo existente; nenhum evento, viatura ou histórico será apagado na migração.
- Validação na base de dados e na interface para aplicar as regras configuradas, incluindo conflitos, pessoa obrigatória e permanência.
- A inspeção inicial mantém exatamente as regras e o tratamento visual atuais.

## Verificação
- Criar, editar, desativar e eliminar um tipo livre; confirmar disponibilidade imediata nos fluxos de Viaturas e preservação histórica.
- Confirmar alocação permanente, alocação temporária e inspeção nas vistas Dia, Semana e Mês, incluindo sobreposições e legenda.
- Validar ausência do botão «Hoje», novo botão «Gerir viaturas» e ordem dos menus em ecrã largo e pequeno.
- Abrir cada Excel e confirmar uma linha por registo/ocorrência, filtros/período, campos completos e zero erros de fórmula.
- Validar permissões, auditoria, compilação e fluxos existentes de criação, edição, cancelamento e disponibilidade.
