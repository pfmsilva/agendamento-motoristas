# Avisos de conflito de disponibilidade em toda a aplicação

Objetivo: sempre que se escolhe um motorista para um serviço, o sistema avisa de forma clara e específica se esse motorista está de férias/ausente ou marcado como indisponível nesse período — antes de confirmar.

## O que já existe (verificado no código)

- O cálculo de disponibilidade já cruza serviços, ausências (`time_off`) e indisponibilidades (`unavailability`) e devolve três estados: disponível, condicional, indisponível.
- Esse aviso só aparece com detalhe em dois sítios: o formulário de serviço (Novo/Editar) e "Encontrar motorista disponível".
- As mensagens são frases soltas numa lista única: uma ausência e uma indisponibilidade aparecem com o mesmo aspeto, sem distinção visual nem rótulo próprio.
- No seletor "Motorista" do formulário, a lista de nomes não dá qualquer indicação de conflito — só se descobre depois de escolher.

## Alterações propostas

### 1. Conflitos classificados (base comum)

O motor de disponibilidade passa a devolver, além do texto, o **tipo** de cada conflito:

- **Férias / ausência** (inclui baixa médica, pessoal, outro) — texto do tipo: "Este motorista está de férias de 12/09/2026 a 20/09/2026."
- **Indisponibilidade** — "Este motorista está marcado como indisponível de 12/09/2026 10:00 a 12/09/2026 14:00 (motivo)."
- **Serviço sobreposto** — mantém a mensagem atual de sobreposição.
- **Condicional** — margem curta entre serviços, cidade sem tempo de deslocação, etc.

Todos os ecrãs passam a usar esta mesma classificação, garantindo linguagem idêntica em toda a aplicação.

### 2. Painel de aviso único e reutilizável

Novo componente de aviso, usado em todos os pontos onde se atribui um serviço:

- Cabeçalho com o estado (Indisponível / Condicional).
- Conflitos agrupados por tipo, com etiqueta e ícone próprios: "Férias/Ausência", "Indisponibilidade", "Serviço sobreposto".
- Cores distintas: bloqueio a vermelho, ausência com a cor de ausência já existente na legenda, avisos condicionais a âmbar.

### 3. Aviso no momento da escolha do motorista

No formulário de serviço (Novo e Editar):

- A lista do seletor "Motorista" passa a mostrar, por cada nome, uma etiqueta do estado para o período já indicado (Férias, Indisponível, Ocupado, Condicional). Assim o conflito é visível **antes** de escolher.
- Depois de escolher, o painel de aviso detalhado aparece imediatamente e atualiza-se sempre que se muda a data, a hora, a cidade ou o motorista.

### 4. Confirmação explícita antes de gravar

- Com conflito de férias ou indisponibilidade, gravar exige confirmar uma caixa que nomeia o conflito ("Confirmo que o motorista está de férias neste período e quero avançar"). Quem não tem permissão para forçar continua bloqueado, agora com a razão específica.
- Ao gravar com conflito confirmado, aparece ainda um pedido final de confirmação a resumir o conflito, para evitar atribuições acidentais.

### 5. Restantes pontos onde se atribui serviço

- **"Encontrar motorista disponível"**: cada motorista da lista passa a mostrar o motivo separado por tipo (Férias / Indisponível / Sobreposição), e escolher um motorista indisponível leva o aviso já preenchido para o formulário.
- **Calendário (arrastar/clicar numa célula para criar serviço)**: o serviço abre no formulário já com o aviso do motorista dessa linha, se existir conflito.
- **Painéis de gestor/assistente**: o cartão de cada motorista distingue "De férias" de "Indisponível" em vez do rótulo genérico atual.
- **Vista do motorista**: ao ajustar a sua ocupação, é avisado se essa janela cair sobre férias ou indisponibilidade suas.

### 6. Coerência

- Mesmos textos, ícones e cores em todos os ecrãs, tudo em português de Portugal e usando os tokens de cor existentes.
- Sem alterações à base de dados: a validação no servidor mantém-se como está; isto é a camada de aviso ao utilizador.

## Notas técnicas

- `src/lib/scheduling.ts`: `evaluateAvailability` passa a devolver `conflicts: { kind: "timeoff" | "unavailability" | "activity" | "conditional"; message: string }[]`, mantendo `reasons: string[]` derivado para compatibilidade; `conflictsFor` e `computeState` reutilizam a mesma classificação; novo `driverStatusBadge(driverId, start, end, data)` para etiquetas rápidas na lista.
- Novo `src/components/AvailabilityWarning.tsx` (painel agrupado) e `src/components/DriverStatusBadge.tsx`.
- `ActivityDialog.tsx`: etiquetas nos `SelectItem`, painel novo, checkbox de confirmação com texto dependente do tipo de conflito, `AlertDialog` de confirmação final.
- `FindDriverDialog.tsx`, `ManagerDashboard.tsx`, `AssistantDashboard.tsx`, `DriverDashboard.tsx`: passam a usar o painel/etiquetas comuns.

## Verificação

Com dados reais na aplicação: criar férias e uma indisponibilidade para um motorista, depois tentar criar e editar um serviço nesse período a partir do formulário, do calendário e de "Encontrar motorista disponível", confirmando que o aviso correto aparece antes de gravar e que a distinção férias/indisponibilidade é clara.
