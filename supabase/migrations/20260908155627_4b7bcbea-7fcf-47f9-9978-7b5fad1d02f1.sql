-- 1. Tipo de evento -------------------------------------------------------
CREATE TYPE public.event_kind AS ENUM ('administration', 'garage');

ALTER TABLE public.activities
  ADD COLUMN event_kind public.event_kind NOT NULL DEFAULT 'administration';

-- 2. Séries recorrentes ----------------------------------------------------
CREATE TYPE public.recurrence_freq AS ENUM ('weekly', 'monthly', 'yearly');

CREATE TABLE public.activity_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  administrator_id uuid NOT NULL REFERENCES public.administrators(id),
  assistant_id uuid REFERENCES public.assistants(id),
  title text NOT NULL,
  type public.activity_type NOT NULL DEFAULT 'trip',
  city_id uuid REFERENCES public.cities(id),
  notes text,
  first_start timestamptz NOT NULL,
  first_end timestamptz NOT NULL,
  frequency public.recurrence_freq NOT NULL,
  until_date date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.activity_series TO authenticated;
GRANT ALL ON public.activity_series TO service_role;
ALTER TABLE public.activity_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_series read" ON public.activity_series
  FOR SELECT TO authenticated
  USING (public.can_edit_activities()
         OR (assistant_id IS NOT NULL AND assistant_id = public.my_assistant_id())
         OR public.serves_administrator(administrator_id));

CREATE TRIGGER t_activity_series_updated BEFORE UPDATE ON public.activity_series
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.activities
  ADD COLUMN series_id uuid REFERENCES public.activity_series(id),
  ADD COLUMN series_index integer;

CREATE INDEX idx_activities_series ON public.activities (series_id, start_datetime);

-- 3. Ocupação: eventos de garagem não têm deslocação -----------------------
CREATE OR REPLACE FUNCTION public.compute_activity_occupation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE tm integer; base boolean;
BEGIN
  IF new.event_kind = 'garage' THEN
    new.travel_unknown := false;
    new.calculated_occupation_start := new.start_datetime;
    new.calculated_occupation_end := new.end_datetime;
    IF new.driver_adjusted_start IS NOT NULL AND new.driver_adjusted_end IS NOT NULL
       AND new.driver_adjusted_end <= new.driver_adjusted_start THEN
      RAISE EXCEPTION 'O fim do ajuste tem de ser posterior ao início';
    END IF;
    RETURN new;
  END IF;

  IF new.city_id IS NOT NULL THEN
    SELECT travel_minutes, is_base INTO tm, base
      FROM public.cities WHERE id = new.city_id AND active;
  END IF;

  IF new.city_id IS NULL OR tm IS NULL THEN
    new.travel_unknown := true;
    tm := 0;
  ELSE
    new.travel_unknown := false;
  END IF;

  new.calculated_occupation_start := new.start_datetime - make_interval(mins => COALESCE(tm, 0));
  new.calculated_occupation_end   := new.end_datetime   + make_interval(mins => COALESCE(tm, 0));

  IF new.driver_adjusted_start IS NOT NULL AND new.driver_adjusted_end IS NOT NULL
     AND new.driver_adjusted_end <= new.driver_adjusted_start THEN
    RAISE EXCEPTION 'O fim do ajuste tem de ser posterior ao início';
  END IF;
  RETURN new;
END; $function$;

-- 4. Coerência dos eventos de garagem --------------------------------------
CREATE OR REPLACE FUNCTION public.activities_kind_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF new.event_kind = 'garage' THEN
    IF new.driver_id IS NULL THEN
      RAISE EXCEPTION 'Um evento de garagem tem de ter motorista';
    END IF;
    new.administrator_id := NULL;
    new.assistant_id := NULL;
    new.city_id := NULL;
    new.series_id := NULL;
    new.series_index := NULL;
    new.assignment_status := 'manual';
  END IF;
  IF new.end_datetime <= new.start_datetime THEN
    RAISE EXCEPTION 'O fim tem de ser posterior ao início';
  END IF;
  RETURN new;
END; $function$;

CREATE TRIGGER t_activities_a0_kind BEFORE INSERT OR UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.activities_kind_guard();

