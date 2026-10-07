# Correções — ocupação, disponibilidade, delegações, notificações e paleta

Passagem de correção sobre a aplicação existente. Nada é reconstruído de raiz.

## O que encontrei (verificado no código e na base de dados)

- **Ajuste do motorista não persiste**: o `update` a `activities` (`driver_adjusted_start/end`) não pede confirmação de linhas afetadas (`.select()`) nem verifica quantas linhas mudaram. Se as regras de segurança ou um gatilho bloquearem a alteração, a aplicação mostra "Ocupação ajustada" na mesma. Além disso, o gatilho de conflitos corre **antes** do gatilho que recalcula a ocupação (ordem alfabética dos gatilhos), pelo que a validação usa valores desatualizados e pode rejeitar o ajuste do próprio motorista.
- **A distinção de valores já existe na base de dados** e está correta: serviço, ocupação calculada, ajuste do motorista e ocupação efetiva (coluna calculada automaticamente). Não é preciso mudar o modelo aqui — só garantir que a gravação chega lá.
- **Delegação não funciona**: a regra de segurança exige que o registo indique o assistente de origem, mas o formulário nunca o envia, pelo que a inserção é sempre recusada.
- **Ausência vs indisponibilidade** são hoje dois botões, dois formulários e duas listas separadas no ecrã do motorista, com listas só de leitura (sem editar nem apagar).
- **Estado do motorista** é calculado sem dependência do dia/hora selecionados nos painéis de gestor, dando um rótulo global.

## O que vou fazer

### 1. Ajuste de ocupação do motorista (persistência real)
- A gravação passa a devolver a linha atualizada e a falhar com erro visível se nada for gravado (fim do "sucesso falso").
- Corrigir a ordem dos gatilhos na base de dados para que a ocupação seja recalculada antes da verificação de conflitos.
- Permitir explicitamente que o motorista alargue/encurte a sua própria ocupação sem ser bloqueado pelo seu próprio serviço, mantendo o bloqueio quando há choque real com outro serviço.
- Manter serviço e ocupação calculada intactos; o ajuste fica em campos próprios e é registado no histórico de auditoria (já existente).
- Após gravar, a lista, o calendário e todas as vistas recarregam do servidor; o ajuste sobrevive a navegação, refresh e novo login.
- O arrastar do bloco continua a abrir a confirmação; "Guardar ajuste" passa a gravar mesmo.

### 2. Disponibilidade do motorista: um só conceito
- Substituir os dois botões por um único fluxo **"A minha disponibilidade"**.
- Formulário único: data de início, data de fim, opção **Dia inteiro**, e horas apenas quando não for dia inteiro; motivo/tipo e notas.
- Dia inteiro (um ou vários dias) bloqueia o dia completo no calendário e nos cálculos de disponibilidade.
- Internamente continua a usar as tabelas existentes (períodos por datas para dias inteiros, períodos por horas para blocos parciais) — sem alterar o modelo de dados nem as regras de segurança.

### 3. Lista "A minha disponibilidade" com editar e apagar
- Lista única e ordenada dos períodos do motorista, com etiqueta "Dia inteiro" ou intervalo horário.
- Ações **Editar** e **Eliminar** por linha, com gravação/eliminação confirmadas na base de dados (contagem de linhas verificada).
- Depois de eliminar: desaparece da lista, do calendário, deixa de bloquear disponibilidade e de gerar conflitos.

### 4. Estado contextual do motorista (dia/hora selecionados)
- Deixa de existir estado global permanente.
- O estado é calculado para o dia selecionado e, quando existe intervalo horário, para esse intervalo:
  - **Disponível** — sem bloqueio conhecido no período;
  - **Condicional** — sem bloqueio confirmado mas com incerteza (margem configurada, deslocação desconhecida);
  - **Indisponível** — sobreposição com ocupação efetiva, ausência ou indisponibilidade.
- Clicar num dia no calendário/gestor recalcula imediatamente os estados de todos os motoristas.
- A ocupação efetiva usada inclui deslocação e ajustes do motorista, também em "Encontrar motorista disponível".
- Mostrar, no cartão do motorista do dia selecionado, as janelas livres/ocupadas em vez de um rótulo único.

### 5. Delegações do assistente
- Enviar o assistente de origem no registo e validar antes de submeter.
- Erros de gravação passam a ser visíveis; sucesso só depois da confirmação da base de dados.
- Confirmar que o assistente delegado ganha acesso operacional (ver calendário, criar, editar e cancelar serviços) enquanto a delegação estiver ativa, e perde o acesso automaticamente no fim — controlado pelas regras de segurança da base de dados, não pelo frontend. O assistente original mantém o acesso.
- A delegação não cria atribuição permanente.

### 6. Notificações
- Painel com largura adequada, texto completo com quebra de linha (sem cortes), lista com scroll vertical, marcar todas como lidas e dispensar individualmente — mantendo o comportamento já existente de não reaparecerem depois de lidas.

### 7. Paleta e coerência visual
- Reequilibrar os tokens de cor: azul como família dominante (#023F5A principal, #002C44, #416F84, #819FAD, #C0CFD6), dourado #9B7D40 apenas como acento pontual; fundos brancos/neutros frios.
- Manter a hierarquia do calendário na mesma família: serviço azul escuro, deslocação azul médio, ajuste azul muito claro.
- Revisão transversal (barra lateral, botões, cartões, tabelas, calendário, etiquetas, estados, notificações, formulários, diálogos, menus) usando apenas tokens — sem cores soltas por componente.

### 8. Testes
- Motorista: arrastar, gravar ajuste, refresh, editar, criar período de dia inteiro e parcial, eliminar.
- Assistente: delegar, acesso do delegado, expiração, acesso do original.
- Gestor: mudar de dia, estados por dia e por hora, bloqueios parciais e de dia inteiro, deslocação e ajustes considerados.
- Notificações: texto longo, várias, scroll, dispensar, refresh.

## Notas técnicas

- Alterações de base de dados: recriar gatilhos de `activities` por ordem correta; afinar a validação de conflitos para o ajuste do próprio motorista. Sem desativar RLS, sem tornar tabelas públicas, sem expor credenciais.
- Políticas de segurança afetadas: apenas revisão/afinação das existentes para ajuste do motorista e delegações; permissões de leitura mantêm-se.
- Frontend: todas as gravações passam a confirmar linhas afetadas antes de mostrar sucesso.

## Relatório final

No fim entrego: o que estava avariado, o que mudou, alterações à base de dados, políticas afetadas, o que foi testado e problemas remanescentes.
