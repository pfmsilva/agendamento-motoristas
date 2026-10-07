CREATE OR REPLACE FUNCTION public.is_privileged_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _uid AND role::text IN ('owner', 'manager')
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_privileged_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_service_series(_administrator_id uuid, _title text, _type activity_type, _city_id uuid, _start timestamp with time zone, _end timestamp with time zone, _notes text, _freq recurrence_freq, _until date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s_id uuid; v_series uuid; base_name text; city_name text; city_base boolean;
  i integer := 0; occ_s timestamptz; occ_e timestamptz; w record; pick record;
  dur interval; made integer := 0; n_occ integer := 0;
BEGIN
  IF _administrator_id IS NULL THEN RAISE EXCEPTION 'Indique o Administrador'; END IF;
  IF NOT (public.can_edit_activities() OR public.serves_administrator(_administrator_id)) THEN
    RAISE EXCEPTION 'Não tem permissão para criar serviços para este Administrador';
  END IF;
  IF btrim(coalesce(_title, '')) = '' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'O fim do serviço tem de ser posterior ao início'; END IF;
  IF _until IS NULL THEN RAISE EXCEPTION 'Indique a data de fim da repetição'; END IF;
  IF _until < (_start AT TIME ZONE 'Europe/Lisbon')::date THEN
    RAISE EXCEPTION 'A data de fim da repetição tem de ser posterior ao primeiro serviço';
  END IF;

  -- Limite único da aplicação: 120 ocorrências. Nunca truncar em silêncio.
  LOOP
    EXIT WHEN (public.series_shift(_start, _freq, n_occ) AT TIME ZONE 'Europe/Lisbon')::date > _until;
    n_occ := n_occ + 1;
    IF n_occ > 120 THEN
      RAISE EXCEPTION 'A repetição selecionada ultrapassa o limite máximo de 120 ocorrências. Reduza o período de repetição.';
    END IF;
  END LOOP;

  s_id := public.my_assistant_id();
  dur := _end - _start;
  SELECT name INTO base_name FROM public.cities WHERE is_base LIMIT 1;
  IF _city_id IS NOT NULL THEN
    SELECT name, is_base INTO city_name, city_base FROM public.cities WHERE id = _city_id;
  END IF;

  INSERT INTO public.activity_series (administrator_id, assistant_id, title, type, city_id, notes,
                                      first_start, first_end, frequency, until_date, created_by)
  VALUES (_administrator_id, s_id, btrim(_title), coalesce(_type, 'trip'), _city_id, nullif(_notes, ''),
          _start, _end, _freq, _until, auth.uid())
  RETURNING id INTO v_series;

  LOOP
    occ_s := public.series_shift(_start, _freq, i);
    EXIT WHEN (occ_s AT TIME ZONE 'Europe/Lisbon')::date > _until OR made >= 120;
    occ_e := occ_s + dur;

    SELECT * INTO w FROM public.occupation_window(_city_id, occ_s, occ_e);
    SELECT * INTO pick FROM public.pick_driver_by_priority(_administrator_id, w.occ_start, w.occ_end, NULL, NULL);

    INSERT INTO public.activities (title, type, event_kind, driver_id, city_id, start_datetime, end_datetime,
                                   origin, destination, notes, status, assistant_id, administrator_id,
                                   assignment_status, assignment_attempts, assigned_at,
                                   series_id, series_index, created_by, updated_by)
    VALUES (btrim(_title), coalesce(_type, 'trip'), 'administration', pick.driver_id, _city_id, occ_s, occ_e,
            base_name, CASE WHEN city_name IS NOT NULL AND NOT coalesce(city_base, false) THEN city_name END,
            nullif(_notes, ''), 'confirmed', s_id, _administrator_id,
            CASE WHEN pick.driver_id IS NULL THEN 'pending_manual'::public.assignment_status ELSE 'automatic' END,
            pick.attempts, CASE WHEN pick.driver_id IS NULL THEN NULL ELSE now() END,
            v_series, i, auth.uid(), auth.uid());

    made := made + 1;
    i := i + 1;
  END LOOP;

  PERFORM public.audit('service_series_created', 'activity_series', v_series, NULL,
    jsonb_build_object('title', btrim(_title), 'frequency', _freq, 'until', _until, 'occurrences', made));
  RETURN v_series;
END; $function$;

CREATE OR REPLACE FUNCTION public.activities_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE u record; d_name text; act text; driver_user uuid; old_driver_user uuid; a_user uuid; when_txt text;
        body text; body_masked text; shown_title text;
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
  -- Gestor/Proprietário nunca recebem o título de um serviço de Administração.
  shown_title := CASE WHEN new.event_kind = 'administration' THEN 'Serviço Administração' ELSE new.title END;
  body_masked := shown_title || ' - ' || coalesce(d_name, 'Por atribuir') || ' - ' || when_txt;
  SELECT s.user_id INTO a_user FROM public.assistants s WHERE s.id = new.assistant_id;

  IF act IN ('activity_created', 'activity_driver_changed') THEN
    IF new.driver_id IS NOT NULL AND driver_user IS NOT NULL AND driver_user IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify(driver_user, 'Novo serviço atribuído',
        CASE WHEN public.is_privileged_user(driver_user) THEN body_masked ELSE body END,
        'activity', 'activity', new.id);
    END IF;
    IF act = 'activity_driver_changed' AND new.driver_id IS NOT NULL AND a_user IS NOT NULL AND a_user IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify(a_user, 'Motorista atribuído ao seu serviço',
        CASE WHEN public.is_privileged_user(a_user) THEN body_masked ELSE body END,
        'activity', 'activity', new.id);
    END IF;
  ELSE
    FOR u IN
      SELECT user_id FROM public.driver_audience(new.driver_id)
      UNION SELECT a_user WHERE a_user IS NOT NULL
    LOOP
      IF u.user_id IS DISTINCT FROM auth.uid() THEN
        PERFORM public.notify(u.user_id,
          CASE act WHEN 'activity_cancelled' THEN 'Serviço cancelado' ELSE 'Serviço atualizado' END,
          CASE WHEN public.is_privileged_user(u.user_id) THEN body_masked ELSE body END,
          'activity', 'activity', new.id);
      END IF;
    END LOOP;
  END IF;

  IF tg_op = 'UPDATE' AND old.driver_id IS NOT NULL AND new.driver_id IS DISTINCT FROM old.driver_id THEN
    SELECT user_id INTO old_driver_user FROM public.drivers WHERE id = old.driver_id;
    IF old_driver_user IS NOT NULL AND old_driver_user IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify(old_driver_user, 'Serviço transferido para outro motorista',
        CASE WHEN public.is_privileged_user(old_driver_user) THEN shown_title ELSE new.title END || ' - ' || when_txt,
        'activity', 'activity', new.id);
    END IF;
  END IF;

  IF new.status <> 'cancelled' AND new.assignment_status = 'pending_manual'
     AND (tg_op = 'INSERT' OR old.assignment_status <> 'pending_manual') THEN
    PERFORM public.notify_pending_assignment(new.id);
  END IF;
  RETURN new;
END; $function$;

CREATE OR REPLACE FUNCTION public.notify_pending_assignment(_activity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a record; s_name text; ad_name text; r record; body text; reason text; shown_title text;
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = _activity_id;
  IF a IS NULL THEN RETURN; END IF;
  SELECT name INTO s_name FROM public.assistants WHERE id = a.assistant_id;
  SELECT name INTO ad_name FROM public.administrators WHERE id = a.administrator_id;
  IF a.assignment_attempts IS NULL OR jsonb_array_length(a.assignment_attempts) = 0 THEN
    reason := 'a hierarquia deste Administrador não tem motoristas';
  ELSE
    reason := 'nenhum motorista da hierarquia estava disponível';
  END IF;
  -- Só Gestor/Proprietário recebem este aviso: título sempre genérico na Administração.
  shown_title := CASE WHEN a.event_kind = 'administration' THEN 'Serviço Administração' ELSE a.title END;
  body := 'Serviço: ' || shown_title || E'\n' ||
          'Data: ' || to_char(a.start_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') ||
          ' às ' || to_char(a.start_datetime AT TIME ZONE 'Europe/Lisbon', 'HH24:MI') || E'\n' ||
          'Administrador: ' || coalesce(ad_name, '-') || E'\n' ||
          'Assistente: ' || coalesce(s_name, '-') || E'\n' ||
          'Motivo: ' || reason || '.';
  FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role::text IN ('owner', 'manager') LOOP
    PERFORM public.notify(r.user_id, 'Atribuição manual necessária', body, 'assignment_pending', 'activity', a.id);
  END LOOP;
END; $function$;