-- 5. Criação de evento de garagem ------------------------------------------
CREATE OR REPLACE FUNCTION public.create_garage_event(
  _driver_id uuid, _title text, _start timestamptz, _end timestamptz,
  _notes text, _override boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.can_edit_activities() THEN
    RAISE EXCEPTION 'Não tem permissão para criar eventos de garagem';
  END IF;
  IF _driver_id IS NULL THEN RAISE EXCEPTION 'Indique o motorista'; END IF;
  IF btrim(coalesce(_title, '')) = '' THEN RAISE EXCEPTION 'Indique o título do evento'; END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'O fim tem de ser posterior ao início'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(_driver_id::text));

  INSERT INTO public.activities (title, type, event_kind, driver_id, start_datetime, end_datetime,
                                 notes, status, assignment_status, assigned_at,
                                 override_conflict, created_by, updated_by)
  VALUES (btrim(_title), 'service', 'garage', _driver_id, _start, _end,
          nullif(_notes, ''), 'confirmed', 'manual', now(),
          coalesce(_override, false), auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

-- 6. Datas das ocorrências --------------------------------------------------
CREATE OR REPLACE FUNCTION public.series_shift(_ts timestamptz, _freq public.recurrence_freq, _n integer)
 RETURNS timestamptz
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select ((_ts at time zone 'Europe/Lisbon')
          + case _freq
              when 'weekly' then make_interval(days => 7 * _n)
              when 'monthly' then make_interval(months => _n)
              else make_interval(years => _n)
            end) at time zone 'Europe/Lisbon'
$function$;

-- 7. Criação de série recorrente -------------------------------------------
CREATE OR REPLACE FUNCTION public.create_service_series(
  _administrator_id uuid, _title text, _type public.activity_type, _city_id uuid,
  _start timestamptz, _end timestamptz, _notes text,
  _freq public.recurrence_freq, _until date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s_id uuid; v_series uuid; base_name text; city_name text; city_base boolean;
  i integer := 0; occ_s timestamptz; occ_e timestamptz; w record; pick record;
  dur interval; made integer := 0;
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
    EXIT WHEN (occ_s AT TIME ZONE 'Europe/Lisbon')::date > _until OR made >= 200;
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

-- 8. Edição de série (esta / esta e seguintes / toda a série) ---------------
CREATE OR REPLACE FUNCTION public.update_service_series(
  _id uuid, _scope text, _title text, _type public.activity_type, _city_id uuid,
  _start_time time, _duration_minutes integer, _notes text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a record; base_name text; city_name text; city_base boolean; r record;
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
  IF coalesce(_duration_minutes, 0) <= 0 THEN RAISE EXCEPTION 'Indique a duração do serviço'; END IF;

  SELECT name INTO base_name FROM public.cities WHERE is_base LIMIT 1;
  IF _city_id IS NOT NULL THEN
    SELECT name, is_base INTO city_name, city_base FROM public.cities WHERE id = _city_id;
  END IF;

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
      title = btrim(_title), type = coalesce(_type, r.type), city_id = _city_id,
      start_datetime = occ_s, end_datetime = occ_e,
      origin = base_name,
      destination = CASE WHEN city_name IS NOT NULL AND NOT coalesce(city_base, false) THEN city_name END,
      notes = nullif(_notes, ''), driver_id = pick.driver_id, assignment_status = new_status,
      assignment_attempts = pick.attempts,
      assigned_at = CASE WHEN pick.driver_id IS NULL THEN NULL WHEN pick.driver_id = r.driver_id THEN r.assigned_at ELSE now() END,
      driver_adjusted_start = CASE WHEN pick.driver_id = r.driver_id THEN r.driver_adjusted_start END,
      driver_adjusted_end = CASE WHEN pick.driver_id = r.driver_id THEN r.driver_adjusted_end END,
      updated_by = auth.uid()
    WHERE id = r.id;
    PERFORM set_config('app.assistant_rpc', 'off', true);
    n := n + 1;
  END LOOP;

  PERFORM public.audit('service_series_updated', 'activity_series', a.series_id, NULL,
    jsonb_build_object('scope', _scope, 'occurrences', n));
  RETURN n;
END; $function$;

-- 9. Cancelamento de série --------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_service_series(_id uuid, _scope text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a record; r record; n integer := 0;
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = _id;
  IF a IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe.'; END IF;
  IF a.series_id IS NULL THEN RAISE EXCEPTION 'Este serviço não pertence a uma série.'; END IF;
  IF NOT (public.can_edit_activities() OR public.serves_administrator(a.administrator_id)) THEN
    RAISE EXCEPTION 'Não tem permissão para cancelar este serviço';
  END IF;
  IF _scope NOT IN ('future', 'all') THEN RAISE EXCEPTION 'Âmbito inválido'; END IF;

  PERFORM set_config('app.assistant_rpc', 'on', true);
  FOR r IN
    SELECT id FROM public.activities
     WHERE series_id = a.series_id AND status <> 'cancelled'
       AND (_scope = 'all' OR start_datetime >= a.start_datetime)
  LOOP
    UPDATE public.activities SET status = 'cancelled', updated_by = auth.uid() WHERE id = r.id;
    n := n + 1;
  END LOOP;
  PERFORM set_config('app.assistant_rpc', 'off', true);

  UPDATE public.activity_series SET active = false WHERE id = a.series_id AND _scope = 'all';
  PERFORM public.audit('service_series_cancelled', 'activity_series', a.series_id, NULL,
    jsonb_build_object('scope', _scope, 'occurrences', n));
  RETURN n;
END; $function$;

-- 10. Nomes para "Criado por" ----------------------------------------------
CREATE OR REPLACE FUNCTION public.display_names()
 RETURNS TABLE(id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.name from public.profiles p where auth.uid() is not null
$function$;

GRANT EXECUTE ON FUNCTION public.display_names() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_garage_event(uuid, text, timestamptz, timestamptz, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_service_series(uuid, text, public.activity_type, uuid, timestamptz, timestamptz, text, public.recurrence_freq, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_service_series(uuid, text, text, public.activity_type, uuid, time, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_service_series(uuid, text) TO authenticated;