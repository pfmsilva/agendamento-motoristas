-- 1. Até dois assistentes principais por Administrador
DROP INDEX IF EXISTS public.assistant_one_primary;

CREATE OR REPLACE FUNCTION public.assistant_admins_primary_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  IF new.relationship_type = 'primary' AND new.active THEN
    SELECT count(*) INTO n
      FROM public.assistant_administrators l
     WHERE l.administrator_id = new.administrator_id
       AND l.relationship_type = 'primary'
       AND l.active
       AND l.id <> new.id;
    IF n >= 2 THEN
      RAISE EXCEPTION 'Este Administrador já tem dois assistentes principais.';
    END IF;
  END IF;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS t_assistant_admins_primary_limit ON public.assistant_administrators;
CREATE TRIGGER t_assistant_admins_primary_limit
  BEFORE INSERT OR UPDATE ON public.assistant_administrators
  FOR EACH ROW EXECUTE FUNCTION public.assistant_admins_primary_limit();

-- 2. Registo do cancelamento
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelled_by_role public.app_role,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

-- 3. Os guardas ignoram a operação de cancelamento (registada à parte)
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
     OR coalesce(current_setting('app.cancel_rpc', true), '') = 'on' THEN
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

CREATE OR REPLACE FUNCTION public.activities_past_change_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tracked text[] := ARRAY['title','type','notes','start_datetime','end_datetime','city_id',
                          'origin_city_id','status','round_trip','tag_id',
                          'driver_adjusted_start','driver_adjusted_end','adjustment_reason_id'];
  f text; oldj jsonb := to_jsonb(old); newj jsonb := to_jsonb(new);
  ov jsonb := '{}'::jsonb; nv jsonb := '{}'::jsonb; ch jsonb;
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
    IF (oldj -> f) IS DISTINCT FROM (newj -> f) THEN
      ov := ov || jsonb_build_object(f, oldj -> f);
      nv := nv || jsonb_build_object(f, newj -> f);
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

-- 4. Cancelamento único para todos os perfis
CREATE OR REPLACE FUNCTION public.cancel_activity(_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a record; v_role public.app_role; v_driver uuid := public.my_driver_id();
  v_reason text := nullif(btrim(coalesce(_reason, '')), '');
  d_name text; shown_title text; body text; r record; v_admin boolean;
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = _id;
  IF a IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe.'; END IF;
  IF a.status = 'cancelled' THEN RETURN; END IF;

  SELECT role INTO v_role FROM public.user_roles
   WHERE user_id = auth.uid()
   ORDER BY CASE role::text
              WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 WHEN 'administrator' THEN 3
              WHEN 'assistant' THEN 4 ELSE 5 END
   LIMIT 1;

  IF public.can_edit_activities() OR public.serves_administrator(a.administrator_id)
     OR (a.assistant_id IS NOT NULL AND a.assistant_id = public.my_assistant_id()) THEN
    NULL;
  ELSIF v_driver IS NOT NULL AND a.driver_id = v_driver THEN
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'Indique o motivo do cancelamento.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Não tem permissão para cancelar este serviço';
  END IF;

  PERFORM set_config('app.cancel_rpc', 'on', true);
  PERFORM set_config('app.assistant_rpc', 'on', true);
  UPDATE public.activities
     SET status = 'cancelled',
         updated_by = auth.uid(),
         cancelled_by = auth.uid(),
         cancelled_by_role = v_role,
         cancelled_at = now(),
         cancel_reason = v_reason
   WHERE id = _id;
  PERFORM set_config('app.assistant_rpc', 'off', true);
  PERFORM set_config('app.cancel_rpc', 'off', true);

  PERFORM public.audit('activity_cancelled', 'activity', _id,
    jsonb_build_object('status', a.status),
    jsonb_build_object('status', 'cancelled',
                       'cancelled_by', auth.uid(),
                       'cancelled_by_role', v_role,
                       'cancelled_at', now(),
                       'cancel_reason', v_reason));

  -- Cancelamento pelo motorista: avisar Gestor e Proprietário.
  IF v_driver IS NOT NULL AND a.driver_id = v_driver AND NOT public.is_privileged_user(auth.uid()) THEN
    SELECT name INTO d_name FROM public.drivers WHERE id = a.driver_id;
    SELECT (t.system_key = 'admin') INTO v_admin FROM public.event_tags t WHERE t.id = a.tag_id;
    shown_title := CASE WHEN coalesce(v_admin, false) THEN 'Serviço Administração' ELSE a.title END;
    body := 'Motorista: ' || coalesce(d_name, '-') || chr(10)
         || 'Serviço: ' || shown_title || chr(10)
         || 'Data: ' || to_char(a.start_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') || chr(10)
         || 'Cancelado em: ' || to_char(now() AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') || chr(10)
         || 'Motivo: ' || coalesce(v_reason, '-');
    FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role::text IN ('owner', 'manager') LOOP
      PERFORM public.notify(r.user_id, 'Serviço cancelado pelo motorista', body,
                            'service_cancelled', 'activity', _id);
    END LOOP;
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.cancel_activity(uuid, text) TO authenticated;

-- O cancelamento do assistente/administrador passa pelo mesmo caminho
CREATE OR REPLACE FUNCTION public.cancel_service_auto(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.cancel_activity(_id, NULL);
END; $$;