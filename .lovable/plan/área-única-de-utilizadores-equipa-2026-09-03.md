# Área única de Utilizadores (Equipa)

Hoje a Administração tem um separador "Pessoas" com duas listas independentes (Motoristas e Assistentes), um separador "Atribuições" e um separador "Utilizadores" recente. Isto cria três formas diferentes de representar a mesma pessoa. O plano funde tudo numa única área.

## O que passa a existir

**Separador único "Utilizadores"** (substitui Pessoas, Atribuições e o painel atual de utilizadores)

Lista com colunas simples: Nome · Email · Perfil · Estado · Editar.

- Contas pendentes aparecem no topo, com marca visual clara e contador.
- Fichas antigas ainda sem conta associada (motoristas/assistentes criados no passado) aparecem na mesma lista, marcadas como "Sem conta", para não se perder nada.
- Filtro/pesquisa por nome ou email e distinção ativo/inativo.
- Não há mais botão "Adicionar assistente" nem "Adicionar motorista": a pessoa cria conta e o Proprietário atribui o perfil.

**Ficha do utilizador (modal com secções)**

1. Dados do utilizador — nome, email (só leitura), perfil, estado ativo/inativo.
2. Configuração específica do perfil, que muda conforme o perfil escolhido:
   - Motorista: cor no calendário (paleta, com aviso quando a cor já está usada) e assistentes responsáveis.
   - Assistente: motoristas que gere.
   - Gestor / Proprietário: sem campos extra — a secção não é apresentada.

Ao mudar o perfil, a ligação anterior é desfeita e a nova é criada na mesma conta (nunca se duplica a pessoa). As fichas antigas e todo o histórico de serviços mantêm-se.

**Proteções**

- Só o Proprietário vê e usa esta área; o Gestor mantém apenas Cidades e deslocações.
- O Proprietário não altera o próprio perfil e o último Proprietário não pode ser removido (já garantido na base de dados).
- Contas sem perfil continuam a ver o ecrã "pendente de aprovação", sem navegação.

## Notas técnicas

Sem migração de base de dados: os campos necessários já existem (`profiles`, `user_roles`, `drivers.user_id`, `drivers.color_index`, `assistants.user_id`, `assistant_driver_assignments`). Não são criados campos de viatura/matrícula nem convites por email.

- `src/components/admin/UsersPanel.tsx`: reescrito como lista unificada (contas + fichas órfãs), com pesquisa, estado e botão Editar.
- Novo `src/components/admin/UserEditDialog.tsx`: secções acima; reutiliza `useAssignUserProfile`, `useSaveDriver`, `useSetProfileActive`, `useSetDriverActive`, `useSaveAssignment`, `useDeleteAssignment`; absorve o conteúdo de `DriverEditDialog.tsx`.
- `src/routes/_authenticated/admin.tsx`: remover os separadores "Pessoas" e "Atribuições" e os formulários de adicionar motorista/assistente; separadores finais — Utilizadores (Proprietário), Cidades, Delegações (Proprietário), Auditoria (Proprietário). Gestor entra diretamente em Cidades.
- `src/components/DriverEditDialog.tsx`: eliminado depois de migrado o conteúdo.
- Verificação de permissões por rota mantém-se em `admin.tsx`/`analytics.tsx` e no `AppShell`, incluindo acesso direto por URL.
- Calendário inalterado: continua a ler `drivers` e `driverColorIndex`; um utilizador que deixe de ser motorista perde o acesso às funcionalidades de motorista mas a ficha e os serviços históricos permanecem.
