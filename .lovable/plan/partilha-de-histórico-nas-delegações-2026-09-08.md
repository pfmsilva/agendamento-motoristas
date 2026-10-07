# Partilha de histórico nas delegações

Ao delegar um motorista a outro assistente, o assistente passa a poder decidir se o colega vê, ou não, os serviços fora do período delegado.

## Comportamento

- Novo interruptor no ecrã "Delegar motorista": **Partilhar histórico de serviços**, desligado por defeito.
- Texto curto de apoio: "Se ficar desligado, o assistente delegado só vê os serviços dentro do período da delegação."
- Ligado: o assistente delegado vê todos os serviços do motorista (comportamento actual).
- Desligado: o assistente delegado só vê os serviços do motorista que caem dentro das datas da delegação; os anteriores e os posteriores ficam ocultos.
- A escolha é feita no momento da criação e fica guardada na delegação; aparece também na lista "Delegações em vigor" (etiqueta "histórico partilhado" quando aplicável).
- Nada mais muda: quem pode delegar, revogar, criar ou editar serviços mantém-se igual. Gestores, Proprietários, o próprio motorista e o assistente titular continuam a ver tudo.

## Detalhes técnicos

1. Migração:
   - `assistant_delegations.share_history boolean not null default false`.
   - Nova função `delegated_activity_visible(_driver_id uuid, _start timestamptz, _end timestamptz)` (SECURITY DEFINER, sem `execute` para roles aplicacionais além de `authenticated` conforme padrão existente): devolve verdadeiro se existir delegação activa e vigente em que `share_history` ou o intervalo do serviço se sobrepõe ao período da delegação.
   - Ajuste da política de leitura de `activities`: passa a `is_manager() or is_owner() or assistant_assigned_driver(driver_id) or driver_id = my_driver_id() or delegated_activity_visible(driver_id, effective_start/start_datetime, effective_end/end_datetime)`. As políticas de escrita e as restantes tabelas ficam inalteradas.
   - Delegações existentes ficam com `share_history = true` para não retirar acesso já concedido.
2. `DelegationDialog.tsx`: estado `shareHistory`, componente `Switch` com `Label` e texto de apoio, enviado no `save.mutateAsync`; reposto a falso sempre que o diálogo abre. Etiqueta na lista de delegações em vigor.
3. Tipos da base de dados regenerados após a migração; verificação com typecheck e build.
