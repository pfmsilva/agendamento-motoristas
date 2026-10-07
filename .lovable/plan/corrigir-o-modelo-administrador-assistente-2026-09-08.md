# Corrigir o modelo Administrador / Assistente

Objetivo: Administrador e Assistente passam a ter exatamente a mesma vista e os mesmos poderes operacionais; a hierarquia de motoristas e os serviços por atribuir deixam de ser visíveis para ambos; o assistente passa a poder delegar o seu Administrador.

## 1. Esconder a hierarquia de motoristas

- Retirar da vista partilhada de Assistente/Administrador o painel "Hierarquia de motoristas" (e o respetivo editor em modo leitura).
- Retirar do formulário de serviço a frase que explica que a escolha "define a hierarquia de motoristas usada na atribuição automática"; o seletor de Administrador passa a ter apenas a etiqueta "Serviço para".
- Retirar a lista de tentativas de atribuição (motoristas e motivos de indisponibilidade) sempre que quem vê é Assistente ou Administrador; continua visível para Proprietário e Gestor.
- Na ficha de utilizador (área de Administração), a hierarquia continua visível apenas para Proprietário e Gestor.
- Fechar a leitura da tabela de prioridades na base de dados: só Proprietário e Gestor a podem consultar.

## 2. Esconder o estado "por atribuir"

- Remover o bloco "serviços sem motorista disponível" da vista de Assistente/Administrador.
- Remover a etiqueta de tipo de atribuição (automática/manual/por atribuir) das listas e do detalhe do serviço para estes perfis.
- No calendário destes perfis, um serviço ainda sem motorista aparece na sua linha própria mas identificado apenas como "Sem motorista", sem qualquer explicação de falha.
- No detalhe do serviço, quando não há motorista, mostrar apenas "Motorista ainda não atribuído" - sem motivos nem avisos sobre atribuição manual.
- Confirmar que as notificações de atribuição manual continuam a ir apenas para Proprietário e Gestor (já é o caso) e que nenhuma notificação de falha chega ao Assistente/Administrador.

## 3. Igualdade total entre Assistente e Administrador

- Rever navegação, botões e permissões para garantir que tudo o que o Assistente faz o Administrador também faz (criar, ver, editar, cancelar serviços; calendário; detalhe; disponibilidade dos seus serviços).
- Única diferença de interface: o Administrador nunca vê o seletor "Serviço para"; o Assistente só o vê quando serve mais do que um Administrador.

## 4. Delegação iniciada pelo Assistente

- Nova secção "Delegar o meu Administrador" na vista do Assistente: escolher o Administrador que serve, o assistente que o vai substituir e o período (data de início e fim).
- A delegação cria apenas uma ligação com datas entre esse assistente e esse Administrador; não copia nem cria hierarquias.
- O assistente pode ver e terminar antecipadamente as delegações que criou.
- O assistente delegado recebe notificação e, durante o período, passa a ver o seletor de Administrador.
- Regras na base de dados: um assistente só pode delegar Administradores que serve atualmente, apenas com tipo "delegado" e com datas obrigatórias; não pode alterar ligações principais nem as de outros.
- Proprietário e Gestor continuam a poder criar, alterar e terminar qualquer ligação ou delegação.

## 5. Vista do Motorista

- Confirmar que cada serviço mostra claramente o Administrador e o assistente que o pediu (já implementado; validar em cartões e calendário).

## Detalhes técnicos

- Ficheiros: `src/components/dashboards/AssistantDashboard.tsx`, `src/components/ActivityDialog.tsx`, `src/components/admin/PriorityListEditor.tsx` (deixa de ter modo leitura para não-gestores), `src/components/admin/UserEditDialog.tsx`, `src/lib/data.ts` (hooks de delegação), novo componente de delegação.
- Migração: substituir a política de leitura de `administrator_driver_priorities` por `is_admin_view()`; adicionar políticas em `assistant_administrators` que permitam ao assistente inserir/atualizar apenas ligações delegadas dos Administradores que serve, com `start_date`/`end_date` obrigatórios (validação por trigger) e notificação ao assistente delegado.
- Não alterar serviços existentes, atribuições já feitas, nem lógica de escolha automática (`pick_driver_by_priority`).
- Verificação: typecheck e build; percursos com contas Assistente, Administrador, Gestor e Proprietário para confirmar o que cada um vê.
