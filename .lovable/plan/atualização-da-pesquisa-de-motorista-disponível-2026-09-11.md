# Atualização da pesquisa de motorista disponível

## Objetivo
Tornar os resultados do modal sempre coerentes com os critérios visíveis e acrescentar a carga mensal efetiva de cada motorista, calculada no servidor.

## Alterações
- Remover o botão “Pesquisar” e recalcular automaticamente após alterações à data, horas ou local, com um pequeno atraso para evitar pedidos repetidos.
- Manter ocupação prevista, deslocação, estados, ordenação, avisos e compromissos próximos sincronizados com os valores atuais do formulário.
- Criar uma consulta protegida no servidor que devolve, para cada motorista visível, os minutos já ocupados no mês civil selecionado.
- Somar apenas eventos existentes e não cancelados, usando o intervalo efetivo final já usado pelo calendário: ajuste manual, senão ocupação calculada, senão horário do serviço.
- Cortar cada intervalo aos limites do mês para contar apenas a parte efetivamente dentro desse mês e evitar duplicar serviço e ajuste.
- Mostrar “Horas no mês: 82h 30min” diretamente em cada cartão e atualizar o valor quando a data muda de mês.
- Não incluir o serviço em pesquisa, porque ainda não existe nem foi gravado.
- Tratar carregamento e falhas sem deixar resultados antigos associados a novos critérios.

## Regras e documentação
- Atualizar “Regras e Automação” com a atualização automática, a definição de horas mensais e a nota de implementação equivalente em Django.
- Acrescentar a alteração ao histórico funcional e incluir uma verificação leve da coerência desta regra, quando aplicável.

## Validação
- Confirmar tipos e compilação.
- Testar no modal a atualização automática por data, horas e cidade.
- Confirmar mudança de totais ao trocar de mês e ausência do botão “Pesquisar”.
