# Férias numa faixa de dia inteiro

## Alterações

- Criar uma faixa compacta “Dia inteiro” entre os cabeçalhos dos dias e a grelha horária nas vistas diária, semana de trabalho e semana completa.
- Retirar as férias aprovadas da grelha horária e apresentá-las nessa faixa, mantendo o tratamento cinzento com subtom e contorno tracejado na cor do motorista.
- Mostrar em cada bloco a etiqueta “FÉRIAS”, o título/motivo e a indicação “Dia inteiro”, sem horários artificiais.
- Manter a faixa e os cabeçalhos visíveis quando a área das horas é deslocada para cerca das 07:00.
- Permitir que a faixa aumente apenas quando existirem vários eventos de dia inteiro no mesmo dia.
- Representar férias de vários dias em todos os dias abrangidos, com continuidade visual entre células adjacentes quando possível.
- Aplicar a alteração no componente partilhado por Proprietário, Gestor, Assistente, Administrador e Motorista, sem alterar permissões nem a vista mensal.

## Detalhes técnicos

- Separar a zona fixa superior da área com deslocação vertical, mantendo ambas sincronizadas na deslocação horizontal.
- Reutilizar `CalendarEventCard`, `vacationStyle` e a lógica atual de datas inclusivas.
- Preservar o início e a posição inicial da grelha horária, ignorando férias de dia inteiro no cálculo de deslocação.

## Verificação

- Confirmar compilação e ausência de erros em execução.
- Validar visualmente as vistas diária, semana de trabalho e semana completa, incluindo férias de vários dias e sobreposição de vários motoristas.
