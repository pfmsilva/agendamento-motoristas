# Registar a eliminação de utilizadores no Extrato de Auditoria

## Situação atual (verificada)

- A eliminação passa por uma função de servidor com privilégios elevados que apaga a conta diretamente; ao contrário das restantes ações, não escreve nada na tabela de auditoria — daí não aparecer no extrato.
- A tabela de auditoria não está ligada por chave estrangeira às contas, por isso os registos sobrevivem à eliminação da conta: nada do histórico existente se perde.
- O extrato já sabe mostrar ações do tipo "Eliminação" e filtrar por data, utilizador, tipo de ação e entidade; falta apenas passar a existir a entidade "Utilizador".

## O que vai passar a acontecer

Ao eliminar um utilizador (a partir de Editar utilizador → Eliminar utilizador):

1. Antes de apagar, são recolhidos os dados do utilizador: nome, email, perfil (Proprietário/Gestor/Assistente/Motorista) e a ficha de motorista/assistente associada, se existir.
2. A eliminação é executada.
3. **Só depois de a eliminação ser concluída com sucesso** é criado o registo de auditoria. Se falhar em qualquer ponto, não é criado nenhum registo.

O registo contém:

- Ação: **Utilizador eliminado** (aparece com a etiqueta "Eliminação", igual às restantes eliminações)
- Entidade: **Utilizador**
- Executado por: o administrador autenticado que fez a ação
- Data e hora exatas
- Detalhes: nome, email, perfil e ficha associada do utilizador eliminado

## No Extrato de Auditoria

- Nova entidade "Utilizador" na lista de filtros (aparece assim que existir pelo menos um registo).
- Na coluna "Descrição" mostra-se o nome (ou o email) do utilizador eliminado, para que continue identificável mesmo depois de a conta deixar de existir.
- No detalhe do registo, uma linha "Utilizador eliminado" com nome e email, além dos campos já habituais.
- O registo mantém-se para sempre no extrato; nada apaga estes registos.
- Todo o texto em PT-PT; as restantes ações de auditoria ficam exatamente como estão.

## Notas técnicas

- `src/lib/admin.functions.ts` (`deleteUserAccount`): antes das operações de eliminação, ler `profiles` (nome, email), `user_roles` (perfil) e as fichas `drivers`/`assistants` ligadas; após `auth.admin.deleteUser` ter sucesso, inserir em `audit_log` via cliente privilegiado com `user_id = callerId`, `action = "user_deleted"`, `entity_type = "user"`, `entity_id = <uid eliminado>`, `old_value = { name, email, role, driver_name, assistant_name }`, `new_value = null`. A falha da escrita de auditoria é registada nos logs mas não reverte nem falha a eliminação já concluída.
- `deleteUnlinkedRecord` (fichas sem conta) passa a registar da mesma forma, com `entity_type` `driver`/`assistant` e ação `..._deleted`, para coerência.
- `src/components/AuditPanel.tsx`: adicionar `user: "Utilizador"` ao `ENTITY_LABEL`; acrescentar `email` e `role` ao `FIELD_LABEL`; em `describe()`, usar também `email` quando não há `name`; no diálogo de detalhe, mostrar "Utilizador eliminado: nome (email)" quando `entity_type === "user"`. `actionKind("user_deleted")` já devolve "deleted", pelo que a etiqueta e o filtro funcionam sem alterações.
- Sem migração de base de dados: a tabela de auditoria já tem as colunas necessárias e não tem chave estrangeira para as contas.
