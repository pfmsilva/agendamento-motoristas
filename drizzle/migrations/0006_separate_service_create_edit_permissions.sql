CREATE OR REPLACE FUNCTION public.create_service_auto(
  _administrator_id uuid, _title text, _type activity_type, _city_id uuid,
  _start timestamptz, _end timestamptz, _notes text, _origin_city_id uuid,
  _tag_id uuid, _round_trip boolean, _event_kind_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := public.create_service_auto(_administrator_id, _title, _type, _city_id, _start, _end,
                                     _notes, _origin_city_id, _tag_id, _round_trip);
  IF _event_kind_key IS NOT NULL THEN
    PERFORM set_config('app.assistant_rpc', 'on', true);
    UPDATE public.activities SET event_kind_key = _event_kind_key WHERE id = v_id;
    PERFORM set_config('app.assistant_rpc', 'off', true);
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_service_auto(
  _id uuid, _title text, _type activity_type, _city_id uuid, _start timestamptz, _end timestamptz,
  _notes text, _expected_updated_at timestamptz, _origin_city_id uuid, _tag_id uuid,
  _round_trip boolean, _event_kind_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.update_service_auto(_id, _title, _type, _city_id, _start, _end, _notes,
                                     _expected_updated_at, _origin_city_id, _tag_id, _round_trip);
  IF _event_kind_key IS NOT NULL THEN
    PERFORM set_config('app.assistant_rpc', 'on', true);
    UPDATE public.activities SET event_kind_key = _event_kind_key WHERE id = _id;
    PERFORM set_config('app.assistant_rpc', 'off', true);
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.create_service_series(
  _administrator_id uuid, _title text, _type activity_type, _city_id uuid,
  _start timestamptz, _end timestamptz, _notes text, _freq recurrence_freq, _until date,
  _origin_city_id uuid, _tag_id uuid, _round_trip boolean, _event_kind_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := public.create_service_series(_administrator_id, _title, _type, _city_id, _start, _end,
                                       _notes, _freq, _until, _origin_city_id, _tag_id, _round_trip);
  IF _event_kind_key IS NOT NULL THEN
    PERFORM set_config('app.assistant_rpc', 'on', true);
    UPDATE public.activity_series SET event_kind_key = _event_kind_key WHERE id = v_id;
    UPDATE public.activities SET event_kind_key = _event_kind_key WHERE series_id = v_id;
    PERFORM set_config('app.assistant_rpc', 'off', true);
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_service_series(
  _id uuid, _scope text, _title text, _type activity_type, _city_id uuid,
  _start_time time, _duration_minutes integer, _notes text, _origin_city_id uuid,
  _tag_id uuid, _round_trip boolean, _event_kind_key text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  v_count := public.update_service_series(_id, _scope, _title, _type, _city_id, _start_time,
                                          _duration_minutes, _notes, _origin_city_id, _tag_id, _round_trip);
  IF _event_kind_key IS NOT NULL THEN
    PERFORM set_config('app.assistant_rpc', 'on', true);
    UPDATE public.activity_series SET event_kind_key = _event_kind_key WHERE id = _id;
    PERFORM set_config('app.assistant_rpc', 'off', true);
  END IF;
  RETURN v_count;
END; $$;