CREATE OR REPLACE FUNCTION public.driver_monthly_worked_minutes(_month date)
RETURNS TABLE(driver_id uuid, worked_minutes bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_month_start timestamptz;
  v_month_end timestamptz;
BEGIN
  IF NOT (public.is_owner(auth.uid()) OR public.is_manager(auth.uid())) THEN
    RAISE EXCEPTION 'Não tem permissão para consultar as horas mensais dos motoristas.';
  END IF;
  IF _month IS NULL THEN
    RAISE EXCEPTION 'Indique o mês a consultar.';
  END IF;

  v_month_start := date_trunc('month', _month::timestamp) AT TIME ZONE 'Europe/Lisbon';
  v_month_end := (date_trunc('month', _month::timestamp) + interval '1 month') AT TIME ZONE 'Europe/Lisbon';

  RETURN QUERY
  SELECT
    d.id,
    COALESCE(
      SUM(
        GREATEST(
          0,
          FLOOR(
            EXTRACT(
              epoch FROM (
                LEAST(COALESCE(a.effective_end, a.driver_adjusted_end, a.calculated_occupation_end, a.end_datetime), v_month_end)
                - GREATEST(COALESCE(a.effective_start, a.driver_adjusted_start, a.calculated_occupation_start, a.start_datetime), v_month_start)
              )
            ) / 60
          )
        )
      ) FILTER (
        WHERE a.id IS NOT NULL
          AND COALESCE(a.effective_start, a.driver_adjusted_start, a.calculated_occupation_start, a.start_datetime) < v_month_end
          AND COALESCE(a.effective_end, a.driver_adjusted_end, a.calculated_occupation_end, a.end_datetime) > v_month_start
      ),
      0
    )::bigint AS worked_minutes
  FROM public.drivers d
  LEFT JOIN public.activities a
    ON a.driver_id = d.id
   AND a.status <> 'cancelled'
  WHERE d.active
  GROUP BY d.id;
END;
$$;

REVOKE ALL ON FUNCTION public.driver_monthly_worked_minutes(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_monthly_worked_minutes(date) TO authenticated;