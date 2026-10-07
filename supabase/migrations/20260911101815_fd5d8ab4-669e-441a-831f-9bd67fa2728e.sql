CREATE OR REPLACE FUNCTION public.driver_is_available(_driver_id uuid, _start timestamptz, _end timestamptz, _ignore_activity uuid, _ignore_timeoff uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE msg text;
BEGIN
  msg := public.driver_is_available(_driver_id, _start, _end, _ignore_activity);
  IF msg IS NULL OR _ignore_timeoff IS NULL THEN
    RETURN msg;
  END IF;
  -- Reavalia ignorando o registo de ausência indicado.
  IF EXISTS (
    SELECT 1 FROM public.drivers WHERE id = _driver_id AND NOT active
  ) THEN RETURN 'motorista inativo'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.activities a
     WHERE a.driver_id = _driver_id AND a.status <> 'cancelled'
       AND (_ignore_activity IS NULL OR a.id <> _ignore_activity)
       AND coalesce(a.calculated_occupation_start, a.start_datetime) < _end
       AND coalesce(a.calculated_occupation_end, a.end_datetime) > _start
  ) THEN RETURN 'serviço sobreposto'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.time_off t
     WHERE t.driver_id = _driver_id AND t.status = 'approved'
       AND t.id <> _ignore_timeoff
       AND t.start_date <= (_end AT TIME ZONE 'Europe/Lisbon')::date
       AND t.end_date >= (_start AT TIME ZONE 'Europe/Lisbon')::date
  ) THEN RETURN 'ausência aprovada'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.unavailability u
     WHERE u.driver_id = _driver_id AND u.status = 'active'
       AND u.start_datetime < _end AND u.end_datetime > _start
  ) THEN RETURN 'indisponibilidade registada'; END IF;

  RETURN NULL;
END; $$;

REVOKE ALL ON FUNCTION public.driver_is_available(uuid, timestamptz, timestamptz, uuid, uuid) FROM public, anon;