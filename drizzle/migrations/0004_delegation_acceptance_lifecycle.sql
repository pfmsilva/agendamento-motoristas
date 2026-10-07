ALTER TABLE public.assistant_administrators
  ADD COLUMN IF NOT EXISTS delegation_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by uuid,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_by uuid;

ALTER TABLE public.assistant_administrators
  ADD CONSTRAINT assistant_administrators_state_chk
  CHECK (delegation_state IN ('pending','active','refused','ended'));

-- Só delegações 'active' (ou ligações principais) conferem âmbito.
CREATE OR REPLACE FUNCTION public.assistant_serves_administrator(_assistant_id uuid, _administrator_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.assistant_administrators l
     where l.assistant_id = _assistant_id
       and l.administrator_id = _administrator_id
       and l.active
       and (l.relationship_type <> 'delegated' or l.delegation_state = 'active')
       and (l.start_date is null or l.start_date <= (now() at time zone 'Europe/Lisbon')::date)
       and (l.end_date is null or l.end_date >= (now() at time zone 'Europe/Lisbon')::date)
  )
$function$;

CREATE OR REPLACE FUNCTION public.delegate_administrator(_administrator_id uuid, _delegate_assistant_id uuid, _start_date date, _end_date date, _share_past boolean DEFAULT false, _share_future boolean DEFAULT true)
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
    (assistant_id, administrator_id, relationship_type, start_date, end_date, active, created_by, share_past, share_future, delegation_state)
  VALUES (_delegate_assistant_id, _administrator_id, 'delegated', _start_date, _end_date, true, auth.uid(),
          coalesce(_share_past, false), coalesce(_share_future, true), 'pending')
  ON CONFLICT (assistant_id, administrator_id) DO UPDATE
    SET start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        active = true,
        created_by = auth.uid(),
        share_past = EXCLUDED.share_past,
        share_future = EXCLUDED.share_future,
        delegation_state = 'pending',
        decided_at = NULL,
        decided_by = NULL,
        ended_at = NULL,
        ended_by = NULL
  WHERE public.assistant_administrators.relationship_type = 'delegated'
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Este assistente já é responsável principal por este Administrador';
  END IF;

  SELECT name INTO a_name FROM public.administrators WHERE id = _administrator_id;
  SELECT name INTO me_name FROM public.assistants WHERE id = me;
  SELECT user_id INTO d_user FROM public.assistants WHERE id = _delegate_assistant_id;
  IF d_user IS NOT NULL AND d_user IS DISTINCT FROM auth.uid() THEN
    PERFORM public.notify(d_user, 'Delegação pendente de aceitação',
      coalesce(me_name, 'Um assistente') || ' delegou-lhe ' || coalesce(a_name, 'um Administrador') ||
      ' de ' || to_char(_start_date, 'DD/MM/YYYY') || ' a ' || to_char(_end_date, 'DD/MM/YYYY') ||
      '. Aceite ou recuse na área «Delegações».',
      'delegation', 'administrator', _administrator_id);
  END IF;

  PERFORM public.audit('administrator_delegated', 'administrator', _administrator_id, NULL,
    jsonb_build_object('delegate_assistant_id', _delegate_assistant_id,
                       'delegated_by_assistant_id', me,
                       'start_date', _start_date, 'end_date', _end_date,
                       'share_past', coalesce(_share_past, false),
                       'share_future', coalesce(_share_future, true),
                       'delegation_state', 'pending'));
  RETURN v_id;
END; $function$;

