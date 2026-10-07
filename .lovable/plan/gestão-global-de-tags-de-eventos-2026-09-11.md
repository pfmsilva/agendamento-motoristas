# Gestão global de TAGs de eventos

## Alterações

- Criar uma área exclusiva do Proprietário, **Gestão de TAGs**, na Administração.
- Permitir criar, editar, ativar/desativar e reordenar TAGs globais.
- Manter **Admin**, **Garagem** e **Férias** como TAGs base protegidas contra eliminação; podem ser desativadas para novas escolhas.
- Cada evento terá uma única TAG.
- Os TAGs base continuam a determinar os comportamentos atuais: Administração mantém atribuição e deslocação, Garagem mantém o seu fluxo próprio e Férias mantém o fluxo de ausência.
- Um TAG personalizado representa um novo tipo de serviço e usa o fluxo funcional de Administração, sem alterar a lógica de Garagem ou Férias.
- Mostrar apenas TAGs ativos ao criar novos eventos; ao editar ou consultar, manter visível o TAG histórico mesmo que esteja inativo.
- Apresentar o TAG escolhido nos cartões e detalhes do calendário sem perder os tratamentos visuais especiais de Garagem e Férias.

## Dados, permissões e histórico

- Criar uma tabela global de TAGs com nome, chave de sistema opcional, estado, ordem, indicador de TAG base e datas de criação/alteração.
- Associar serviços/eventos e férias ao respetivo TAG por identificador estável, preservando os registos existentes através de migração dos valores atuais.
- Proteger a configuração na base de dados: todos os utilizadores autenticados podem ler TAGs relevantes; apenas o Proprietário pode criar ou alterar; TAGs base não podem ser eliminados.
- Impedir a atribuição de TAGs inativos a novos eventos no servidor, permitindo que eventos históricos continuem a referenciá-los.
- Registar na auditoria a criação, edição, ativação/desativação e reordenação de TAGs.

## Interface e integração

- Adicionar seletores alimentados pela configuração global nos formulários de criação de eventos para todos os perfis autorizados.
- Encaminhar TAGs personalizados pelo fluxo de serviço normal e manter os TAGs base ligados aos fluxos já existentes.
- Atualizar consultas, tipos e funções de criação/edição/séries para guardar e devolver o TAG.
- Criar o painel de gestão com estado ativo visível, proteção dos TAGs base e controlos de ordenação.

## Documentação e verificação

- Atualizar **Regras e Automação**, modelo de dados, notas Django e `SPEC_CHANGES` na mesma alteração.
- Verificar criação, edição, desativação, histórico, permissões do Proprietário e apresentação em calendário.
- Confirmar que TAGs inativos desaparecem de novas escolhas sem modificar eventos anteriores.
