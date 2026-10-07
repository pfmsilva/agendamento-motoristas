CREATE OR REPLACE FUNCTION public.released_minutes(_driver_id uuid, _start timestamptz, _end timestamptz)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  cursor_start timestamptz;
  cursor_end timestamptz;
  total_seconds numeric := 0;
BEGIN
  IF _driver_id IS NULL OR _start IS NULL OR _end IS NULL OR _end <= _start THEN
    RETURN 0;
  END IF;

  FOR rec IN
    SELECT greatest(r.start_datetime, _start) AS range_start,
           least(r.end_datetime, _end) AS range_end
      FROM public.schedule_releases r
     WHERE r.driver_id = _driver_id
       AND r.start_datetime < _end
       AND r.end_datetime > _start
     ORDER BY range_start, range_end
  LOOP
    IF rec.range_end <= rec.range_start THEN
      CONTINUE;
    END IF;
    IF cursor_start IS NULL THEN
      cursor_start := rec.range_start;
      cursor_end := rec.range_end;
    ELSIF rec.range_start <= cursor_end THEN
      cursor_end := greatest(cursor_end, rec.range_end);
    ELSE
      total_seconds := total_seconds + extract(epoch FROM (cursor_end - cursor_start));
      cursor_start := rec.range_start;
      cursor_end := rec.range_end;
    END IF;
  END LOOP;

  IF cursor_start IS NOT NULL THEN
    total_seconds := total_seconds + extract(epoch FROM (cursor_end - cursor_start));
  END IF;

  RETURN floor(total_seconds / 60)::bigint;
END;
$$;

GRANT EXECUTE ON FUNCTION public.released_minutes(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.released_minutes(uuid, timestamptz, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.is_released(_driver_id uuid, _start timestamptz, _end timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _end > _start
     AND public.released_minutes(_driver_id, _start, _end)
         >= floor(extract(epoch FROM (_end - _start)) / 60)::bigint
$$;

CREATE OR REPLACE FUNCTION public.driver_monthly_worked_minutes(_month date)
RETURNS TABLE(driver_id uuid, worked_minutes bigint)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _month_start timestamptz;
  _month_end timestamptz;
BEGIN
  IF NOT (public.is_owner() OR public.is_manager()) THEN
    RAISE EXCEPTION 'Não tem permissão para consultar a carga mensal.';
  END IF;
  IF _month IS NULL THEN
    RAISE EXCEPTION 'O mês é obrigatório.';
  END IF;

  _month_start := (date_trunc('month', _month::timestamp) AT TIME ZONE 'Europe/Lisbon');
  _month_end := ((date_trunc('month', _month::timestamp) + interval '1 month') AT TIME ZONE 'Europe/Lisbon');

  RETURN QUERY
  SELECT d.id,
         COALESCE(SUM(GREATEST(
           0,
           FLOOR(EXTRACT(EPOCH FROM (
             LEAST(COALESCE(a.effective_end, a.driver_adjusted_end, a.calculated_occupation_end, a.end_datetime), _month_end)
             - GREATEST(COALESCE(a.effective_start, a.driver_adjusted_start, a.calculated_occupation_start, a.start_datetime), _month_start)
           )) / 60)::bigint
           - public.released_minutes(
               d.id,
               GREATEST(COALESCE(a.effective_start, a.driver_adjusted_start, a.calculated_occupation_start, a.start_datetime), _month_start),
               LEAST(COALESCE(a.effective_end, a.driver_adjusted_end, a.calculated_occupation_end, a.end_datetime), _month_end)
             )
         )), 0)::bigint AS worked_minutes
  FROM public.drivers d
  LEFT JOIN public.activities a
    ON a.driver_id = d.id
   AND a.status <> 'cancelled'
   AND COALESCE(a.effective_end, a.driver_adjusted_end, a.calculated_occupation_end, a.end_datetime) > _month_start
   AND COALESCE(a.effective_start, a.driver_adjusted_start, a.calculated_occupation_start, a.start_datetime) < _month_end
  WHERE d.active
  GROUP BY d.id;
END;
$$;