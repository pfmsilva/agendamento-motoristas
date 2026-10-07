CREATE OR REPLACE FUNCTION public.create_driver_garage_event(
  _title text,
  _city_id uuid,
  _start timestamptz,
  _end timestamptz,
  _notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_driver uuid;
  v_id uuid;
  city_name text;
  city_base boolean;
  base_name text;
BEGIN
  v_driver := public.my_driver_id();
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Apenas motoristas podem criar eventos na sua agenda';
  END IF;
  IF btrim(coalesce(_title, '')) = '' THEN
    RAISE EXCEPTION 'Indique o título do evento';
  END IF;
  IF _city_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o local do serviço.';
  END IF;
  IF _end <= _start THEN
    RAISE EXCEPTION 'O fim tem de ser posterior ao início';
  END IF;

  SELECT name, is_base INTO city_name, city_base
    FROM public.cities
   WHERE id = _city_id AND active;
  IF city_name IS NULL THEN
    RAISE EXCEPTION 'Selecione um local válido para o serviço.';
  END IF;
  SELECT name INTO base_name FROM public.cities WHERE is_base AND active LIMIT 1;

  PERFORM pg_advisory_xact_lock(hashtext(v_driver::text));

  INSERT INTO public.activities (title, type, event_kind, driver_id, city_id,
                                 start_datetime, end_datetime, origin, destination,
                                 notes, status, assignment_status, assigned_at,
                                 override_conflict, created_by, updated_by)
  VALUES (btrim(_title), 'service', 'garage', v_driver, _city_id,
          _start, _end, base_name,
          CASE WHEN NOT coalesce(city_base, false) THEN city_name END,
          nullif(btrim(coalesce(_notes, '')), ''), 'confirmed',
          'manual', now(), false, auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_driver_garage_event(text, uuid, timestamptz, timestamptz, text) TO authenticated;