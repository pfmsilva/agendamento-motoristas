ALTER TABLE public.assistant_administrators
  ADD COLUMN IF NOT EXISTS share_past boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_future boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.can_view_activity(_administrator_id uuid, _assistant_id uuid, _driver_id uuid, _start timestamptz)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.can_edit_activities()
      or (_driver_id is not null and _driver_id = public.my_driver_id())
      or (_assistant_id is not null and _assistant_id = public.my_assistant_id())
      or (_administrator_id is not null and _administrator_id = public.my_administrator_id())
      or exists (
        select 1
          from public.assistant_administrators l
         where l.administrator_id = _administrator_id
           and l.assistant_id = public.my_assistant_id()
           and l.active
           and (l.start_date is null or l.start_date <= (now() at time zone 'Europe/Lisbon')::date)
           and (l.end_date is null or l.end_date >= (now() at time zone 'Europe/Lisbon')::date)
           and (
             l.relationship_type <> 'delegated'
             or (
               (l.share_past or l.start_date is null or _start is null
                 or (_start at time zone 'Europe/Lisbon')::date >= l.start_date)
               and
               (l.share_future or l.end_date is null or _start is null
                 or (_start at time zone 'Europe/Lisbon')::date <= l.end_date)
             )
           )
      )
$function$;

DROP POLICY IF EXISTS "activities read" ON public.activities;
CREATE POLICY "activities read" ON public.activities
  FOR SELECT
  USING (public.can_view_activity(administrator_id, assistant_id, driver_id, start_datetime));

DROP FUNCTION IF EXISTS public.delegate_administrator(uuid, uuid, date, date);

CREATE OR REPLACE FUNCTION public.delegate_administrator(
  _administrator_id uuid,
  _delegate_assistant_id uuid,
  _start_date date,
  _end_date date,
  _share_past boolean DEFAULT false,
  _share_future boolean DEFAULT true
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    (assistant_id, administrator_id, relationship_type, start_date, end_date, active, created_by, share_past, share_future)
  VALUES (_delegate_assistant_id, _administrator_id, 'delegated', _start_date, _end_date, true, auth.uid(),
          coalesce(_share_past, false), coalesce(_share_future, true))
  ON CONFLICT (assistant_id, administrator_id) DO UPDATE
    SET start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        active = true,
        created_by = auth.uid(),
        share_past = EXCLUDED.share_past,
        share_future = EXCLUDED.share_future
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
                       'delegated_by_assistant_id', me,
                       'start_date', _start_date, 'end_date', _end_date,
                       'share_past', coalesce(_share_past, false),
                       'share_future', coalesce(_share_future, true)));
  RETURN v_id;
END; $function$;

REVOKE ALL ON FUNCTION public.delegate_administrator(uuid, uuid, date, date, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.delegate_administrator(uuid, uuid, date, date, boolean, boolean) TO authenticated;