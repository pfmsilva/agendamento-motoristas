# Uniformizar a cor Garagem nas Análises

## Objetivo
- Manter Administração em `#4F6D7A`.
- Alterar Garagem para `#AD6F5A` em toda a área de Análises.
- Preservar as cores dos motoristas e a lógica visual da Densidade horária.

## Implementação
- Atualizar o token semântico central de Garagem.
- Fazer com que TAGs associadas a Administração ou Garagem herdem a respetiva cor semântica, em vez da paleta genérica de TAGs.
- Aplicar essa resolução aos widgets configuráveis e às análises pré-definidas, incluindo “Serviços por motorista e TAG” e “Duração média por motorista e TAG”.
- Manter variantes de serviço, deslocação e ajuste derivadas das cores-base.
- Atualizar a regra funcional e o histórico de alterações.

## Verificação
- Confirmar que barras, segmentos, legendas, rótulos e indicadores dos tooltips usam `#AD6F5A` para Garagem.
- Confirmar que Administração continua em `#4F6D7A`, as cores dos motoristas não mudam e a Densidade horária permanece intacta.
- Validar a aplicação no ecrã das Análises e confirmar que não existem erros.

## Detalhes técnicos
- A associação tipo de evento ↔ TAG será usada para sobrepor apenas as cores das TAGs semânticas de Administração/Garagem.
- As restantes TAGs continuam a usar a sua paleta estável atual.
