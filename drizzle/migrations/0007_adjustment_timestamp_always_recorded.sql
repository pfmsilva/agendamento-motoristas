CREATE OR REPLACE FUNCTION public.adjust_activity_occupation(
  _id uuid,
  _start timestamptz,
  _end timestamptz,
  _reason_id uuid,
  _scope text DEFAULT 'one'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a record; r record; n integer := 0;
  d_start interval; d_end interval; s timestamptz; e timestamptz;
  v_source text; v_now timestamptz := now(); v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = _id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe.'; END IF;

  IF NOT (public.can_edit_activities()
          OR public.serves_administrator(a.administrator_id)
          OR (a.driver_id IS NOT NULL AND a.driver_id = public.my_driver_id())) THEN
    RAISE EXCEPTION 'Não tem permissão para alterar eventos.';
  END IF;

  IF _scope NOT IN ('one', 'future') THEN RAISE EXCEPTION 'Âmbito inválido'; END IF;

  IF _start IS NOT NULL OR _end IS NOT NULL THEN
    IF _start IS NULL OR _end IS NULL THEN
      RAISE EXCEPTION 'Indique o início e o fim da ocupação.';
    END IF;
    IF _end <= _start THEN RAISE EXCEPTION 'O fim da ocupação tem de ser posterior ao início.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.travel_adjust_reasons WHERE id = _reason_id AND active) THEN
      RAISE EXCEPTION 'Selecione o motivo do ajuste da deslocação.';
    END IF;
  END IF;

  v_source := CASE WHEN public.can_manage_driver_schedule(a.driver_id) THEN 'gestor' ELSE 'motorista' END;

  PERFORM set_config('app.assistant_rpc', 'on', true);

  UPDATE public.activities
     SET driver_adjusted_start = _start,
         driver_adjusted_end = _end,
         adjustment_reason_id = CASE WHEN _start IS NULL AND _end IS NULL THEN NULL ELSE _reason_id END,
         adjustment_source = CASE WHEN _start IS NULL AND _end IS NULL THEN NULL ELSE v_source END,
         adjusted_by = CASE WHEN _start IS NULL AND _end IS NULL THEN NULL ELSE v_uid END,
         adjusted_at = CASE WHEN _start IS NULL AND _end IS NULL THEN NULL ELSE v_now END,
         updated_by = v_uid
   WHERE id = _id;
  n := 1;

  IF _scope = 'future' AND a.series_id IS NOT NULL AND _start IS NOT NULL THEN
    d_start := _start - coalesce(a.calculated_occupation_start, a.start_datetime);
    d_end := _end - coalesce(a.calculated_occupation_end, a.end_datetime);
    FOR r IN
      SELECT * FROM public.activities
       WHERE series_id = a.series_id AND id <> a.id
         AND status <> 'cancelled'
         AND start_datetime > a.start_datetime
    LOOP
      s := coalesce(r.calculated_occupation_start, r.start_datetime) + d_start;
      e := coalesce(r.calculated_occupation_end, r.end_datetime) + d_end;
      IF e > s THEN
        UPDATE public.activities
           SET driver_adjusted_start = s,
               driver_adjusted_end = e,
               adjustment_reason_id = _reason_id,
               adjustment_source = v_source,
               adjusted_by = v_uid,
               adjusted_at = v_now,
               updated_by = v_uid
         WHERE id = r.id;
        n := n + 1;
      END IF;
    END LOOP;
  ELSIF _scope = 'future' AND a.series_id IS NOT NULL AND _start IS NULL THEN
    FOR r IN
      SELECT * FROM public.activities
       WHERE series_id = a.series_id AND id <> a.id
         AND status <> 'cancelled'
         AND start_datetime > a.start_datetime
    LOOP
      UPDATE public.activities
         SET driver_adjusted_start = NULL,
             driver_adjusted_end = NULL,
             adjustment_reason_id = NULL,
             adjustment_source = NULL,
             adjusted_by = NULL,
             adjusted_at = NULL,
             updated_by = v_uid
       WHERE id = r.id;
      n := n + 1;
    END LOOP;
  END IF;

  PERFORM set_config('app.assistant_rpc', 'off', true);
  RETURN n;
END; $$;

REVOKE ALL ON FUNCTION public.adjust_activity_occupation(uuid, timestamptz, timestamptz, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.adjust_activity_occupation(uuid, timestamptz, timestamptz, uuid, text) TO authenticated;