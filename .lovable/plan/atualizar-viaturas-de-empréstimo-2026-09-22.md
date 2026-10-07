# Atualizar Viaturas de Empréstimo

## Objetivo
Evoluir o módulo existente sem o reconstruir: ocupar toda a largura disponível, suportar alocações permanentes, preservar todos os eventos sobrepostos e simplificar navegação e criação.

## Alterações
- Tornar as grelhas Dia, Semana e Mês fluidas, mantendo a matrícula fixa e usando deslocamento horizontal apenas quando necessário para legibilidade.
- Adicionar seleção direta de mês e ano no período apresentado, mantendo Hoje e as setas.
- Substituir os dois botões de criação por um único botão «+ Novo» com menu para alocação ou inspeção.
- Acrescentar «Alocação permanente» ao formulário existente, sem fim obrigatório, com edição posterior para terminar, mudar a pessoa ou converter para temporária.
- Guardar permanência como um único intervalo aberto, sem criar registos diários.
- Ajustar conflitos: alocações permanentes bloqueiam novas alocações, mas não impedem inspeções; inspeções continuam a bloquear disponibilidade operacional no respetivo período.
- Renderizar alocações e inspeções simultaneamente; no Dia, distribuir sobreposições por faixas compactas e sobrepor inspeções com estilo distinto sem esconder a alocação.
- Na Semana, mostrar vários itens e abrir a lista completa através de «+N»; no Mês, manter o mapa de calor e abrir todos os eventos do dia.
- Atualizar o detalhe diário para identificar alocações permanentes e apresentar corretamente intervalos sem fim.
- Atualizar a regra funcional e o histórico de alterações em «Regras e Automação».

## Dados e segurança
- Alterar apenas a tabela existente de eventos de viaturas para permitir fim nulo em alocações permanentes e registar explicitamente essa condição.
- Manter RLS, perfis Proprietário/Gestor, auditoria e histórico existentes.
- Atualizar a validação da base de dados para impedir conflitos entre alocações, permitir inspeções dentro de alocações e preservar validações temporais.
- Atualizar os tipos gerados usados pela aplicação após a migração.

## Verificação
- Confirmar em desktop e ecrã estreito que Dia, Semana e Mês preenchem a largura e preservam matrícula fixa/deslocamento.
- Criar, editar, terminar e converter uma alocação permanente.
- Criar uma inspeção dentro da alocação permanente e confirmar que ambos permanecem visíveis.
- Confirmar que dados sobrepostos existentes continuam todos visíveis e clicáveis nas três vistas.
- Confirmar seleção direta de mês/ano, menu «+ Novo», pesquisa de disponibilidade, gestão de viaturas, auditoria e restrições de acesso.
