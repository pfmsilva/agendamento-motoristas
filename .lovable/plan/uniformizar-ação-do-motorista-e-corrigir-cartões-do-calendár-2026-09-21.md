# Uniformizar ação do Motorista e corrigir cartões do calendário

## Alterações

- Substituir a variação «Novo evento» do calendário do Motorista pelo mesmo padrão usado nos restantes calendários: ícone `CalendarPlus`, texto «Novo serviço» e classes responsivas equivalentes.
- Corrigir a composição interna dos blocos temporizados para adaptar o conteúdo à altura real disponível:
  - manter etiqueta, título e informação secundária com prioridades claras;
  - usar uma disposição compacta horizontal em zonas de serviço curtas, em vez de ocultar o título apenas por um limite fixo de altura;
  - manter a disposição completa nos blocos com espaço suficiente;
  - impedir que controlos de redimensionamento e `overflow` colapsem o texto em pequenos traços.
- Preservar cores, segmentos de deslocação/ajuste, etiquetas, privacidade por perfil, clique e redimensionamento.
- Atualizar a documentação funcional da página «Regras e Automação» e o histórico de alterações.

## Verificação

- Confirmar compilação e ausência de erros de execução.
- Verificar visualmente o botão do Motorista e cartões curtos/normais nas vistas Dia, Semana e Mês, em desktop e largura reduzida.
