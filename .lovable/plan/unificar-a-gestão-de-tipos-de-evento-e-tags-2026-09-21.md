# Unificar a gestão de tipos de evento e TAGs

## Alterações

- Renomear o separador de Administração de «Gestão de TAGs» para «Tipos de evento» e usar esse nome em todas as referências desta área.
- Substituir os três painéis atuais por uma única secção compacta, com uma tabela responsiva: Tipo de evento, TAG associada, Estado e Ações.
- Mostrar os tipos base uma única vez, identificados como «Base», com a TAG e o estado visíveis e mantendo as proteções atuais.
- Adicionar «+ Novo tipo de evento», abrindo um diálogo com nome e TAG associada.
- No mesmo diálogo, permitir escolher uma TAG ativa existente ou criar uma nova TAG sem sair do fluxo; a nova TAG fica selecionada no novo tipo.
- Adicionar «Editar» em cada linha, abrindo o mesmo padrão de diálogo para alterar nome, TAG e estado. Os campos protegidos dos tipos base ficam bloqueados conforme as regras atuais.
- Permitir desativar uma TAG no contexto da edição do tipo associado, sem criar outro painel ou página de TAGs.

## Comportamento preservado

- Continuar a usar `event_kind_tags` e `event_tags`; não criar modelos paralelos nem duplicar registos.
- Manter exatamente uma TAG associada a cada tipo de evento.
- Mudanças de associação, nome ou estado só afetam novas escolhas; eventos existentes conservam o tipo e a TAG já gravados.
- Tipos e TAGs inativos deixam de estar disponíveis em novos eventos, mas continuam visíveis no histórico, calendário, auditoria e análises.
- Manter a configuração exclusiva do Proprietário e todas as restrições existentes dos registos base.

## Detalhes técnicos

- Criar um único componente de gestão reutilizando os controlos existentes de tabela, diálogo, seleção, interruptor e botões.
- Reutilizar e coordenar as mutações existentes de tipos e TAGs, atualizando imediatamente a lista após criar ou editar.
- Remover apenas a composição visual dos três painéis antigos; os dados e a lógica histórica permanecem.
- Atualizar a documentação funcional em `src/lib/spec/content.ts` e acrescentar a alteração a `SPEC_CHANGES`.

## Verificação

- Confirmar criação de tipo com TAG existente e com nova TAG criada no próprio diálogo.
- Confirmar edição da associação e ativação/desativação, incluindo limites dos tipos base.
- Confirmar que tipos/TAGs inativos não surgem em novos eventos e que dados históricos não são alterados.
- Validar a tabela e os diálogos em ecrãs largos e pequenos, além da compilação e dos registos de execução.
