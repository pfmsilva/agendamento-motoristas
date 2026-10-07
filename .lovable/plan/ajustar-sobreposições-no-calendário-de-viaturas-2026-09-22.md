# Ajustar sobreposições no calendário de viaturas

## Resultado
- Os blocos mantêm a sua cor original ao passar o rato, usando apenas contorno/sombra discreta e cursor.
- Uma alocação permanente é recortada visualmente pelos eventos temporários, sem alterar o respetivo registo.
- Eventos temporários podem ser criados dentro de uma alocação permanente; conflitos entre eventos do mesmo nível continuam bloqueados.

## Implementação
1. Atualizar a validação existente na aplicação e na base de dados para tratar a alocação permanente como intervalo de fundo: permitir alocações temporárias e inspeções dentro dela, mantendo bloqueios entre permanentes e entre temporários incompatíveis.
2. Calcular segmentos visíveis da alocação permanente por viatura e dia, subtraindo a união dos intervalos temporários.
3. Usar esses segmentos na vista Dia; nas vistas Semana e Mês, calcular ocupação sem dupla contagem e omitir a permanente quando um evento cobre todo o período visível, mantendo todos os registos acessíveis no detalhe.
4. Remover a mudança de preenchimento no hover de todos os eventos e conservar feedback apenas por contorno/sombra.
5. Atualizar «Regras e Automação» e validar criação/conflitos, Dia/Semana/Mês e compilação.

## Regras preservadas
- Nenhum registo de alocação permanente é dividido, encurtado ou duplicado na base de dados.
- Auditoria, permissões, cancelamento, gestão de viaturas e detalhe diário permanecem inalterados.
