-- 1. System locations -------------------------------------------------------
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

INSERT INTO public.cities (name, travel_minutes, outbound_minutes, return_minutes, active, travel_configured, is_system)
SELECT 'Casa', 0, 0, 0, true, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.cities WHERE lower(btrim(name)) = 'casa');

CREATE OR REPLACE FUNCTION public.cities_system_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF old.is_system THEN RAISE EXCEPTION 'Este local do sistema não pode ser eliminado.'; END IF;
    RETURN old;
  END IF;
  IF old.is_system THEN
    IF new.name IS DISTINCT FROM old.name THEN
      RAISE EXCEPTION 'O nome deste local do sistema não pode ser alterado.';
    END IF;
    IF new.active IS DISTINCT FROM old.active AND NOT new.active THEN
      RAISE EXCEPTION 'Este local do sistema não pode ser removido.';
    END IF;
    new.is_system := true;
  END IF;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS cities_system_guard ON public.cities;
CREATE TRIGGER cities_system_guard
BEFORE UPDATE OR DELETE ON public.cities
FOR EACH ROW EXECUTE FUNCTION public.cities_system_guard();

-- 2. Travel adjustment reasons ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.travel_adjust_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  is_core boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.travel_adjust_reasons TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.travel_adjust_reasons TO authenticated;
GRANT ALL ON public.travel_adjust_reasons TO service_role;

ALTER TABLE public.travel_adjust_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reasons readable" ON public.travel_adjust_reasons;
CREATE POLICY "reasons readable" ON public.travel_adjust_reasons
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "reasons insert owner" ON public.travel_adjust_reasons;
CREATE POLICY "reasons insert owner" ON public.travel_adjust_reasons
  FOR INSERT TO authenticated WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "reasons update owner" ON public.travel_adjust_reasons;
CREATE POLICY "reasons update owner" ON public.travel_adjust_reasons
  FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "reasons delete owner custom" ON public.travel_adjust_reasons;
CREATE POLICY "reasons delete owner custom" ON public.travel_adjust_reasons
  FOR DELETE TO authenticated USING (public.is_owner() AND NOT is_core);

DROP TRIGGER IF EXISTS travel_adjust_reasons_touch ON public.travel_adjust_reasons;
CREATE TRIGGER travel_adjust_reasons_touch
BEFORE UPDATE ON public.travel_adjust_reasons
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.travel_reason_core_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF old.is_core THEN RAISE EXCEPTION 'Os motivos base do sistema não podem ser eliminados.'; END IF;
    RETURN old;
  END IF;
  IF old.is_core THEN new.is_core := true; END IF;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS travel_reason_core_guard ON public.travel_adjust_reasons;
CREATE TRIGGER travel_reason_core_guard
BEFORE UPDATE OR DELETE ON public.travel_adjust_reasons
FOR EACH ROW EXECUTE FUNCTION public.travel_reason_core_guard();

INSERT INTO public.travel_adjust_reasons (label, is_core, sort_order)
SELECT v.label, true, v.ord
FROM (VALUES
  ('Pedido da Assistente', 1),
  ('Pedido do Administrador', 2),
  ('Pedido do Responsável de Garagem', 3),
  ('Acidente / sinistro', 4)
) AS v(label, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.travel_adjust_reasons r WHERE r.label = v.label);

-- 3. Origin / destination on activities --------------------------------------
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS origin_city_id uuid REFERENCES public.cities(id),
  ADD COLUMN IF NOT EXISTS adjustment_reason_id uuid REFERENCES public.travel_adjust_reasons(id);

SELECT set_config('app.system_reassign', 'on', false);

UPDATE public.activities a
   SET origin_city_id = (SELECT c.id FROM public.cities c WHERE c.is_base ORDER BY c.active DESC LIMIT 1)
 WHERE a.origin_city_id IS NULL;

UPDATE public.activities a
   SET city_id = a.origin_city_id
 WHERE a.city_id IS NULL;

SELECT set_config('app.system_reassign', 'off', false);

