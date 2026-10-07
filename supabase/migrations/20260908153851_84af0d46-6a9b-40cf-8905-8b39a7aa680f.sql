-- 1. Hierarquia de motoristas: leitura apenas Owner/Gestor
DROP POLICY IF EXISTS "admin priorities read" ON public.administrator_driver_priorities;
CREATE POLICY "admin priorities read" ON public.administrator_driver_priorities
  FOR SELECT TO authenticated USING (public.is_admin_view());

-- 2. Ligações assistente -> Administrador: leitura restrita
DROP POLICY IF EXISTS "assistant admins read" ON public.assistant_administrators;
CREATE POLICY "assistant admins read" ON public.assistant_administrators
  FOR SELECT TO authenticated USING (
    public.is_admin_view()
    OR assistant_id = public.my_assistant_id()
    OR created_by = auth.uid()
    OR administrator_id = public.my_administrator_id()
  );

-- 3. Delegação iniciada pelo assistente
CREATE OR REPLACE FUNCTION public.delegate_administrator(
  _administrator_id uuid,
  _delegate_assistant_id uuid,
  _start_date date,
  _end_date date
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE me uuid; v_id uuid; a_name text; d_user uuid; me_name text;
BEGIN
  me := public.my_assistant_id();
  IF me IS NULL THEN RAISE EXCEPTION 'Apenas assistentes podem delegar Administradores'; END IF;
  IF _delegate_assistant_id = me THEN RAISE EXCEPTION 'Escolha outro assistente'; END IF;
  IF _start_date IS NULL OR _end_date IS NULL THEN RAISE EXCEPTION 'Indique as datas de início e fim'; END IF;
  IF _end_date < _start_date THEN RAISE EXCEPTION 'A data de fim tem de ser igual ou posterior à de início'; END IF;
  IF NOT public.assistant_serves_administrator(me, _administrator_id) THEN
    RAISE EXCEPTION 'Só pode delegar Administradores que serve neste momento';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.assistants WHERE id = _delegate_assistant_id AND active) THEN
    RAISE EXCEPTION 'O assistente indicado não está ativo';
  END IF;

  INSERT INTO public.assistant_administrators
    (assistant_id, administrator_id, relationship_type, start_date, end_date, active, created_by)
  VALUES (_delegate_assistant_id, _administrator_id, 'delegated', _start_date, _end_date, true, auth.uid())
  ON CONFLICT (assistant_id, administrator_id) DO UPDATE
    SET start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        active = true,
        created_by = auth.uid()
  WHERE public.assistant_administrators.relationship_type = 'delegated'
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Este assistente já é responsável principal por este Administrador';
  END IF;

  SELECT name INTO a_name FROM public.administrators WHERE id = _administrator_id;
  SELECT name INTO me_name FROM public.assistants WHERE id = me;
  SELECT user_id INTO d_user FROM public.assistants WHERE id = _delegate_assistant_id;
  IF d_user IS NOT NULL AND d_user IS DISTINCT FROM auth.uid() THEN
    PERFORM public.notify(d_user, 'Nova delegação de Administrador',
      coalesce(me_name, 'Um assistente') || ' delegou-lhe ' || coalesce(a_name, 'um Administrador') ||
      ' de ' || to_char(_start_date, 'DD/MM/YYYY') || ' a ' || to_char(_end_date, 'DD/MM/YYYY') || '.',
      'delegation', 'administrator', _administrator_id);
  END IF;

  PERFORM public.audit('administrator_delegated', 'administrator', _administrator_id, NULL,
    jsonb_build_object('delegate_assistant_id', _delegate_assistant_id,
                       'start_date', _start_date, 'end_date', _end_date));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.end_administrator_delegation(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE l record;
BEGIN
  SELECT * INTO l FROM public.assistant_administrators WHERE id = _id;
  IF l IS NULL THEN RAISE EXCEPTION 'Esta delegação já não existe'; END IF;
  IF l.relationship_type <> 'delegated' THEN RAISE EXCEPTION 'Só é possível terminar delegações'; END IF;
  IF NOT (public.is_admin_view() OR l.created_by = auth.uid()) THEN
    RAISE EXCEPTION 'Não tem permissão para terminar esta delegação';
  END IF;
  UPDATE public.assistant_administrators SET active = false WHERE id = _id;
  PERFORM public.audit('administrator_delegation_ended', 'administrator', l.administrator_id, to_jsonb(l), NULL);
END; $$;