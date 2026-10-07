# Ajustes: legenda, seleção de datas, idioma e identidade

Os pontos 1 a 3 (permissões do Gestor, seleção múltipla de motoristas, formato DD/MM/AAAA) já foram implementados na iteração anterior. Este plano cobre os pontos 4 a 8 e a verificação final, sem alterar fluxos que já funcionam.

## 4. Legenda do calendário

- Remover por completo a entrada "Ausência" da legenda (`OccupationLegend`) e qualquer rótulo de ausência ainda usado nos blocos do calendário; passa a existir apenas "Indisponibilidade".
- Estados finais da legenda: Serviço (cor sólida do motorista), Deslocação calculada, Ajuste do motorista, Indisponibilidade.
- Diferenciação visual pedida:
  - Ajuste do motorista: mantém as riscas na própria cor do motorista (como está hoje).
  - Indisponibilidade: bloco cinzento translúcido com um subtom da cor do motorista, sem riscas — leitura imediata como "bloqueado" e claramente distinto do ajuste.
- A legenda usa exatamente os mesmos helpers de estilo dos blocos, garantindo correspondência 1:1 entre legenda e calendário.

## 5. Seleção direta de dias no calendário

- O título de data no cabeçalho do calendário (Agenda do Gestor/Proprietário, Assistente e Motorista) passa a ser um botão que abre um seletor de calendário (date picker PT-PT).
- Escolher um dia salta diretamente para essa data, respeitando a vista ativa (dia/semana/mês).
- Setas ← → e o botão "Hoje" mantêm-se.
- Clicar num dia da vista mensal continua a abrir esse dia, como já acontece.

## 6. Notificações e textos em PT-PT

- Revisão global de toasts, mensagens de erro, estados vazios e textos de diálogos.
- As mensagens em inglês vêm sobretudo dos erros técnicos da base de dados devolvidos diretamente ao utilizador (ex.: violações de permissões/conflitos). Passa a existir um tradutor central de erros que converte esses casos em mensagens PT-PT claras ("Sem permissão para alterar este registo", "Conflito de horário com outro serviço", etc.), com uma mensagem genérica de recurso.
- Aplicado nos pontos onde hoje se mostra a mensagem crua: autenticação, disponibilidade, serviços, ajuste de ocupação, administração.

## 7. Ícone da viatura (canto superior esquerdo)

- Substituir a marca atual no cabeçalho por um lockup profissional: ícone de viatura em traço fino, alinhado à tipografia da aplicação, acompanhado do nome "Driveboard".
- Atualizar o ícone do separador do browser (favicon) para o mesmo símbolo, eliminando qualquer aspeto de emoji.

## 8. Bug visual no "Ajustar ocupação"

- Diagnóstico ainda por confirmar: o realce azul aparece no calendário por trás do diálogo (o diálogo abre com `modal={false}`), sugerindo que o clique em "Ajustar ocupação" deixa um estado de seleção/arrasto ativo na grelha da semana.
- Primeiro passo: reproduzir o fluxo no browser e confirmar a origem (estado de arrasto residual, `:focus`/hover persistente, ou realce do seletor de data) antes de corrigir.
- Corrigir a causa (limpar o estado de arrasto/seleção ao abrir o diálogo, em vez de esconder o realce), e validar todo o fluxo: abrir → editar data/hora → guardar → estado correto no calendário após recarregar.

## Verificação final

- Fluxo de ajuste de ocupação testado ponta a ponta com persistência confirmada na base de dados.
- Filtro de motoristas do Assistente: todos, alguns, um, nenhum.
- Navegação direta por data nas três vistas.
- Legenda coerente com os estados reais e sem "Ausência".
- Verificação de que não sobram textos visíveis em inglês.

## Notas técnicas

- Ficheiros principais: `src/components/WeekCalendar.tsx` (legenda, estilos de indisponibilidade/ajuste, limpeza do estado de arrasto), `src/components/dashboards/*Dashboard.tsx` (seletor de data no cabeçalho), `src/components/AppShell.tsx` (marca), `src/components/ActivityDialog.tsx` e `src/components/AvailabilityDialog.tsx` (mensagens), novo utilitário de tradução de erros em `src/lib/`.
- Sem alterações de esquema na base de dados; apenas apresentação e mensagens.
