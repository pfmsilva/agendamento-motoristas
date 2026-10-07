# Auditoria multiutilizador e reforço para produção

## Resultado da análise (verificado no código e na base de dados)

**Já está correto — a aplicação já é multiutilizador real:**

- Base de dados persistente online: sim. É a base de dados do Lovable Cloud (PostgreSQL gerido). Não há ficheiros locais nem dados de aplicação no browser.
- Todos os dados vivem na base de dados: serviços (`activities`), motoristas, assistentes, cidades, ausências (`time_off`), indisponibilidades, atribuições, delegações, notificações, perfis, papéis e auditoria. Todas as leituras e escritas passam por `src/lib/data.ts` contra essa base.
- Nada de dados de negócio em localStorage/sessionStorage. O único uso de armazenamento local é a sessão de autenticação (token de login), o que é o comportamento normal e correto.
- Vários utilizadores em simultâneo: sim, cada um autentica-se e trabalha sobre a mesma fonte de dados.
- Tempo real: já existe. `useRealtimeSync` subscreve alterações das tabelas principais e atualiza automaticamente os ecrãs dos outros utilizadores; está ativo em toda a aplicação autenticada. Confirmei também na base de dados que a publicação de tempo real inclui todas as tabelas operacionais.
- Autenticação: contas com email/palavra-passe, sessão gerida pelo backend; a identidade do utilizador é ligada a motorista/assistente/papel.
- Permissões: aplicadas na própria base de dados (regras por linha), com funções de segurança por papel (proprietário, gestor, assistente, motorista) e delegações temporárias com expiração automática. Um utilizador não consegue contornar as permissões nem por acesso direto à API.
- Conflitos de agenda: validados no servidor por trigger, logo valem para todos os utilizadores em simultâneo.

**O que falta (lacunas reais encontradas):**

1. Proteção contra edição simultânea (dois utilizadores a gravar o mesmo registo) só existe em serviços, cidades e motoristas. Falta em ausências, indisponibilidades, assistentes e delegações — nesses casos a última gravação sobrepõe silenciosamente a anterior.
2. A tabela de auditoria não está incluída na publicação de tempo real, por isso o painel de auditoria só atualiza por efeito colateral de outras tabelas.
3. Quando a ligação de tempo real cai (rede instável, portátil suspenso), não há recuperação: o utilizador pode ficar com dados desatualizados sem perceber.
4. Não há aviso visual quando um registo aberto num diálogo foi entretanto alterado por outra pessoa — o utilizador só descobre ao gravar.

## Solução proposta

Manter a arquitetura atual (é a adequada para produção) e fechar apenas as lacunas acima. Não há migração de dados, não se apaga nada e não se duplica nada.

1. **Concorrência otimista em todas as entidades**: estender o padrão já usado (gravar só se a versão do registo continuar a mesma) às ausências, indisponibilidades, assistentes e delegações. Se outra pessoa alterou entretanto, a gravação é recusada com a mensagem PT-PT já existente em vez de sobrepor.
2. **Auditoria em tempo real**: incluir a tabela de auditoria na publicação de tempo real (migração aditiva, apenas de configuração).
3. **Reconexão e recuperação**: ao voltar a ligar o canal de tempo real, ao regressar à aba e ao recuperar a rede, refrescar os dados automaticamente; indicador discreto de "ligação em tempo real" no cabeçalho quando estiver em baixo.
4. **Aviso de alteração externa nos diálogos**: se um registo aberto for alterado por outro utilizador, mostrar aviso no próprio diálogo com opção de recarregar os valores atuais, evitando gravar por cima sem saber.

## Notas técnicas

- Uma única migração, apenas `ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log` e garantia de `REPLICA IDENTITY FULL`. Sem alterações de esquema, sem perda de dados.
- Concorrência: filtro `.eq("updated_at", esperado)` nas atualizações, com verificação de linhas afetadas e mensagem `CONCURRENT_EDIT_MESSAGE`. Requer `updated_at` com trigger, que já existe nas tabelas visadas (exceto `unavailability`, onde se acrescenta a coluna com trigger na mesma migração).
- Recuperação: tratamento do estado do canal em `useRealtimeSync` mais `refetchOnWindowFocus` e listener de `online`.
