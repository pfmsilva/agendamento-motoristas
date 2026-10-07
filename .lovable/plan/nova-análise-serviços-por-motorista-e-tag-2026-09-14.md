# Nova análise: serviços por motorista e TAG

## O que vai existir
Uma nova análise disponível no catálogo de Análises: **Serviços por motorista e TAG**, em barras horizontais empilhadas.

- Uma barra por motorista; cada segmento colorido é uma TAG.
- O comprimento do segmento é o número de serviços desse motorista nessa TAG; a barra completa é o total do motorista.
- Nome do motorista à esquerda e total de serviços visível no fim da barra.
- Cor fixa por TAG, igual em toda a página de Análises.

## Interação
- **Tooltip** ao passar sobre um segmento: motorista, TAG, número de serviços, período selecionado e percentagem do total do motorista.
  Exemplo: `João Silva · TAG: Garagem · Serviços: 18 · 42% do total do motorista`.
- **Ordenação** (escolhida na configuração da análise): total de serviços (predefinição, decrescente), nome do motorista, ou serviços de uma TAG específica.
- **Modo de apresentação**: valores absolutos (predefinição) ou percentagem (cada barra vale 100%).
- **Legenda de TAGs** compacta, com quebra de linha, que aguenta muitas TAGs sem poluir.

## Filtros e período
Segue por omissão os filtros globais das Análises (período, motorista, Administrador, Assistente, TAG) e mantém a opção já existente de não seguir os filtros globais. Períodos: Semana, Mês, Semestre, Ano e Personalizado, com a navegação de período já existente.

## Comportamento no painel
Funciona como qualquer outra análise: adicionar, remover, duplicar, redimensionar, reordenar, editar e guardar configuração. Atualiza automaticamente quando um serviço é criado, editado, reatribuído, muda de TAG ou é eliminado, usando os mesmos dados operacionais do calendário e do resto das Análises. Não há dados analíticos paralelos.

## Permissões
Usa exclusivamente os dados já autorizados ao utilizador; nenhum serviço, motorista ou TAG fica visível nas Análises se não estiver acessível no resto da aplicação. Sem alterações à base de dados nem às regras de acesso.

## Notas técnicas
- `src/lib/analytics-builder.ts`: nova métrica `services_by_tag` (unidade número, visualização `stacked`, dimensão `tag`) e função de paleta estável por TAG (índice determinístico a partir de `sort_order`/`id` sobre os tokens de cor existentes).
- Novo `src/components/analytics/TagServicesChart.tsx`: barras horizontais empilhadas (Recharts), tooltip PT-PT, legenda, modos absoluto/percentagem, ordenação.
- `AnalyticsWidget.tsx`: encaminha `metric_key === "services_by_tag"` para o novo gráfico; recebe as TAGs via `useEventTags`.
- `WidgetDialog.tsx`: campos de ordenação e modo, guardados em `analytics_widgets.config` (sem migração).
- `src/lib/spec/content.ts`: nova regra em Análises e entrada em `SPEC_CHANGES`.
