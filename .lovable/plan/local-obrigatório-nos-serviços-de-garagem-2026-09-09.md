# Local obrigatório nos serviços de Garagem

## Alterações
- Mostrar o campo **Local** entre **Título** e **Motorista** quando o tipo selecionado for Garagem, reutilizando a pesquisa e criação de cidades já existente.
- Exigir um local na validação do formulário e apresentar exatamente: “Selecione o local do serviço.”
- Guardar a cidade escolhida no evento de Garagem e usá-la no cálculo da ocupação e da deslocação do motorista.
- Manter o fluxo existente para locais novos sem tempo configurado: criação pendente, aviso ao Gestor/Proprietário e indicação de configuração em falta.
- Atualizar a função segura de criação de eventos de Garagem para validar e conservar o local, sem alterar os restantes tipos de evento.

## Validação
- Confirmar a ordem dos campos e os estados com e sem local.
- Confirmar que um local configurado elimina o aviso de cidade em falta e aplica o tempo de deslocação.
- Confirmar que um local novo continua marcado como pendente.
