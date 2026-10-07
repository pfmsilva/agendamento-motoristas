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
  IF NOT coalesce(v_is_admin, false) THEN RETURN new; END IF;

  SELECT title, notes INTO v_title, v_notes
  FROM public.activity_confidential_content WHERE activity_id = new.id;

  IF NOT FOUND THEN
    v_title := coalesce(nullif(btrim(new.title), ''), 'Serviço Administração');
    v_notes := nullif(new.notes, '');
  ELSIF tg_op = 'UPDATE' THEN
    IF new.title IS DISTINCT FROM old.title AND new.title <> 'Serviço Administração' THEN
      v_title := coalesce(nullif(btrim(new.title), ''), v_title);
    END IF;
    IF new.notes IS DISTINCT FROM old.notes THEN v_notes := nullif(new.notes, ''); END IF;
  END IF;

  INSERT INTO public.activity_confidential_content (activity_id, title, notes)
  VALUES (new.id, coalesce(v_title, 'Serviço Administração'), v_notes)
  ON CONFLICT (activity_id) DO UPDATE
    SET title = excluded.title, notes = excluded.notes, updated_at = now();

  new.title := 'Serviço Administração';
  new.notes := NULL;
  RETURN new;
END;
$$;

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
  IF NOT coalesce(v_is_admin, false) THEN RETURN new; END IF;

  SELECT title, notes INTO v_title, v_notes
  FROM public.activity_series_confidential_content WHERE series_id = new.id;

  IF NOT FOUND THEN
    v_title := coalesce(nullif(btrim(new.title), ''), 'Serviço Administração');
    v_notes := nullif(new.notes, '');
  ELSIF tg_op = 'UPDATE' THEN
    IF new.title IS DISTINCT FROM old.title AND new.title <> 'Serviço Administração' THEN
      v_title := coalesce(nullif(btrim(new.title), ''), v_title);
    END IF;
    IF new.notes IS DISTINCT FROM old.notes THEN v_notes := nullif(new.notes, ''); END IF;
  END IF;

  INSERT INTO public.activity_series_confidential_content (series_id, title, notes)
  VALUES (new.id, coalesce(v_title, 'Serviço Administração'), v_notes)
  ON CONFLICT (series_id) DO UPDATE
    SET title = excluded.title, notes = excluded.notes, updated_at = now();

  new.title := 'Serviço Administração';
  new.notes := NULL;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_admin_activity_content() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_admin_series_content() FROM PUBLIC, anon, authenticated;