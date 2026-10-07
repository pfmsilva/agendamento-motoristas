# Indicador de notas no calendário do Motorista

## Alterações
- Mostrar um ícone compacto de comentário em cada cartão de serviço que tenha uma nota visível para o perfil atual, nas vistas diária, semanal e mensal.
- Manter o indicador junto da TAG/título, com contraste adequado, texto acessível “Tem uma nota” e clique no cartão a abrir o serviço completo.
- Incluir notas operacionais, notas reservadas e conteúdo confidencial apenas quando as regras atuais permitem ao utilizador lê-las.
- Garantir que Gestor e Proprietário não recebem nem veem o indicador de notas confidenciais em serviços de Administração.
- Atualizar “Regras e Automação” e o respetivo histórico de alterações.

## Detalhes técnicos
- Criar uma consulta central de identificadores de serviços com nota, protegida pelas políticas de acesso existentes; o calendário recebe apenas a existência da nota, não o seu conteúdo.
- Reutilizar o mesmo indicador no cartão temporal e no cartão compacto mensal, sem alterar a estrutura ou a interação principal.

## Verificação
- Confirmar a compilação e os registos de execução.
- Validar visualmente um calendário com cartões de dimensões diferentes e confirmar que o ícone abre o detalhe do serviço.
