# Alerta persistente para cidades por configurar

Objetivo: Proprietário e Gestor perceberem de imediato que existe uma cidade nova sem tempo de deslocação, mesmo depois de fecharem a notificação.

## Comportamento

- Notificação ao Proprietário e ao Gestor quando é criada uma cidade nova a partir do formulário de serviço (já existe; fica inalterada).
- **Ponto de alerta no menu "Administração"** (cabeçalho no computador e menu lateral no telemóvel): pequeno ponto/badge com o número de cidades por configurar, visível apenas a Proprietário e Gestor.
- **Ponto de alerta no separador "Cidades e deslocações"** dentro da Administração, com a mesma contagem.
- **Aviso no topo do painel de cidades**: linha curta do tipo "1 cidade precisa de tempo de deslocação." com as cidades listadas primeiro (a ordenação já existe).
- **Estado da cidade**: a etiqueta actual passa a ler-se "Configuração necessária" enquanto não houver tempo de deslocação; ao guardar um tempo válido a etiqueta desaparece e a cidade fica normal.
- Os indicadores desaparecem automaticamente quando a última cidade pendente for configurada; com várias pendentes mantêm-se até estarem todas feitas.
- Sem alterações a permissões, a quem cria cidades ou ao cálculo de deslocações.

## Detalhes técnicos

1. Novo hook `usePendingCitiesCount()` em `src/lib/data.ts` (deriva de `useCities()`: `!travel_configured && !is_base && active`), para reutilização no cabeçalho e na administração. A tabela `cities` já é legível por qualquer utilizador autenticado, e a query `["cities"]` já é invalidada/sincronizada em tempo real, por isso o contador actualiza sozinho ao guardar.
2. `src/components/AppShell.tsx`: nos dois links "Administração" (nav desktop e sheet mobile), envolver o texto num `relative inline-flex` com um badge/ponto (`bg-leave`/`text-leave-foreground` conforme tokens existentes) renderizado quando `count > 0` e o utilizador é `owner`/`manager`; incluir `aria-label`/`title` em PT-PT ("N cidade(s) por configurar").
3. `src/routes/_authenticated/admin.tsx`:
   - `TabsTrigger value="cities"` passa a mostrar o mesmo ponto/contagem.
   - `CitiesPanel` mostra a linha de aviso quando existirem pendentes.
   - `CityRow`: texto da badge de "por configurar" para "Configuração necessária".
4. Verificação: typecheck, build e leitura rápida à base de dados para confirmar cidades com `travel_configured = false`.
