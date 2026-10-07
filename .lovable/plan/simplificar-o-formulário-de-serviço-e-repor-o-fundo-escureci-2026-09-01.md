# Simplificar o formulário de serviço e repor o fundo escurecido dos diálogos

## Objetivo
1. O formulário de serviço tem campos repetitivos: "Cidade do serviço", "Origem" e "Destino". Ficar apenas com um campo de cidade.
2. Quando um diálogo abre, o resto da página deve ficar escurecido (backdrop). Foi removido quando os diálogos passaram a `modal={false}` para corrigir o bloqueio de cliques — agora repomos o escurecimento sem voltar a bloquear a página.

## Alterações

### 1. Um único campo de cidade (`src/components/ActivityDialog.tsx`)
- Remover os campos de texto livre "Origem" e "Destino".
- Manter apenas **"Cidade do serviço"** (CityCombobox com pesquisa).
- Ao guardar: `destination` = nome da cidade selecionada; `origin` = nome da cidade base (ex.: Lisboa). Se for a cidade base, destino fica vazio.
- Ao editar um serviço existente, o valor pré-preenchido continua a funcionar (a cidade já vem de `city_id`).
- Manter `origin`/`destination` no tipo `ActivityDraft` e na BD (outros ecrãs usam-nos para apresentação), apenas deixam de ser editáveis à mão no formulário.

### 2. Backdrop escurecido sem bloqueio de cliques (`src/components/ui/dialog.tsx`)
- No `DialogContent`, quando o diálogo está aberto, renderizar manualmente um overlay: `<div className="fixed inset-0 z-50 bg-black/50" />` atrás do conteúdo (o conteúdo fica a `z-[51]`, como já está).
- O overlay é apenas visual (`pointer-events: none`), por isso **não** interfere com os cliques nem reaparece o problema anterior de campos bloqueados.
- Fechar continua a ser feito pelos botões "Fechar"/"Criar serviço" (o overlay não captura cliques).
- Aplicável a todos os diálogos da app (ActivityDialog, FindDriverDialog, DelegationDialog, AvailabilityDialog), porque todos usam o mesmo `DialogContent`.

## Verificação
- Abrir "Novo serviço" e "Encontrar motorista disponível": página atrás escurecida, campos editáveis, guardar funciona.
- Fluxo completo: pesquisar motorista → usar este motorista → formulário abre com contexto → editar campos → criar serviço → confirma gravação.
- Confirmar que os outros diálogos (delegação, disponibilidade) também mostram o fundo escurecido e continuam interativos.
