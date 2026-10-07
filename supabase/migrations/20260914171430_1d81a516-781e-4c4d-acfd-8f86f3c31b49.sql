CREATE OR REPLACE FUNCTION public.create_garage_event(
  _driver_id uuid,
  _title text,
  _city_id uuid,
  _start timestamptz,
  _end timestamptz,
  _notes text,
  _override boolean,
  _origin_city_id uuid,
  _round_trip boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
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

  INSERT INTO public.activities (
    title, type, event_kind, driver_id, city_id, origin_city_id, round_trip,
    start_datetime, end_datetime, notes, status, assignment_status, assigned_at,
    override_conflict, created_by, updated_by
  )
  VALUES (
    btrim(_title), 'service', 'garage', _driver_id, _city_id, _origin_city_id,
    coalesce(_round_trip, true), _start, _end, nullif(_notes, ''), 'confirmed',
    'manual', now(), coalesce(_override, false), auth.uid(), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_garage_event(uuid, text, uuid, timestamptz, timestamptz, text, boolean, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_garage_event(uuid, text, uuid, timestamptz, timestamptz, text, boolean, uuid, boolean) TO authenticated, service_role;