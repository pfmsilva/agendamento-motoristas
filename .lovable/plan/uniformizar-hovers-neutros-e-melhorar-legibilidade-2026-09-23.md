# Uniformizar hovers neutros e melhorar legibilidade

## Resultado
- Estados de passagem do rato deixam de usar dourado e passam a usar o mesmo cinzento neutro claro em toda a aplicação.
- A linha de «Férias / Ausências registadas» mantém toda a informação e a ação «OK», sem cortes nem destaque dourado.
- Os eventos de «Viaturas de Empréstimo» aproveitam melhor a largura, mostram título e detalhes em linhas claras e só truncam quando o espaço é realmente insuficiente.

## Implementação
1. Ajustar os controlos partilhados para usarem o token neutro existente no hover, preservando dourado apenas nos estados com significado próprio.
2. Tornar a linha informativa de férias flexível e legível em larguras reduzidas, com quebra de texto e alinhamento estável da mensagem e do botão.
3. Reorganizar o conteúdo dos blocos de viaturas nas vistas Dia e Semana, com título primeiro, detalhes depois, espaçamento compacto, largura útil maior e tratamento específico para blocos estreitos.
4. Manter cores e padrões de alocação/inspeção, mas separar visualmente o texto do padrão sem alterar a lógica dos eventos.
5. Registar a alteração na documentação funcional e validar compilação e apresentação em desktop e ecrã estreito.

## Limites
- Sem alterações a regras, permissões, dados ou fluxos.
- Sem redesenhar outras áreas da aplicação.
