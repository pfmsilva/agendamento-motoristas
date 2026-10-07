# Filtros na área de Utilizadores (Equipa)

Hoje o separador "Utilizadores" da Administração tem apenas uma pesquisa por nome/email. O plano adiciona filtros de Estado e Perfil que funcionam em conjunto com a pesquisa, sobre os dados reais.

## O que passa a existir

Acima da lista, numa única linha compacta (que quebra em ecrãs pequenos):

- **Pesquisa** — campo com ícone de lupa, filtra por nome ou email (já existe; ganha o ícone).
- **Estado** — lista pendente: Todos · Ativos · Inativos.
- **Perfil** — lista pendente: Todos + todos os perfis da aplicação (Proprietário, Gestor, Assistente, Motorista, Pendente de atribuição, Ficha sem conta). A lista é gerada a partir dos perfis existentes na aplicação, não de valores fixos.
- **Limpar filtros** — botão visível apenas quando há algum filtro ativo; repõe tudo de uma vez.

## Comportamento

- Os três filtros combinam-se: só aparecem utilizadores que satisfaçam simultaneamente o estado, o perfil e o texto pesquisado (ex.: Ativos + Gestor + "João").
- A filtragem aplica-se sobre os dados carregados da base de dados e atualiza os resultados instantaneamente, sem recarregar a página.
- Aplica-se às duas secções (Contas pendentes e Equipa); os contadores refletem o resultado filtrado.
- Cada linha já mostra o estado "Ativo"/"Inativo"; mantém-se esse distintivo ao lado do perfil, tornando o filtro de estado imediatamente compreensível.
- Mensagem "Sem resultados para os filtros escolhidos." quando nada corresponde.
- Design visual atual mantido (componentes e cores existentes da aplicação).

## Notas técnicas

Sem migração de base de dados — apenas frontend.

- `src/components/admin/UsersPanel.tsx`: adicionar estado local `statusFilter` e `roleFilter`; um único `useMemo` que aplica pesquisa + estado + perfil à lista `team` antes de a dividir em pendentes/resto; usar `Select` existente em `@/components/ui/select` e ícone `Search` de lucide-react; botão "Limpar filtros".
- Os valores do filtro de perfil derivam de `ROLE_LABEL` (cobrindo qualquer papel do enum `app_role`) mais os casos sem papel (pendente/ficha sem conta), por isso novos perfis passam a aparecer automaticamente.
