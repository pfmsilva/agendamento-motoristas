# Ajustes no formulário de serviço e no seletor de cidade

## 1. Remover o campo "Estado"

No diálogo de Novo/Editar serviço existe atualmente um seletor "Estado" (Rascunho/Confirmado/Cancelado). Vai ser removido:

- Retira-se o bloco visual do formulário; a grelha reorganiza-se sozinha (sem espaços vazios), passando "Início do serviço" a ocupar o lugar seguinte a "Cidade do serviço".
- Os serviços novos continuam a ser criados como "Confirmado" (valor por omissão); ao editar, o estado atual do serviço é preservado tal como está.
- O cancelamento de um serviço continua a fazer-se pelo botão "Cancelar serviço" já existente no rodapé do diálogo, que é a via correta (dispara notificações e auditoria).
- Remove-se o estado interno e os imports que deixam de ser usados no diálogo.

## 2. Restaurar o seletor de data e hora

Diagnóstico confirmado: o campo de data/hora deixou de ter calendário quando o campo nativo foi substituído pelo componente de escrita em formato PT-PT (DD/MM/AAAA HH:MM). Esse componente só aceita texto — não abre calendário nem seletor de horas.

Correção:

- O campo de data/hora passa a ter, além da escrita manual em DD/MM/AAAA HH:MM, um botão de calendário que abre o seletor de dia já usado noutras zonas da aplicação, mais a escolha da hora (horas e minutos em intervalos de 15 minutos).
- Escolher um dia mantém a hora já indicada; escolher a hora mantém o dia. Se ainda não houver nada preenchido, assume-se o dia atual com hora redonda seguinte.
- Aplica-se aos campos "Início do serviço" e "Fim do serviço"; ao alterar o início, o fim continua a seguir a mesma lógica que já existia.
- Nada muda no formato guardado, pelo que a data/hora fica gravada na base de dados e aparece no calendário exatamente como antes.
- Os restantes sítios que usam este campo (ausências, indisponibilidades, delegações, filtros) ganham o mesmo calendário sem alterações de layout.

## 3. Hover do "Selecionar cidade"

O botão do seletor de cidade usa o estilo genérico de contorno, cujo hover pinta o fundo com o dourado de acento. Passa a usar um realce neutro (cinzento claro da paleta, o mesmo dos restantes campos), tanto no botão como no realce das opções da lista ao passar o rato/navegar com o teclado. O dourado mantém-se inalterado em todos os outros elementos onde é intencional.

## Verificação

Depois das alterações, testo em execução:

1. Abrir "Novo serviço" e confirmar que "Estado" desapareceu e o formulário fica bem alinhado.
2. Criar um serviço escolhendo data e hora pelo calendário e confirmar que fica gravado e aparece no calendário na posição certa.
3. Passar o rato sobre "Selecionar cidade" e sobre as opções da lista e confirmar que já não fica dourado.

## Notas técnicas

- `src/components/ActivityDialog.tsx`: remover o bloco "Estado", o estado `status` deixa de ser editável (mantém-se o valor do registo ou `confirmed` em criação), remover imports `ACTIVITY_STATUSES`/`STATUS_LABEL` se ficarem sem uso.
- `src/components/DateInput.tsx`: acrescentar `Popover` + `Calendar` (react-day-picker já instalado, locale `pt`) e seletores de hora/minuto, mantendo o contrato `value`/`onChange` em ISO (`AAAA-MM-DD` / `AAAA-MM-DDTHH:MM`).
- `src/components/CityCombobox.tsx`: substituir o hover herdado do `variant="outline"` por classes neutras (`hover:bg-surface-2`/`hover:text-foreground`) e neutralizar `data-[selected=true]:bg-accent` nos `CommandItem` apenas neste componente, sem tocar em `src/components/ui/*`.
