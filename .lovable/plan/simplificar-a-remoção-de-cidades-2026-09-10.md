# Simplificar a remoção de cidades

## Alterações
- Mostrar em **Administração → Cidades e deslocações** apenas cidades ativas, sem etiquetas de removida, área de arquivo ou ação de reposição.
- Manter uma única ação **Remover** para cidades não-base; após sucesso, a linha desaparece imediatamente da lista.
- Continuar a fazer remoção segura por desativação interna, preservando o mesmo registo e todas as ligações a serviços, auditoria e análises históricas.
- Manter cidades removidas fora das opções de novos serviços. Num registo histórico já associado, conservar o nome necessário para leitura e edição sem permitir escolhê-la de novo.

## Validação
- Confirmar que remover uma cidade atualiza imediatamente a lista e não oferece reposição.
- Confirmar que a cidade deixa de surgir nas novas seleções.
- Confirmar que serviços e relatórios históricos continuam a apresentar a cidade associada.
