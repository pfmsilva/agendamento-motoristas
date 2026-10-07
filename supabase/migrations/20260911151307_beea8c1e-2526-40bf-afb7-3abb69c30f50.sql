CREATE OR REPLACE FUNCTION public.driver_monthly_worked_minutes(_month date)
RETURNS TABLE(driver_id uuid, worked_minutes bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
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
           )) / 60)
         ))::bigint, 0::bigint) AS worked_minutes
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
REVOKE ALL ON FUNCTION public.driver_monthly_worked_minutes(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_monthly_worked_minutes(date) TO authenticated;
NOTIFY pgrst, 'reload schema';