-- Assistente que recebe: aceita ou recusa a delegação pendente.
CREATE OR REPLACE FUNCTION public.respond_administrator_delegation(_id uuid, _accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l record; me uuid; a_name text; me_name text; c_user uuid;
BEGIN
  me := public.my_assistant_id();
  SELECT * INTO l FROM public.assistant_administrators WHERE id = _id;
  IF l IS NULL THEN RAISE EXCEPTION 'Esta delegação já não existe'; END IF;
  IF l.relationship_type <> 'delegated' THEN RAISE EXCEPTION 'Só é possível responder a delegações'; END IF;
  IF me IS NULL OR l.assistant_id <> me THEN
    RAISE EXCEPTION 'Só o assistente que recebe a delegação pode aceitar ou recusar';
  END IF;
  IF l.delegation_state <> 'pending' THEN RAISE EXCEPTION 'Esta delegação já foi decidida'; END IF;

  UPDATE public.assistant_administrators
     SET delegation_state = CASE WHEN _accept THEN 'active' ELSE 'refused' END,
         active = _accept,
         decided_at = now(),
         decided_by = auth.uid()
   WHERE id = _id;

  SELECT name INTO a_name FROM public.administrators WHERE id = l.administrator_id;
  SELECT name INTO me_name FROM public.assistants WHERE id = me;
  c_user := l.created_by;
  IF c_user IS NOT NULL AND c_user IS DISTINCT FROM auth.uid() THEN
    PERFORM public.notify(c_user,
      CASE WHEN _accept THEN 'Delegação aceite' ELSE 'Delegação recusada' END,
      coalesce(me_name, 'O assistente') ||
      CASE WHEN _accept THEN ' aceitou ' ELSE ' recusou ' END ||
      'a delegação de ' || coalesce(a_name, 'um Administrador') || '.',
      'delegation', 'administrator', l.administrator_id);
  END IF;

  PERFORM public.audit(
    CASE WHEN _accept THEN 'administrator_delegation_accepted' ELSE 'administrator_delegation_refused' END,
    'administrator', l.administrator_id, to_jsonb(l),
    jsonb_build_object('delegation_id', _id,
                       'delegate_assistant_id', l.assistant_id,
                       'decided_by', auth.uid(),
                       'decided_at', now(),
                       'delegation_state', CASE WHEN _accept THEN 'active' ELSE 'refused' END,
                       'share_past', l.share_past,
                       'share_future', l.share_future));
END; $function$;

-- Terminar: também o assistente que recebe pode terminar.
CREATE OR REPLACE FUNCTION public.end_administrator_delegation(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l record; me uuid; a_name text; me_name text; other_user uuid;
BEGIN
  me := public.my_assistant_id();
  SELECT * INTO l FROM public.assistant_administrators WHERE id = _id;
  IF l IS NULL THEN RAISE EXCEPTION 'Esta delegação já não existe'; END IF;
  IF l.relationship_type <> 'delegated' THEN RAISE EXCEPTION 'Só é possível terminar delegações'; END IF;
  IF NOT (public.is_admin_view() OR l.created_by = auth.uid() OR (me IS NOT NULL AND l.assistant_id = me)) THEN
    RAISE EXCEPTION 'Não tem permissão para terminar esta delegação';
  END IF;

  UPDATE public.assistant_administrators
     SET active = false,
         delegation_state = 'ended',
         ended_at = now(),
         ended_by = auth.uid()
   WHERE id = _id;

  SELECT name INTO a_name FROM public.administrators WHERE id = l.administrator_id;
  SELECT name INTO me_name FROM public.assistants WHERE id = coalesce(me, l.assistant_id);

  -- Avisa a outra parte (quem criou, se terminou quem recebe; caso contrário quem recebe).
  IF me IS NOT NULL AND l.assistant_id = me THEN
    other_user := l.created_by;
  ELSE
    SELECT user_id INTO other_user FROM public.assistants WHERE id = l.assistant_id;
  END IF;
  IF other_user IS NOT NULL AND other_user IS DISTINCT FROM auth.uid() THEN
    PERFORM public.notify(other_user, 'Delegação terminada',
      coalesce(me_name, 'Um assistente') || ' terminou a delegação de ' ||
      coalesce(a_name, 'um Administrador') || '.',
      'delegation', 'administrator', l.administrator_id);
  END IF;

  PERFORM public.audit('administrator_delegation_ended', 'administrator', l.administrator_id, to_jsonb(l),
    jsonb_build_object('delegation_id', _id,
                       'delegate_assistant_id', l.assistant_id,
                       'created_by', l.created_by,
                       'ended_by', auth.uid(),
                       'ended_at', now(),
                       'delegation_state', 'ended',
                       'share_past', l.share_past,
                       'share_future', l.share_future));
END; $function$;