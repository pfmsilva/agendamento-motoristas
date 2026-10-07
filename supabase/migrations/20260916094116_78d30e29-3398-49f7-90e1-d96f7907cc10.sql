-- 1. As RPCs já verificam permissões: o guarda não pode recusá-las outra vez.
CREATE OR REPLACE FUNCTION public.activities_driver_adjust_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE reason_label text;
BEGIN
  IF coalesce(current_setting('app.system_reassign', true), '') = 'on'
     OR coalesce(current_setting('app.validation_restore', true), '') = 'on'
     OR coalesce(current_setting('app.cancel_rpc', true), '') = 'on'
     OR coalesce(current_setting('app.assistant_rpc', true), '') = 'on' THEN
    RETURN new;
  END IF;

  IF new.driver_adjusted_start IS DISTINCT FROM old.driver_adjusted_start
     OR new.driver_adjusted_end IS DISTINCT FROM old.driver_adjusted_end THEN
    IF NOT public.can_manage_driver_schedule(new.driver_id)
       AND NOT public.my_driver_can_create_events() THEN
      RAISE EXCEPTION 'Não tem permissão para alterar eventos.';
    END IF;
    IF new.driver_adjusted_start IS NULL AND new.driver_adjusted_end IS NULL THEN
      new.adjustment_source := NULL;
      new.adjustment_reason_id := NULL;
      new.adjusted_by := NULL;
      new.adjusted_at := NULL;
    ELSE
      SELECT label INTO reason_label FROM public.travel_adjust_reasons
       WHERE id = new.adjustment_reason_id AND active;
      IF reason_label IS NULL THEN
        RAISE EXCEPTION 'Selecione o motivo do ajuste da deslocação.';
      END IF;
      IF public.can_manage_driver_schedule(new.driver_id) THEN
        new.adjustment_source := 'gestor';
      ELSE
        new.adjustment_source := 'motorista';
      END IF;
      new.adjusted_by := auth.uid();
      new.adjusted_at := now();
    END IF;

    PERFORM public.audit('activity_occupation_adjusted', 'activity', new.id,
      jsonb_build_object('driver_adjusted_start', old.driver_adjusted_start,
                         'driver_adjusted_end', old.driver_adjusted_end,
                         'adjustment_source', old.adjustment_source,
                         'adjustment_reason_id', old.adjustment_reason_id,
                         'adjustment_reason', (SELECT label FROM public.travel_adjust_reasons WHERE id = old.adjustment_reason_id)),
      jsonb_build_object('driver_adjusted_start', new.driver_adjusted_start,
                         'driver_adjusted_end', new.driver_adjusted_end,
                         'adjustment_source', new.adjustment_source,
                         'adjustment_reason_id', new.adjustment_reason_id,
                         'adjustment_reason', reason_label));
  ELSIF new.adjustment_reason_id IS DISTINCT FROM old.adjustment_reason_id
        AND (new.driver_adjusted_start IS NOT NULL OR new.driver_adjusted_end IS NOT NULL) THEN
    IF NOT public.can_manage_driver_schedule(new.driver_id)
       AND NOT public.my_driver_can_create_events() THEN
      RAISE EXCEPTION 'Não tem permissão para alterar eventos.';
    END IF;
    new.adjusted_by := auth.uid();
    new.adjusted_at := now();
  END IF;

  IF public.can_manage_driver_schedule(new.driver_id) THEN
    RETURN new;
  END IF;

  IF NOT public.my_driver_can_create_events() THEN
    RAISE EXCEPTION 'Não tem permissão para alterar eventos.';
  END IF;

  IF new.driver_id <> old.driver_id OR new.driver_id IS DISTINCT FROM public.my_driver_id() THEN
    RAISE EXCEPTION 'Não tem permissão para alterar esta atividade';
  END IF;

  IF new.title IS DISTINCT FROM old.title
     OR new.type IS DISTINCT FROM old.type
     OR new.start_datetime IS DISTINCT FROM old.start_datetime
     OR new.end_datetime IS DISTINCT FROM old.end_datetime
     OR new.city_id IS DISTINCT FROM old.city_id
     OR new.origin_city_id IS DISTINCT FROM old.origin_city_id
     OR new.status IS DISTINCT FROM old.status
     OR new.notes IS DISTINCT FROM old.notes THEN
    RAISE EXCEPTION 'O motorista só pode ajustar o seu período de ocupação';
  END IF;

  RETURN new;
END; $$;