CREATE OR REPLACE FUNCTION public.activities_location_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE o_name text; d_name text;
BEGIN
  IF TG_OP = 'INSERT'
     OR new.origin_city_id IS DISTINCT FROM old.origin_city_id
     OR new.city_id IS DISTINCT FROM old.city_id THEN
    IF new.origin_city_id IS NULL THEN
      RAISE EXCEPTION 'Selecione a origem do serviço.';
    END IF;
    IF new.city_id IS NULL THEN
      RAISE EXCEPTION 'Selecione o destino do serviço.';
    END IF;
  END IF;

  SELECT name INTO o_name FROM public.cities WHERE id = new.origin_city_id;
  SELECT name INTO d_name FROM public.cities WHERE id = new.city_id;
  IF new.origin_city_id IS NOT NULL AND o_name IS NULL THEN
    RAISE EXCEPTION 'Selecione uma origem válida para o serviço.';
  END IF;
  IF new.city_id IS NOT NULL AND d_name IS NULL THEN
    RAISE EXCEPTION 'Selecione um destino válido para o serviço.';
  END IF;
  new.origin := o_name;
  new.destination := d_name;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS activities_location_guard ON public.activities;
CREATE TRIGGER activities_location_guard
BEFORE INSERT OR UPDATE ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.activities_location_guard();

-- 4. Mandatory reason for manual travel/occupation adjustments ---------------
CREATE OR REPLACE FUNCTION public.activities_driver_adjust_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE reason_label text;
BEGIN
  IF coalesce(current_setting('app.system_reassign', true), '') = 'on' THEN
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

