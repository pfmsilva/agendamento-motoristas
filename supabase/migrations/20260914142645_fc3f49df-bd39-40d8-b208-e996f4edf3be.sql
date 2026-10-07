-- 1. Estado dos pedidos de validação
DO $$ BEGIN
  CREATE TYPE public.validation_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tabela de pedidos
CREATE TABLE public.activity_change_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.drivers(id),
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  event_start timestamptz NOT NULL,
  event_title text NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  old_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.validation_status NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.activity_change_validations TO authenticated;
GRANT ALL ON public.activity_change_validations TO service_role;

ALTER TABLE public.activity_change_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor e Proprietario veem validacoes"
  ON public.activity_change_validations FOR SELECT TO authenticated
  USING (public.is_manager() OR public.is_owner());

CREATE UNIQUE INDEX activity_change_validations_one_pending
  ON public.activity_change_validations (activity_id) WHERE status = 'pending';
CREATE INDEX activity_change_validations_status_idx
  ON public.activity_change_validations (status, changed_at DESC);

CREATE TRIGGER t_activity_change_validations_updated
  BEFORE UPDATE ON public.activity_change_validations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.activity_change_validations REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_change_validations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Rótulos PT-PT dos campos e dos valores
CREATE OR REPLACE FUNCTION public.validation_field_label(_field text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _field
    WHEN 'title' THEN 'Título'
    WHEN 'type' THEN 'Tipo'
    WHEN 'notes' THEN 'Notas'
    WHEN 'start_datetime' THEN 'Início do serviço'
    WHEN 'end_datetime' THEN 'Fim do serviço'
    WHEN 'city_id' THEN 'Destino'
    WHEN 'origin_city_id' THEN 'Origem'
    WHEN 'passenger' THEN 'Passageiro'
    WHEN 'status' THEN 'Estado'
    WHEN 'round_trip' THEN 'Ida e volta'
    WHEN 'tag_id' THEN 'TAG'
    WHEN 'driver_adjusted_start' THEN 'Início da ocupação'
    WHEN 'driver_adjusted_end' THEN 'Fim da ocupação'
    WHEN 'adjustment_reason_id' THEN 'Motivo do ajuste'
    ELSE _field
  END
$$;

CREATE OR REPLACE FUNCTION public.validation_value_label(_field text, _value jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t text;
BEGIN
  IF _value IS NULL OR jsonb_typeof(_value) = 'null' THEN RETURN '(vazio)'; END IF;
  IF _field IN ('city_id', 'origin_city_id') THEN
    SELECT name INTO t FROM public.cities WHERE id = (_value #>> '{}')::uuid;
    RETURN coalesce(t, '(vazio)');
  ELSIF _field = 'tag_id' THEN
    SELECT label INTO t FROM public.event_tags WHERE id = (_value #>> '{}')::uuid;
    RETURN coalesce(t, '(vazio)');
  ELSIF _field = 'adjustment_reason_id' THEN
    SELECT label INTO t FROM public.travel_adjust_reasons WHERE id = (_value #>> '{}')::uuid;
    RETURN coalesce(t, '(vazio)');
  ELSIF _field IN ('start_datetime', 'end_datetime', 'driver_adjusted_start', 'driver_adjusted_end') THEN
    RETURN to_char((_value #>> '{}')::timestamptz AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI');
  ELSIF _field = 'round_trip' THEN
    RETURN CASE WHEN (_value #>> '{}')::boolean THEN 'Sim' ELSE 'Não' END;
  ELSIF _field = 'status' THEN
    RETURN CASE _value #>> '{}' WHEN 'draft' THEN 'Rascunho' WHEN 'confirmed' THEN 'Confirmado'
                                WHEN 'cancelled' THEN 'Cancelado' ELSE _value #>> '{}' END;
  END IF;
  RETURN coalesce(nullif(_value #>> '{}', ''), '(vazio)');
END; $$;

-- 4. Trigger: alterações de motoristas a eventos passados geram pedido de validação
CREATE OR REPLACE FUNCTION public.activities_past_change_validation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tracked text[] := ARRAY['title','type','notes','start_datetime','end_datetime','city_id',
                          'origin_city_id','passenger','status','round_trip','tag_id',
                          'driver_adjusted_start','driver_adjusted_end','adjustment_reason_id'];
  f text; oldj jsonb := to_jsonb(old); newj jsonb := to_jsonb(new);
  ov jsonb := '{}'::jsonb; nv jsonb := '{}'::jsonb; ch jsonb;
  v_admin boolean; existing public.activity_change_validations; v_id uuid;
  d_name text; shown_title text; body text; lines text := ''; r record; item jsonb;
BEGIN
  IF coalesce(current_setting('app.validation_restore', true), '') = 'on'
     OR coalesce(current_setting('app.system_reassign', true), '') = 'on'
     OR coalesce(current_setting('app.recalc_travel', true), '') = 'on' THEN
    RETURN new;
  END IF;

  -- só alterações feitas pelo próprio motorista do evento
  IF public.my_driver_id() IS NULL
     OR public.my_driver_id() IS DISTINCT FROM old.driver_id
     OR public.is_privileged_user(auth.uid()) THEN
    RETURN new;
  END IF;

  -- só eventos já passados
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
    -- mantém o valor original mais antigo; junta os novos sem duplicar o pedido
    ov := ov || existing.old_values;
    nv := existing.new_values || nv;
  END IF;

  -- campos repostos pelo próprio motorista deixam de precisar de validação
  SELECT coalesce(jsonb_object_agg(k, ov -> k), '{}'::jsonb) INTO ov
    FROM jsonb_object_keys(ov) AS t(k) WHERE (ov -> k) IS DISTINCT FROM (nv -> k);
  SELECT coalesce(jsonb_object_agg(k, nv -> k), '{}'::jsonb) INTO nv
    FROM jsonb_object_keys(nv) AS t(k) WHERE ov ? k;

  IF ov = '{}'::jsonb THEN
    IF FOUND OR existing.id IS NOT NULL THEN
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
    RETURN new;  -- sem notificação repetida para a mesma modificação
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

CREATE TRIGGER t_activities_z_validation
  AFTER UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.activities_past_change_validation();

-- 5. Silenciar guardas e notificações durante a reposição de valores
CREATE OR REPLACE FUNCTION public.activities_driver_adjust_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE reason_label text;
BEGIN
  IF coalesce(current_setting('app.system_reassign', true), '') = 'on'
     OR coalesce(current_setting('app.validation_restore', true), '') = 'on' THEN
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
     OR new.passenger IS DISTINCT FROM old.passenger
     OR new.status IS DISTINCT FROM old.status
     OR new.notes IS DISTINCT FROM old.notes THEN
    RAISE EXCEPTION 'O motorista só pode ajustar o seu período de ocupação';
  END IF;

  RETURN new;
END; $$;

CREATE OR REPLACE FUNCTION public.activities_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  PERFORM public.audit(
    CASE WHEN coalesce(current_setting('app.validation_restore', true), '') = 'on'
         THEN 'activity_change_reverted' ELSE act END,
    'activity', new.id,
    CASE WHEN tg_op = 'UPDATE' THEN
      CASE WHEN coalesce(v_is_admin, false) THEN to_jsonb(old) - 'notes' - 'title' ELSE to_jsonb(old) - 'notes' END
    ELSE NULL END,
    CASE WHEN coalesce(v_is_admin, false) THEN to_jsonb(new) - 'notes' - 'title' ELSE to_jsonb(new) - 'notes' END);

  IF coalesce(current_setting('app.recalc_travel', true), '') = 'on'
     OR coalesce(current_setting('app.validation_restore', true), '') = 'on' THEN
    RETURN new;  -- reposição silenciosa: sem notificações
  END IF;

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
END; $$;

-- 6. Decisão do Gestor/Proprietário
CREATE OR REPLACE FUNCTION public.decide_activity_change(_id uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.activity_change_validations;
BEGIN
  IF NOT (public.is_manager() OR public.is_owner()) THEN
    RAISE EXCEPTION 'Não tem permissão para validar alterações.';
  END IF;

  SELECT * INTO v FROM public.activity_change_validations
   WHERE id = _id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este pedido de validação já foi decidido.';
  END IF;

  IF NOT _approve THEN
    PERFORM set_config('app.validation_restore', 'on', true);
    UPDATE public.activities a SET
      title = CASE WHEN v.old_values ? 'title' THEN v.old_values ->> 'title' ELSE a.title END,
      type = CASE WHEN v.old_values ? 'type' THEN (v.old_values ->> 'type')::public.activity_type ELSE a.type END,
      notes = CASE WHEN v.old_values ? 'notes' THEN v.old_values ->> 'notes' ELSE a.notes END,
      start_datetime = CASE WHEN v.old_values ? 'start_datetime' THEN (v.old_values ->> 'start_datetime')::timestamptz ELSE a.start_datetime END,
      end_datetime = CASE WHEN v.old_values ? 'end_datetime' THEN (v.old_values ->> 'end_datetime')::timestamptz ELSE a.end_datetime END,
      city_id = CASE WHEN v.old_values ? 'city_id' THEN (v.old_values ->> 'city_id')::uuid ELSE a.city_id END,
      origin_city_id = CASE WHEN v.old_values ? 'origin_city_id' THEN (v.old_values ->> 'origin_city_id')::uuid ELSE a.origin_city_id END,
      passenger = CASE WHEN v.old_values ? 'passenger' THEN v.old_values ->> 'passenger' ELSE a.passenger END,
      status = CASE WHEN v.old_values ? 'status' THEN (v.old_values ->> 'status')::public.activity_status ELSE a.status END,
      round_trip = CASE WHEN v.old_values ? 'round_trip' THEN (v.old_values ->> 'round_trip')::boolean ELSE a.round_trip END,
      tag_id = CASE WHEN v.old_values ? 'tag_id' THEN (v.old_values ->> 'tag_id')::uuid ELSE a.tag_id END,
      driver_adjusted_start = CASE WHEN v.old_values ? 'driver_adjusted_start' THEN (v.old_values ->> 'driver_adjusted_start')::timestamptz ELSE a.driver_adjusted_start END,
      driver_adjusted_end = CASE WHEN v.old_values ? 'driver_adjusted_end' THEN (v.old_values ->> 'driver_adjusted_end')::timestamptz ELSE a.driver_adjusted_end END,
      adjustment_reason_id = CASE WHEN v.old_values ? 'adjustment_reason_id' THEN (v.old_values ->> 'adjustment_reason_id')::uuid ELSE a.adjustment_reason_id END
    WHERE a.id = v.activity_id;
    PERFORM set_config('app.validation_restore', 'off', true);
  END IF;

  UPDATE public.activity_change_validations
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END::public.validation_status,
         decided_by = auth.uid(), decided_at = now()
   WHERE id = _id;

  PERFORM public.audit(
    CASE WHEN _approve THEN 'activity_change_validation_approved'
         ELSE 'activity_change_validation_rejected' END,
    'activity_validation', _id, v.old_values, v.new_values);
END; $$;

REVOKE EXECUTE ON FUNCTION public.decide_activity_change(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.decide_activity_change(uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.activities_past_change_validation() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validation_value_label(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.validation_value_label(text, jsonb) TO authenticated;