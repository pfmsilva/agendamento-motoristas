# Aplicação totalmente responsiva (telemóvel, tablet, portátil, computador)

Objetivo: adaptar a interface a ecrãs pequenos sem alterar o aspeto atual em computador e sem remover funcionalidades.

## Navegação

- Cabeçalho: em ecrãs pequenos os links passam para um menu lateral deslizante (ícone de menu), com Agenda, Análises e Administração conforme o perfil.
- O nome/email do utilizador e o perfil passam para dentro desse menu; sino de notificações e terminar sessão continuam sempre visíveis e com área de toque confortável.
- Painel de notificações ajusta a largura ao ecrã (deixa de ter largura fixa).
- Margens da página reduzidas no telemóvel (mantidas no computador).

## Calendário

- Em telemóvel a grelha semanal deixa de ser espremida: passa automaticamente para a vista de **Dia**, com navegação por setas e seletor de data.
- Alternativa de leitura rápida: separador de vistas convertido em seletor compacto (Dia / Semana de trabalho / Semana completa / Mês) para não transbordar.
- Vista de Mês adaptada: células mais compactas, indicador "+N" continua a abrir o dia/semana.
- Todas as ações mantêm-se: ver, criar, editar, ajustar duração (arrastar), ver motorista, mudar de data, clicar em espaços vazios.
- Nas vistas de semana em tablet/telemóvel, a grelha mantém deslize horizontal apenas dentro do próprio calendário (nunca a página inteira).

## Tabelas e listas

- Extrato de auditoria e lista de utilizadores/equipa: em telemóvel passam a cartões empilhados (mesmos dados e ações); em ecrãs maiores mantêm-se as tabelas atuais.
- Filtros (pesquisa, estado, perfil, filtros do extrato) empilham a largura total no telemóvel.

## Formulários e janelas

- Todas as janelas (serviço, disponibilidade, edição de utilizador, delegações, procurar motorista, confirmações) ficam dentro do ecrã, com deslize vertical interno e botões em coluna e largura total no telemóvel.
- Campos, seletores de data/hora e listas de escolha ocupam a largura disponível e têm altura de toque adequada.

## Painéis e indicadores

- Grelhas de indicadores e cartões dos painéis (Proprietário, Gestor, Assistente, Motorista) e da página Análises empilham em 1–2 colunas no telemóvel; gráficos ajustam a altura.

## Verificação

Testes em 1920×1080, 1440×900, 1024×768, 768×1024, 390×844 e 375×812, em todas as páginas principais (entrada, agenda, análises, administração e respetivas janelas), procurando deslize horizontal, conteúdo cortado, sobreposições, botões fora do ecrã e texto ilegível.

## Notas técnicas

- Apenas alterações de apresentação: pontos de rutura Tailwind (`sm:`/`md:`/`lg:`) e um hook `useIsMobile` para escolher vistas alternativas; a lógica de dados, permissões e conflitos mantém-se intacta.
- Ficheiros previstos: `AppShell.tsx`, `CalendarNav.tsx`, `WeekCalendar.tsx`, `AuditPanel.tsx`, `admin/UsersPanel.tsx`, `admin/UserEditDialog.tsx`, `ActivityDialog.tsx`, `AvailabilityDialog.tsx`, `DelegationDialog.tsx`, `FindDriverDialog.tsx`, `StatGrid.tsx`, painéis em `dashboards/`, `routes/_authenticated/admin.tsx`, `analytics.tsx`, `app.tsx`, `auth.tsx`, `index.tsx`, e `ui/dialog.tsx` (largura/altura em ecrãs pequenos).
- Sem alterações a base de dados, autenticação ou identidade visual.