-- 5. RPCs now carry the origin ------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_service_auto(_administrator_id uuid, _title text, _type activity_type, _city_id uuid, _start timestamptz, _end timestamptz, _notes text, _origin_city_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE s_id uuid; w record; pick record; v_id uuid;
BEGIN
  s_id := public.my_assistant_id();
  IF NOT public.serves_administrator(_administrator_id) THEN
    RAISE EXCEPTION 'Não tem permissão para criar serviços para este Administrador';
  END IF;
  IF btrim(coalesce(_title, '')) = '' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _origin_city_id IS NULL THEN RAISE EXCEPTION 'Selecione a origem do serviço.'; END IF;
  IF _city_id IS NULL THEN RAISE EXCEPTION 'Selecione o destino do serviço.'; END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'O fim do serviço tem de ser posterior ao início'; END IF;

  SELECT * INTO w FROM public.occupation_window(_city_id, _start, _end);
  SELECT * INTO pick FROM public.pick_driver_by_priority(_administrator_id, w.occ_start, w.occ_end, NULL, NULL);

  INSERT INTO public.activities (title, type, driver_id, city_id, origin_city_id, start_datetime, end_datetime, notes,
                                 status, assistant_id, administrator_id, assignment_status, assignment_attempts, assigned_at, created_by, updated_by)
  VALUES (btrim(_title), coalesce(_type, 'trip'), pick.driver_id, _city_id, _origin_city_id, _start, _end, nullif(_notes, ''),
          'confirmed', s_id, _administrator_id,
          CASE WHEN pick.driver_id IS NULL THEN 'pending_manual'::public.assignment_status ELSE 'automatic' END,
          pick.attempts, CASE WHEN pick.driver_id IS NULL THEN NULL ELSE now() END, auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_service_auto(_id uuid, _title text, _type activity_type, _city_id uuid, _start timestamptz, _end timestamptz, _notes text, _expected_updated_at timestamptz, _origin_city_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE a record; w record; pick record; new_status public.assignment_status;
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = _id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe - foi eliminado por outro utilizador.'; END IF;
  IF NOT public.serves_administrator(a.administrator_id) THEN
    RAISE EXCEPTION 'Não tem permissão para alterar este serviço';
  END IF;
  IF _expected_updated_at IS NOT NULL AND a.updated_at <> _expected_updated_at THEN
    RAISE EXCEPTION 'Este registo foi alterado por outro utilizador entretanto. Atualize a página para ver a versão mais recente e repita a alteração.';
  END IF;
  IF btrim(coalesce(_title, '')) = '' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _origin_city_id IS NULL THEN RAISE EXCEPTION 'Selecione a origem do serviço.'; END IF;
  IF _city_id IS NULL THEN RAISE EXCEPTION 'Selecione o destino do serviço.'; END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'O fim do serviço tem de ser posterior ao início'; END IF;

  SELECT * INTO w FROM public.occupation_window(_city_id, _start, _end);
  SELECT * INTO pick FROM public.pick_driver_by_priority(a.administrator_id, w.occ_start, w.occ_end, a.id, a.driver_id);

  IF pick.driver_id IS NULL THEN new_status := 'pending_manual';
  ELSIF pick.driver_id = a.driver_id THEN new_status := CASE WHEN a.assignment_status = 'pending_manual' THEN 'automatic' ELSE a.assignment_status END;
  ELSE new_status := 'automatic';
  END IF;

  PERFORM set_config('app.assistant_rpc', 'on', true);
  UPDATE public.activities SET
    title = btrim(_title), type = coalesce(_type, a.type), city_id = _city_id, origin_city_id = _origin_city_id,
    start_datetime = _start, end_datetime = _end,
    notes = nullif(_notes, ''), driver_id = pick.driver_id, assignment_status = new_status,
    assignment_attempts = pick.attempts,
    assigned_at = CASE WHEN pick.driver_id IS NULL THEN NULL WHEN pick.driver_id = a.driver_id THEN a.assigned_at ELSE now() END,
    driver_adjusted_start = CASE WHEN pick.driver_id = a.driver_id THEN a.driver_adjusted_start END,
    driver_adjusted_end = CASE WHEN pick.driver_id = a.driver_id THEN a.driver_adjusted_end END,
    adjustment_reason_id = CASE WHEN pick.driver_id = a.driver_id THEN a.adjustment_reason_id END,
    updated_by = auth.uid()
  WHERE id = _id;
  PERFORM set_config('app.assistant_rpc', 'off', true);
END; $$;

CREATE OR REPLACE FUNCTION public.create_service_series(_administrator_id uuid, _title text, _type activity_type, _city_id uuid, _start timestamptz, _end timestamptz, _notes text, _freq recurrence_freq, _until date, _origin_city_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  s_id uuid; v_series uuid;
  i integer := 0; occ_s timestamptz; occ_e timestamptz; w record; pick record;
  dur interval; made integer := 0; n_occ integer := 0;
BEGIN
  IF _administrator_id IS NULL THEN RAISE EXCEPTION 'Indique o Administrador'; END IF;
  IF NOT (public.can_edit_activities() OR public.serves_administrator(_administrator_id)) THEN
    RAISE EXCEPTION 'Não tem permissão para criar serviços para este Administrador';
  END IF;
  IF btrim(coalesce(_title, '')) = '' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _origin_city_id IS NULL THEN RAISE EXCEPTION 'Selecione a origem do serviço.'; END IF;
  IF _city_id IS NULL THEN RAISE EXCEPTION 'Selecione o destino do serviço.'; END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'O fim do serviço tem de ser posterior ao início'; END IF;
  IF _until IS NULL THEN RAISE EXCEPTION 'Indique a data de fim da repetição'; END IF;
  IF _until < (_start AT TIME ZONE 'Europe/Lisbon')::date THEN
    RAISE EXCEPTION 'A data de fim da repetição tem de ser posterior ao primeiro serviço';
  END IF;

  LOOP
    EXIT WHEN (public.series_shift(_start, _freq, n_occ) AT TIME ZONE 'Europe/Lisbon')::date > _until;
    n_occ := n_occ + 1;
    IF n_occ > 120 THEN
      RAISE EXCEPTION 'A repetição selecionada ultrapassa o limite máximo de 120 ocorrências. Reduza o período de repetição.';
    END IF;
  END LOOP;

  s_id := public.my_assistant_id();
  dur := _end - _start;

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

    INSERT INTO public.activities (title, type, event_kind, driver_id, city_id, origin_city_id, start_datetime, end_datetime,
                                   notes, status, assistant_id, administrator_id,
                                   assignment_status, assignment_attempts, assigned_at,
                                   series_id, series_index, created_by, updated_by)
    VALUES (btrim(_title), coalesce(_type, 'trip'), 'administration', pick.driver_id, _city_id, _origin_city_id, occ_s, occ_e,
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
END; $$;

CREATE OR REPLACE FUNCTION public.update_service_series(_id uuid, _scope text, _title text, _type activity_type, _city_id uuid, _start_time time without time zone, _duration_minutes integer, _notes text, _origin_city_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  a record; r record;
  occ_s timestamptz; occ_e timestamptz; w record; pick record; n integer := 0; new_status public.assignment_status;
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = _id;
  IF a IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe.'; END IF;
  IF a.series_id IS NULL THEN RAISE EXCEPTION 'Este serviço não pertence a uma série.'; END IF;
  IF NOT (public.can_edit_activities() OR public.serves_administrator(a.administrator_id)) THEN
    RAISE EXCEPTION 'Não tem permissão para alterar este serviço';
  END IF;
  IF _scope NOT IN ('future', 'all') THEN RAISE EXCEPTION 'Âmbito inválido'; END IF;
  IF btrim(coalesce(_title, '')) = '' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _origin_city_id IS NULL THEN RAISE EXCEPTION 'Selecione a origem do serviço.'; END IF;
  IF _city_id IS NULL THEN RAISE EXCEPTION 'Selecione o destino do serviço.'; END IF;
  IF coalesce(_duration_minutes, 0) <= 0 THEN RAISE EXCEPTION 'Indique a duração do serviço'; END IF;

  UPDATE public.activity_series
     SET title = btrim(_title), type = coalesce(_type, type), city_id = _city_id, notes = nullif(_notes, '')
   WHERE id = a.series_id;

  FOR r IN
    SELECT * FROM public.activities
     WHERE series_id = a.series_id AND status <> 'cancelled'
       AND (_scope = 'all' OR start_datetime >= a.start_datetime)
     ORDER BY start_datetime
  LOOP
    occ_s := ((r.start_datetime AT TIME ZONE 'Europe/Lisbon')::date + _start_time) AT TIME ZONE 'Europe/Lisbon';
    occ_e := occ_s + make_interval(mins => _duration_minutes);

    SELECT * INTO w FROM public.occupation_window(_city_id, occ_s, occ_e);
    SELECT * INTO pick FROM public.pick_driver_by_priority(r.administrator_id, w.occ_start, w.occ_end, r.id, r.driver_id);

    IF pick.driver_id IS NULL THEN new_status := 'pending_manual';
    ELSIF pick.driver_id = r.driver_id THEN new_status := CASE WHEN r.assignment_status = 'pending_manual' THEN 'automatic' ELSE r.assignment_status END;
    ELSE new_status := 'automatic';
    END IF;

    PERFORM set_config('app.assistant_rpc', 'on', true);
    UPDATE public.activities SET
      title = btrim(_title), type = coalesce(_type, r.type), city_id = _city_id, origin_city_id = _origin_city_id,
      start_datetime = occ_s, end_datetime = occ_e,
      notes = nullif(_notes, ''), driver_id = pick.driver_id, assignment_status = new_status,
      assignment_attempts = pick.attempts,
      assigned_at = CASE WHEN pick.driver_id IS NULL THEN NULL WHEN pick.driver_id = r.driver_id THEN r.assigned_at ELSE now() END,
      driver_adjusted_start = CASE WHEN pick.driver_id = r.driver_id THEN r.driver_adjusted_start END,
      driver_adjusted_end = CASE WHEN pick.driver_id = r.driver_id THEN r.driver_adjusted_end END,
      adjustment_reason_id = CASE WHEN pick.driver_id = r.driver_id THEN r.adjustment_reason_id END,
      updated_by = auth.uid()
    WHERE id = r.id;
    PERFORM set_config('app.assistant_rpc', 'off', true);
    n := n + 1;
  END LOOP;

  PERFORM public.audit('service_series_updated', 'activity_series', a.series_id, NULL,
    jsonb_build_object('scope', _scope, 'occurrences', n));
  RETURN n;
END; $$;

CREATE OR REPLACE FUNCTION public.create_garage_event(_driver_id uuid, _title text, _city_id uuid, _start timestamptz, _end timestamptz, _notes text, _override boolean, _origin_city_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.can_edit_activities() THEN
    RAISE EXCEPTION 'Não tem permissão para criar eventos de garagem';
  END IF;
  IF _driver_id IS NULL THEN RAISE EXCEPTION 'Indique o motorista'; END IF;
  IF btrim(coalesce(_title, '')) = '' THEN RAISE EXCEPTION 'Indique o título do evento'; END IF;
  IF _origin_city_id IS NULL THEN RAISE EXCEPTION 'Selecione a origem do serviço.'; END IF;
  IF _city_id IS NULL THEN RAISE EXCEPTION 'Selecione o destino do serviço.'; END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'O fim tem de ser posterior ao início'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(_driver_id::text));

  INSERT INTO public.activities (title, type, event_kind, driver_id, city_id, origin_city_id, start_datetime, end_datetime,
                                 notes, status, assignment_status, assigned_at,
                                 override_conflict, created_by, updated_by)
  VALUES (btrim(_title), 'service', 'garage', _driver_id, _city_id, _origin_city_id, _start, _end,
          nullif(_notes, ''), 'confirmed', 'manual', now(),
          coalesce(_override, false), auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.create_driver_garage_event(_title text, _city_id uuid, _start timestamptz, _end timestamptz, _notes text, _origin_city_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_driver uuid; v_id uuid;
BEGIN
  v_driver := public.my_driver_id();
  IF v_driver IS NULL THEN RAISE EXCEPTION 'Apenas motoristas podem criar eventos na sua agenda'; END IF;
  IF NOT public.driver_can_create_events(v_driver) THEN RAISE EXCEPTION 'Não tem permissão para criar eventos.'; END IF;
  IF btrim(coalesce(_title, '')) = '' THEN RAISE EXCEPTION 'Indique o título do evento'; END IF;
  IF _origin_city_id IS NULL THEN RAISE EXCEPTION 'Selecione a origem do serviço.'; END IF;
  IF _city_id IS NULL THEN RAISE EXCEPTION 'Selecione o destino do serviço.'; END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'O fim tem de ser posterior ao início'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_driver::text));

  INSERT INTO public.activities (title, type, event_kind, driver_id, city_id, origin_city_id,
                                 start_datetime, end_datetime,
                                 notes, status, assignment_status, assigned_at,
                                 override_conflict, created_by, updated_by)
  VALUES (btrim(_title), 'service', 'garage', v_driver, _city_id, _origin_city_id,
          _start, _end, nullif(btrim(coalesce(_notes, '')), ''), 'confirmed',
          'manual', now(), false, auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.create_driver_service(_administrator_id uuid, _title text, _type activity_type, _start timestamptz, _end timestamptz, _notes text, _city_id uuid, _origin_city_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_driver uuid; v_id uuid;
BEGIN
  v_driver := public.my_driver_id();
  IF v_driver IS NULL THEN RAISE EXCEPTION 'Apenas motoristas podem criar eventos na sua agenda'; END IF;
  IF NOT public.driver_can_create_events(v_driver) THEN RAISE EXCEPTION 'Não tem permissão para criar serviços.'; END IF;
  IF _administrator_id IS NULL THEN RAISE EXCEPTION 'Indique o Administrador a que o serviço pertence'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.administrators WHERE id = _administrator_id AND active) THEN
    RAISE EXCEPTION 'Administrador inválido';
  END IF;
  IF btrim(coalesce(_title, '')) = '' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _origin_city_id IS NULL THEN RAISE EXCEPTION 'Selecione a origem do serviço.'; END IF;
  IF _city_id IS NULL THEN RAISE EXCEPTION 'Selecione o destino do serviço.'; END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'O fim tem de ser posterior ao início'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_driver::text));

  INSERT INTO public.activities (title, type, event_kind, driver_id, administrator_id, city_id, origin_city_id,
                                 start_datetime, end_datetime, notes, status,
                                 assignment_status, assigned_at, override_conflict,
                                 created_by, updated_by)
  VALUES (btrim(_title), coalesce(_type, 'other'), 'administration', v_driver, _administrator_id, _city_id, _origin_city_id,
          _start, _end, nullif(btrim(coalesce(_notes, '')), ''), 'confirmed',
          'manual', now(), false, auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;