-- 2. Ajuste de ocupação: uma só operação para o formulário e para o arrasto,
--    com as mesmas permissões dos restantes fluxos e âmbito de série.
CREATE OR REPLACE FUNCTION public.adjust_activity_occupation(
  _id uuid,
  _start timestamptz,
  _end timestamptz,
  _reason_id uuid,
  _scope text DEFAULT 'one'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a record; r record; n integer := 0;
  d_start interval; d_end interval; s timestamptz; e timestamptz;
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = _id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe.'; END IF;

  IF NOT (public.can_edit_activities()
          OR public.serves_administrator(a.administrator_id)
          OR (a.driver_id IS NOT NULL AND a.driver_id = public.my_driver_id())) THEN
    RAISE EXCEPTION 'Não tem permissão para alterar eventos.';
  END IF;

  IF _scope NOT IN ('one', 'future') THEN RAISE EXCEPTION 'Âmbito inválido'; END IF;

  IF _start IS NOT NULL OR _end IS NOT NULL THEN
    IF _start IS NULL OR _end IS NULL THEN
      RAISE EXCEPTION 'Indique o início e o fim da ocupação.';
    END IF;
    IF _end <= _start THEN RAISE EXCEPTION 'O fim da ocupação tem de ser posterior ao início.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.travel_adjust_reasons WHERE id = _reason_id AND active) THEN
      RAISE EXCEPTION 'Selecione o motivo do ajuste da deslocação.';
    END IF;
  END IF;

  PERFORM set_config('app.assistant_rpc', 'on', true);

  UPDATE public.activities
     SET driver_adjusted_start = _start,
         driver_adjusted_end = _end,
         adjustment_reason_id = CASE WHEN _start IS NULL AND _end IS NULL THEN NULL ELSE _reason_id END,
         updated_by = auth.uid()
   WHERE id = _id;
  n := 1;

  -- Esta e as datas seguintes: o mesmo desvio relativo à ocupação calculada.
  IF _scope = 'future' AND a.series_id IS NOT NULL AND _start IS NOT NULL THEN
    d_start := _start - coalesce(a.calculated_occupation_start, a.start_datetime);
    d_end := _end - coalesce(a.calculated_occupation_end, a.end_datetime);
    FOR r IN
      SELECT * FROM public.activities
       WHERE series_id = a.series_id AND id <> a.id
         AND status <> 'cancelled'
         AND start_datetime > a.start_datetime
    LOOP
      s := coalesce(r.calculated_occupation_start, r.start_datetime) + d_start;
      e := coalesce(r.calculated_occupation_end, r.end_datetime) + d_end;
      IF e > s THEN
        UPDATE public.activities
           SET driver_adjusted_start = s,
               driver_adjusted_end = e,
               adjustment_reason_id = _reason_id,
               updated_by = auth.uid()
         WHERE id = r.id;
        n := n + 1;
      END IF;
    END LOOP;
  ELSIF _scope = 'future' AND a.series_id IS NOT NULL AND _start IS NULL THEN
    FOR r IN
      SELECT * FROM public.activities
       WHERE series_id = a.series_id AND id <> a.id
         AND status <> 'cancelled'
         AND start_datetime > a.start_datetime
    LOOP
      UPDATE public.activities
         SET driver_adjusted_start = NULL,
             driver_adjusted_end = NULL,
             adjustment_reason_id = NULL,
             updated_by = auth.uid()
       WHERE id = r.id;
      n := n + 1;
    END LOOP;
  END IF;

  PERFORM set_config('app.assistant_rpc', 'off', true);
  RETURN n;
END; $$;

REVOKE ALL ON FUNCTION public.adjust_activity_occupation(uuid, timestamptz, timestamptz, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.adjust_activity_occupation(uuid, timestamptz, timestamptz, uuid, text) TO authenticated;

-- 3. Validação de alterações retroativas: valores anteriores reais e sem ruído técnico.
CREATE OR REPLACE FUNCTION public.activities_past_change_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tracked text[] := ARRAY['title','type','notes','start_datetime','end_datetime','city_id',
                          'origin_city_id','status','round_trip',
                          'driver_adjusted_start','driver_adjusted_end','adjustment_reason_id'];
  f text; oldj jsonb := to_jsonb(old); newj jsonb := to_jsonb(new);
  ov jsonb := '{}'::jsonb; nv jsonb := '{}'::jsonb; ch jsonb;
  oldval jsonb; newval jsonb;
  v_admin boolean; existing public.activity_change_validations; v_id uuid;
  d_name text; shown_title text; body text; lines text := ''; r record; item jsonb;
BEGIN
  IF coalesce(current_setting('app.validation_restore', true), '') = 'on'
     OR coalesce(current_setting('app.system_reassign', true), '') = 'on'
     OR coalesce(current_setting('app.recalc_travel', true), '') = 'on'
     OR coalesce(current_setting('app.cancel_rpc', true), '') = 'on' THEN
    RETURN new;
  END IF;

  IF public.my_driver_id() IS NULL
     OR public.my_driver_id() IS DISTINCT FROM old.driver_id
     OR public.is_privileged_user(auth.uid()) THEN
    RETURN new;
  END IF;

  IF coalesce(old.effective_end, old.end_datetime) >= now() THEN RETURN new; END IF;

  SELECT (t.system_key = 'admin') INTO v_admin FROM public.event_tags t WHERE t.id = new.tag_id;

  FOREACH f IN ARRAY tracked LOOP
    IF coalesce(v_admin, false) AND f IN ('title', 'notes') THEN CONTINUE; END IF;
    oldval := oldj -> f;
    newval := newj -> f;
    -- Sem ajuste anterior, o valor anterior real é a ocupação calculada.
    IF f = 'driver_adjusted_start' AND (oldval IS NULL OR oldval = 'null'::jsonb) THEN
      oldval := to_jsonb(coalesce(old.calculated_occupation_start, old.start_datetime));
    ELSIF f = 'driver_adjusted_end' AND (oldval IS NULL OR oldval = 'null'::jsonb) THEN
      oldval := to_jsonb(coalesce(old.calculated_occupation_end, old.end_datetime));
    END IF;
    IF f = 'driver_adjusted_start' AND (newval IS NULL OR newval = 'null'::jsonb) THEN
      newval := to_jsonb(coalesce(new.calculated_occupation_start, new.start_datetime));
    ELSIF f = 'driver_adjusted_end' AND (newval IS NULL OR newval = 'null'::jsonb) THEN
      newval := to_jsonb(coalesce(new.calculated_occupation_end, new.end_datetime));
    END IF;
    IF (oldj -> f) IS DISTINCT FROM (newj -> f) AND oldval IS DISTINCT FROM newval THEN
      ov := ov || jsonb_build_object(f, oldval);
      nv := nv || jsonb_build_object(f, newval);
    END IF;
  END LOOP;
  IF ov = '{}'::jsonb THEN RETURN new; END IF;

  SELECT * INTO existing FROM public.activity_change_validations
   WHERE activity_id = new.id AND status = 'pending' FOR UPDATE;

  IF FOUND THEN
    ov := ov || existing.old_values;
    nv := existing.new_values || nv;
  END IF;

  SELECT coalesce(jsonb_object_agg(k, ov -> k), '{}'::jsonb) INTO ov
    FROM jsonb_object_keys(ov) AS t(k) WHERE (ov -> k) IS DISTINCT FROM (nv -> k);
  SELECT coalesce(jsonb_object_agg(k, nv -> k), '{}'::jsonb) INTO nv
    FROM jsonb_object_keys(nv) AS t(k) WHERE ov ? k;

  IF ov = '{}'::jsonb THEN
    IF existing.id IS NOT NULL THEN
      DELETE FROM public.activity_change_validations WHERE id = existing.id;
    END IF;
    RETURN new;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('field', k, 'old', ov -> k, 'new', nv -> k) ORDER BY k), '[]'::jsonb)
    INTO ch FROM jsonb_object_keys(ov) AS t(k);

  SELECT name INTO d_name FROM public.drivers WHERE id = old.driver_id;
  shown_title := CASE WHEN coalesce(v_admin, false) THEN 'Serviço Administração' ELSE new.title END;

  IF existing.id IS NOT NULL THEN
    UPDATE public.activity_change_validations
       SET changes = ch, old_values = ov, new_values = nv, changed_at = now(),
           event_start = new.start_datetime, event_title = shown_title
     WHERE id = existing.id;
    RETURN new;
  END IF;

  INSERT INTO public.activity_change_validations
    (activity_id, driver_id, changed_by, event_start, event_title, changes, old_values, new_values)
  VALUES (new.id, old.driver_id, auth.uid(), new.start_datetime, shown_title, ch, ov, nv)
  RETURNING id INTO v_id;

  FOR item IN SELECT * FROM jsonb_array_elements(ch) LOOP
    lines := lines || chr(10) || '• ' || public.validation_field_label(item ->> 'field') || ': '
          || public.validation_value_label(item ->> 'field', item -> 'old') || ' → '
          || public.validation_value_label(item ->> 'field', item -> 'new');
  END LOOP;

  body := 'Motorista: ' || coalesce(d_name, '-') || chr(10)
       || 'Evento: ' || shown_title || chr(10)
       || 'Data do evento: ' || to_char(new.start_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') || chr(10)
       || 'Alterado em: ' || to_char(now() AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') || chr(10)
       || 'Campos alterados:' || lines;

  FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role::text IN ('owner', 'manager') LOOP
    PERFORM public.notify(r.user_id, 'Validação pendente de alteração a evento passado',
                          body, 'change_validation', 'activity_validation', v_id);
  END LOOP;

  PERFORM public.audit('activity_change_validation_requested', 'activity_validation', v_id, ov, nv);
  RETURN new;
END; $$;