-- Assistants need to see other assistants (id + name) to delegate drivers to them.
create policy "assistants read peers"
on public.assistants
for select
to authenticated
using (public.has_role(auth.uid(), 'assistant'));