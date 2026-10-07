CREATE TABLE public.activity_private_notes (
  activity_id uuid PRIMARY KEY REFERENCES public.activities(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_role app_role NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.activity_private_notes TO authenticated;
GRANT ALL ON public.activity_private_notes TO service_role;

ALTER TABLE public.activity_private_notes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_private_note(_activity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select not public.is_admin_view()
     and exists (
       select 1 from public.activities a
        where a.id = _activity_id
          and public.can_view_activity(a.administrator_id, a.assistant_id, a.driver_id, a.start_datetime)
     )
$$;

CREATE POLICY "private notes read" ON public.activity_private_notes
  FOR SELECT TO authenticated
  USING (public.can_view_private_note(activity_id));

CREATE TRIGGER activity_private_notes_touch
  BEFORE UPDATE ON public.activity_private_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.activities_route_private_notes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_role app_role;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN new; END IF;
  IF public.is_admin_view() THEN RETURN new; END IF;

  IF public.my_administrator_id() IS NOT NULL THEN
    v_role := 'administrator';
  ELSIF public.my_assistant_id() IS NOT NULL THEN
    v_role := 'assistant';
  ELSE
    RETURN new;
  END IF;

  IF new.notes IS NOT NULL AND btrim(new.notes) <> '' THEN
    INSERT INTO public.activity_private_notes (activity_id, author_id, author_role, body)
    VALUES (new.id, auth.uid(), v_role, new.notes)
    ON CONFLICT (activity_id) DO UPDATE
      SET body = excluded.body,
          author_id = excluded.author_id,
          author_role = excluded.author_role,
          updated_at = now();
    UPDATE public.activities SET notes = NULL WHERE id = new.id;
  ELSIF tg_op = 'UPDATE' AND old.notes IS DISTINCT FROM new.notes THEN
    DELETE FROM public.activity_private_notes WHERE activity_id = new.id;
  END IF;

  RETURN new;
END; $$;

CREATE TRIGGER activities_private_notes
  AFTER INSERT OR UPDATE OF notes ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.activities_route_private_notes();

CREATE OR REPLACE FUNCTION public.activities_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE u record; d_name text; act text; driver_user uuid; old_driver_user uuid; a_user uuid; when_txt text; body text;
BEGIN
  IF new.driver_id IS NOT NULL THEN
    SELECT name, user_id INTO d_name, driver_user FROM public.drivers WHERE id = new.driver_id;
  END IF;
  IF tg_op = 'INSERT' THEN act := 'activity_created';
  ELSIF new.status = 'cancelled' AND old.status <> 'cancelled' THEN act := 'activity_cancelled';
  ELSIF new.driver_id IS DISTINCT FROM old.driver_id THEN act := 'activity_driver_changed';
  ELSE act := 'activity_updated';
  END IF;

  PERFORM public.audit(act, 'activity', new.id,
    CASE WHEN tg_op = 'UPDATE' THEN to_jsonb(old) - 'notes' ELSE NULL END,
    to_jsonb(new) - 'notes');

  IF coalesce(current_setting('app.recalc_travel', true), '') = 'on' THEN
    RETURN new;
  END IF;

  when_txt := to_char(new.start_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI');
  body := new.title || ' - ' || coalesce(d_name, 'Por atribuir') || ' - ' || when_txt;
  SELECT s.user_id INTO a_user FROM public.assistants s WHERE s.id = new.assistant_id;

  IF act IN ('activity_created', 'activity_driver_changed') THEN
    IF new.driver_id IS NOT NULL AND driver_user IS NOT NULL AND driver_user IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify(driver_user, 'Novo serviço atribuído', body, 'activity', 'activity', new.id);
    END IF;
    IF act = 'activity_driver_changed' AND new.driver_id IS NOT NULL AND a_user IS NOT NULL AND a_user IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify(a_user, 'Motorista atribuído ao seu serviço', body, 'activity', 'activity', new.id);
    END IF;
  ELSE
    FOR u IN
      SELECT user_id FROM public.driver_audience(new.driver_id)
      UNION SELECT a_user WHERE a_user IS NOT NULL
    LOOP
      IF u.user_id IS DISTINCT FROM auth.uid() THEN
        PERFORM public.notify(u.user_id,
          CASE act WHEN 'activity_cancelled' THEN 'Serviço cancelado' ELSE 'Serviço atualizado' END,
          body, 'activity', 'activity', new.id);
      END IF;
    END LOOP;
  END IF;

  IF tg_op = 'UPDATE' AND old.driver_id IS NOT NULL AND new.driver_id IS DISTINCT FROM old.driver_id THEN
    SELECT user_id INTO old_driver_user FROM public.drivers WHERE id = old.driver_id;
    IF old_driver_user IS NOT NULL AND old_driver_user IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify(old_driver_user, 'Serviço transferido para outro motorista', new.title || ' - ' || when_txt, 'activity', 'activity', new.id);
    END IF;
  END IF;

  IF new.status <> 'cancelled' AND new.assignment_status = 'pending_manual'
     AND (tg_op = 'INSERT' OR old.assignment_status <> 'pending_manual') THEN
    PERFORM public.notify_pending_assignment(new.id);
  END IF;
  RETURN new;
END; $function$;