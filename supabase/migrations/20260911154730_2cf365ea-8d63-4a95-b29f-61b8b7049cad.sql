CREATE TABLE public.activity_confidential_content (
  activity_id uuid PRIMARY KEY,
  title text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.activity_confidential_content TO authenticated;
GRANT ALL ON public.activity_confidential_content TO service_role;

ALTER TABLE public.activity_confidential_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized service participants read confidential content"
ON public.activity_confidential_content FOR SELECT TO authenticated
USING (
  (public.my_assistant_id() IS NOT NULL OR public.my_administrator_id() IS NOT NULL)
  AND EXISTS (
    SELECT 1 FROM public.activities a
    WHERE a.id = activity_id
      AND public.can_view_activity(a.administrator_id, a.assistant_id, a.driver_id, a.start_datetime)
  )
);

CREATE TABLE public.activity_series_confidential_content (
  series_id uuid PRIMARY KEY,
  title text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.activity_series_confidential_content TO authenticated;
GRANT ALL ON public.activity_series_confidential_content TO service_role;

ALTER TABLE public.activity_series_confidential_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized series participants read confidential content"
ON public.activity_series_confidential_content FOR SELECT TO authenticated
USING (
  (public.my_assistant_id() IS NOT NULL OR public.my_administrator_id() IS NOT NULL)
  AND EXISTS (
    SELECT 1 FROM public.activity_series s
    WHERE s.id = series_id
      AND public.can_view_activity(s.administrator_id, s.assistant_id, NULL, s.first_start)
  )
);

CREATE OR REPLACE FUNCTION public.protect_admin_activity_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_title text;
  v_notes text;
BEGIN
  SELECT (t.system_key = 'admin') INTO v_is_admin
  FROM public.event_tags t WHERE t.id = new.tag_id;

  IF NOT coalesce(v_is_admin, false) THEN
    RETURN new;
  END IF;

  IF tg_op = 'INSERT' THEN
    v_title := coalesce(nullif(btrim(new.title), ''), 'Serviço Administração');
    v_notes := nullif(new.notes, '');
    INSERT INTO public.activity_confidential_content (activity_id, title, notes)
    VALUES (new.id, v_title, v_notes)
    ON CONFLICT (activity_id) DO UPDATE
      SET title = excluded.title, notes = excluded.notes, updated_at = now();
  ELSIF new.title IS DISTINCT FROM old.title OR new.notes IS DISTINCT FROM old.notes THEN
    SELECT title, notes INTO v_title, v_notes
    FROM public.activity_confidential_content WHERE activity_id = new.id;
    v_title := CASE
      WHEN new.title IS DISTINCT FROM old.title AND new.title <> 'Serviço Administração'
        THEN coalesce(nullif(btrim(new.title), ''), v_title, 'Serviço Administração')
      ELSE coalesce(v_title, 'Serviço Administração')
    END;
    v_notes := CASE
      WHEN new.notes IS DISTINCT FROM old.notes THEN nullif(new.notes, '')
      ELSE v_notes
    END;
    INSERT INTO public.activity_confidential_content (activity_id, title, notes)
    VALUES (new.id, v_title, v_notes)
    ON CONFLICT (activity_id) DO UPDATE
      SET title = excluded.title, notes = excluded.notes, updated_at = now();
  END IF;

  new.title := 'Serviço Administração';
  new.notes := NULL;
  RETURN new;
END;
$$;

CREATE TRIGGER activities_protect_admin_content
BEFORE INSERT OR UPDATE OF title, notes, tag_id ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.protect_admin_activity_content();

CREATE OR REPLACE FUNCTION public.protect_admin_series_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_title text;
  v_notes text;
BEGIN
  SELECT (t.system_key = 'admin') INTO v_is_admin
  FROM public.event_tags t WHERE t.id = new.tag_id;

  IF NOT coalesce(v_is_admin, false) THEN
    RETURN new;
  END IF;

  IF tg_op = 'INSERT' THEN
    v_title := coalesce(nullif(btrim(new.title), ''), 'Serviço Administração');
    v_notes := nullif(new.notes, '');
    INSERT INTO public.activity_series_confidential_content (series_id, title, notes)
    VALUES (new.id, v_title, v_notes)
    ON CONFLICT (series_id) DO UPDATE
      SET title = excluded.title, notes = excluded.notes, updated_at = now();
  ELSIF new.title IS DISTINCT FROM old.title OR new.notes IS DISTINCT FROM old.notes THEN
    SELECT title, notes INTO v_title, v_notes
    FROM public.activity_series_confidential_content WHERE series_id = new.id;
    v_title := CASE
      WHEN new.title IS DISTINCT FROM old.title AND new.title <> 'Serviço Administração'
        THEN coalesce(nullif(btrim(new.title), ''), v_title, 'Serviço Administração')
      ELSE coalesce(v_title, 'Serviço Administração')
    END;
    v_notes := CASE
      WHEN new.notes IS DISTINCT FROM old.notes THEN nullif(new.notes, '')
      ELSE v_notes
    END;
    INSERT INTO public.activity_series_confidential_content (series_id, title, notes)
    VALUES (new.id, v_title, v_notes)
    ON CONFLICT (series_id) DO UPDATE
      SET title = excluded.title, notes = excluded.notes, updated_at = now();
  END IF;

  new.title := 'Serviço Administração';
  new.notes := NULL;
  RETURN new;
END;
$$;

CREATE TRIGGER activity_series_protect_admin_content
BEFORE INSERT OR UPDATE OF title, notes, tag_id ON public.activity_series
FOR EACH ROW EXECUTE FUNCTION public.protect_admin_series_content();

CREATE OR REPLACE FUNCTION public.cleanup_activity_confidential_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.activity_confidential_content WHERE activity_id = old.id;
  RETURN old;
END;
$$;

CREATE TRIGGER activities_cleanup_confidential_content
AFTER DELETE ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.cleanup_activity_confidential_content();

CREATE OR REPLACE FUNCTION public.cleanup_series_confidential_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.activity_series_confidential_content WHERE series_id = old.id;
  RETURN old;
END;
$$;

CREATE TRIGGER activity_series_cleanup_confidential_content
AFTER DELETE ON public.activity_series
FOR EACH ROW EXECUTE FUNCTION public.cleanup_series_confidential_content();

CREATE OR REPLACE FUNCTION public.activities_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE u record; d_name text; act text; driver_user uuid; old_driver_user uuid; a_user uuid; when_txt text;
        body text; body_masked text; shown_title text; v_is_admin boolean;
BEGIN
  IF new.driver_id IS NOT NULL THEN
    SELECT name, user_id INTO d_name, driver_user FROM public.drivers WHERE id = new.driver_id;
  END IF;
  IF tg_op = 'INSERT' THEN act := 'activity_created';
  ELSIF new.status = 'cancelled' AND old.status <> 'cancelled' THEN act := 'activity_cancelled';
  ELSIF new.driver_id IS DISTINCT FROM old.driver_id THEN act := 'activity_driver_changed';
  ELSE act := 'activity_updated';
  END IF;

  SELECT (t.system_key = 'admin') INTO v_is_admin FROM public.event_tags t WHERE t.id = new.tag_id;
  PERFORM public.audit(act, 'activity', new.id,
    CASE WHEN tg_op = 'UPDATE' THEN
      CASE WHEN coalesce(v_is_admin, false) THEN to_jsonb(old) - 'notes' - 'title' ELSE to_jsonb(old) - 'notes' END
    ELSE NULL END,
    CASE WHEN coalesce(v_is_admin, false) THEN to_jsonb(new) - 'notes' - 'title' ELSE to_jsonb(new) - 'notes' END);

  IF coalesce(current_setting('app.recalc_travel', true), '') = 'on' THEN RETURN new; END IF;

  when_txt := to_char(new.start_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI');
  shown_title := CASE WHEN coalesce(v_is_admin, false) THEN 'Serviço Administração' ELSE new.title END;
  body := shown_title || ' - ' || coalesce(d_name, 'Por atribuir') || ' - ' || when_txt;
  body_masked := shown_title || ' - ' || coalesce(d_name, 'Por atribuir') || ' - ' || when_txt;
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
          body_masked, 'activity', 'activity', new.id);
      END IF;
    END LOOP;
  END IF;

  IF tg_op = 'UPDATE' AND old.driver_id IS NOT NULL AND new.driver_id IS DISTINCT FROM old.driver_id THEN
    SELECT user_id INTO old_driver_user FROM public.drivers WHERE id = old.driver_id;
    IF old_driver_user IS NOT NULL AND old_driver_user IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify(old_driver_user, 'Serviço transferido para outro motorista', shown_title || ' - ' || when_txt, 'activity', 'activity', new.id);
    END IF;
  END IF;

  IF new.status <> 'cancelled' AND new.assignment_status = 'pending_manual'
     AND (tg_op = 'INSERT' OR old.assignment_status <> 'pending_manual') THEN
    PERFORM public.notify_pending_assignment(new.id);
  END IF;
  RETURN new;
END; $function$;