# Novos destinos criados pelo assistente

O assistente deixa de ficar bloqueado quando o destino do serviço ainda não existe. Cria o destino no momento, o serviço é gravado normalmente, e o Proprietário e o Gestor são avisados para configurar o tempo de deslocação.

## 1. Criar destino a partir do formulário de serviço

- No seletor de cidade, quando a pesquisa não encontra resultados, passa a aparecer a opção "Adicionar «Braga»".
- Ao escolher essa opção, a cidade é criada de imediato com tempo de deslocação por configurar e fica logo selecionada no formulário.
- O serviço é gravado normalmente, sem qualquer bloqueio nem passo extra.
- Nomes repetidos não criam duplicados: se a cidade já existir (mesmo com maiúsculas/acentos diferentes), é reutilizada a existente.

## 2. Aviso ao Proprietário e ao Gestor

- Assim que um destino é criado sem tempo de deslocação, todos os Proprietários e Gestores recebem a notificação: "Novo destino sem tempo de deslocação: Braga".
- Abrir a notificação leva diretamente à área Cidades e deslocações, com esse destino em destaque e pronto a editar.
- A notificação é enviada uma vez por destino (não se repete a cada serviço criado para a mesma cidade).

## 3. Configurar o tempo depois

- Na lista de cidades, os destinos por configurar aparecem no topo com a etiqueta "Por configurar", para não passarem despercebidos.
- Ao gravar o tempo de deslocação, todos os serviços dessa cidade — passados e futuros — são recalculados automaticamente e o calendário passa a mostrar a deslocação para toda a gente.
- Mantém-se um único tempo, igual à ida e à volta, como já acontece hoje.

## 4. Entretanto, no calendário

- Enquanto o tempo não estiver configurado, o serviço aparece como um serviço normal, sem bloco de deslocação e sem marca especial. Só a notificação avisa.

## Notas técnicas

- Migração: função `security definer` `create_city_pending(name)` que insere a cidade (`travel_minutes = 0`, marcada como pendente através de uma nova coluna `travel_configured boolean default false`), devolve a existente quando há correspondência por nome normalizado, e notifica proprietários e gestores via `notify()`. Executável por `authenticated`; a política de escrita direta em `cities` continua restrita a gestor/proprietário.
- Migração: trigger em `cities` que, quando `travel_minutes` muda e `travel_configured` passa a verdadeiro, faz `UPDATE` nas `activities` dessa cidade para reexecutar `compute_activity_occupation()` (recalculando `calculated_occupation_start/end` sem tocar em `driver_adjusted_*`).
- Frontend: `CityCombobox.tsx` ganha ação de criação no estado vazio; `src/lib/data.ts` ganha `useCreatePendingCity()` com invalidação de `cities`, `activities` e `notifications`; `admin.tsx` ordena e etiqueta cidades pendentes e aceita `?city=<id>` vindo da notificação; `AppShell.tsx` encaminha a notificação para essa rota.

## Testes

Criar serviço com destino novo enquanto assistente; confirmar gravação, notificação ao proprietário e ao gestor, ausência de deslocação no calendário; configurar o tempo e confirmar que a deslocação passa a aparecer nesse serviço e nos restantes da mesma cidade, para todos os perfis.
