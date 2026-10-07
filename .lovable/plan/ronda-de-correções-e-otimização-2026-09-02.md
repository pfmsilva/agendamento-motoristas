# Ronda de correções e otimização

## 1. Indisponibilidade por clique direto no calendário (Motorista)

Hoje o `WeekCalendar` já emite um evento quando se clica numa célula vazia (`onSlotClick`), mas o painel do Motorista não o utiliza — só o Gestor e o Assistente o fazem (para criar serviços).

- No painel do Motorista, ligar o clique numa célula livre à abertura do formulário de indisponibilidade.
- A data clicada e a hora da célula passam pré-preenchidas; nesse caso o formulário abre em modo "por horas" (não dia inteiro), com fim = início + 1 hora.
- O botão "Registar indisponibilidade" mantém-se exatamente como está e continua a abrir o formulário vazio (dia inteiro por omissão).
- Clicar num bloco existente continua a fazer o que já faz hoje (ajuste de ocupação).

## 2. Campos de hora truncados

Causa: no formulário de indisponibilidade os dois campos de hora estão dentro de uma grelha de 2 colunas colocada dentro de outra grelha de 2 colunas, o que reduz cada campo a menos de metade da largura e corta o relógio nativo.

- Reestruturar a grelha do formulário para que Início e Fim ocupem cada um uma coluna completa (a linha toda em ecrãs pequenos).
- Definir uma largura mínima para o campo de hora, sem reduzir o tamanho de letra.
- Verificar os restantes formulários que usam o mesmo campo de hora (serviço, delegações, filtros) e aplicar a mesma correção onde exista o mesmo aperto.

## 3. Remover a palavra "Ocupação" do calendário

- Nos blocos do calendário, mostrar apenas o intervalo horário do ajuste (ex.: `08:30–12:00`), sem o prefixo "Ocupação".
- Nenhuma alteração aos cálculos de ocupação efetiva nem à deteção de conflitos.
- A legenda de cores mantém-se para explicar serviço / deslocação / ajuste.

## 4. Revisão PT-PT de todas as mensagens

- Rever textos de interface, toasts, confirmações e estados vazios; o texto da aplicação está já quase todo em PT-PT.
- Restam mensagens em inglês geradas no backend: notificações automáticas ("Activity moved to another driver") e erros de validação antigos ("End time must be after start time", "Not allowed to approve or reject time off requests", "Not allowed to cancel this request"). Serão traduzidas por migração da base de dados.
- Reforçar o tradutor de erros do frontend com os padrões em falta, para nunca escapar inglês ao utilizador.
- Português europeu em todo o texto (ex.: "guardar", "eliminar", "ecrã", "utilizador").

## 5. Otimização e qualidade do código

Análise feita ao código atual. Intervenções propostas, todas sem alterar comportamento:

- **Sincronização em tempo real**: a subscrição invalida a auditoria em qualquer alteração de qualquer tabela; passar a invalidar apenas as chaves afetadas e agrupar invalidações próximas no tempo (debounce curto) para evitar rajadas de consultas.
- **Listeners**: confirmar a limpeza de `online` / `focus` / `visibilitychange` e do canal em todos os caminhos de desmontagem, incluindo troca de sessão.
- **Calendário**: memorizar o cálculo de faixas/sobreposições por dia e evitar recriar funções de arrasto a cada render; extrair o bloco de atividade para componente memoizado. É o maior ganho de desempenho disponível.
- **Objetos de dados**: no painel do Motorista (e equivalentes) o objeto `data` é recriado a cada render e invalida memos a jusante; estabilizar com `useMemo`.
- **Dependências de efeitos**: corrigir os `eslint-disable react-hooks/exhaustive-deps` existentes com dependências corretas em vez de silenciar o aviso.
- **Reutilização**: cabeçalho de navegação de datas (setas + Hoje + seletor + separadores de vista) está repetido em quatro painéis; extrair para um componente único partilhado.
- **Consultas**: remover leituras duplicadas de tabelas já em cache e garantir tempos de cache coerentes entre listas estáticas (cidades, motoristas) e dados operacionais.

Não haverá refatorações estéticas de código que já funciona corretamente.

## 6. Testes finais

Verificação real na aplicação: clique no calendário do Motorista → formulário abre com data/hora corretas → gravar → indisponibilidade visível no calendário; botão antigo continua a funcionar; campos de hora totalmente visíveis em ecrã pequeno e grande; ausência de texto em inglês; sem regressões visuais ou de desempenho.

## Notas técnicas

- Ficheiros principais: `src/components/dashboards/DriverDashboard.tsx`, `src/components/AvailabilityDialog.tsx`, `src/components/WeekCalendar.tsx`, `src/lib/data.ts`, `src/lib/errors.ts`.
- Uma migração da base de dados para traduzir as mensagens de exceção e de notificação ainda em inglês.
