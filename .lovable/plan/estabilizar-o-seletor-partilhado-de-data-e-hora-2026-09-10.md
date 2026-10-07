# Estabilizar o seletor partilhado de data e hora

## Objetivo
Restaurar o calendário visual anterior, substituir o seletor de hora por controlos simples e impedir qualquer deslocação horizontal durante a utilização.

## Alterações
- Recuperar o calendário limpo e clicável, mantendo datas em `DD/MM/AAAA` e texto PT-PT.
- Substituir as colunas de deslocamento por dois seletores compactos: horas `00–23` e minutos `00/15/30/45`.
- Usar uma caixa de dimensões fixas, ancorada ao botão durante todo o período em que está aberta, sem reposicionamento por colisão.
- Manter a largura e altura dos controlos estáveis quando a data ou a hora muda, evitando alterações no modal envolvente.
- Aplicar a correção nos componentes partilhados usados em Novo serviço, Novo evento, Ajustar ocupação e Encontrar motorista disponível.

## Verificação
- Confirmar seleção de data, hora, minutos, conclusão e fecho.
- Verificar que a caixa não muda lateralmente durante todas as interações.
- Confirmar formatos `DD/MM/AAAA` e `HH:mm` em ecrãs desktop e estreitos.
