# Privacidade dos eventos com TAG Admin para Gestor

## Objetivo
Garantir que o Gestor recebe apenas informação operacional dos eventos com a TAG base **Admin**. O título e as notas deixam de existir nas respostas acessíveis ao Gestor, sem retirar a capacidade de consultar, editar, atribuir ou ajustar a ocupação desses eventos.

## Alterações
- Separar o título e as notas confidenciais dos eventos Admin para armazenamento protegido, mantendo no registo operacional apenas um título genérico e nenhuma nota.
- Aplicar regras de acesso no backend para que apenas os perfis já autorizados pelo fluxo atual possam ler o conteúdo confidencial; Gestor e Proprietário ficam excluídos.
- Adaptar criação e edição para guardar ou recuperar os campos confidenciais sem os expor ao Gestor/Proprietário, incluindo ocorrências e séries recorrentes.
- No modal do Gestor, ocultar completamente **Título** e **Notas** em eventos Admin, preservando TAG, origem, destino, Administrador, motorista, horários, deslocação, disponibilidade e ajuste de ocupação.
- Sanitizar calendário, pesquisa global, atribuições pendentes, disponibilidade, notificações, auditoria, tooltips e pré-visualizações para usarem apenas “Serviço Administração” perante Gestor/Proprietário.
- Atualizar “Regras e Automação”, histórico de alterações e notas de implementação Django com esta regra de privacidade.

## Detalhes técnicos
- A proteção não dependerá apenas da interface: o conteúdo confidencial será removido da tabela operacional consultada pelo Gestor e colocado numa tabela com RLS própria.
- As gravações do Gestor em campos operacionais não poderão apagar nem substituir inadvertidamente o título/notas confidenciais.
- A TAG que ativa esta regra é exclusivamente a TAG base com `system_key = admin`; TAGs personalizadas mantêm o comportamento normal.
- Validar com testes de acesso por perfil, verificação de compilação e navegação no calendário/modal.
