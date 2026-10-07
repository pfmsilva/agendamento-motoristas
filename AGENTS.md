<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Documentação funcional

A página Owner "Regras e Automação" (`/rules`, dados em `src/lib/spec/`) é a fonte única da lógica funcional.
Qualquer alteração a regras, permissões, automações, validações, visibilidade, notificações, auditoria ou modelo de dados TEM de atualizar `src/lib/spec/content.ts` na mesma alteração e acrescentar uma linha a `SPEC_CHANGES`. As exportações Excel/JSON derivam desses dados.

- Resolve service Administrator labels from the service's `administrator_id` through the shared cached name map, never from the driver's default relationships, so calendar cards and dialogs remain consistent without per-event queries.
- Repeating services are stored as a rule on `activity_series`; occurrences are created on demand per requested range via `ensure_series_range`, and calendars load services by period through `useActivities(range)`, so long or open-ended series never pre-create years of rows.
