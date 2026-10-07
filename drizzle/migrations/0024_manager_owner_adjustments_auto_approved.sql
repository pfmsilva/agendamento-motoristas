CREATE OR REPLACE FUNCTION public.adjust_activity_occupation(_id uuid, _start timestamp with time zone, _end timestamp with time zone, _reason_id uuid, _scope text DEFAULT 'one'::text, _justification text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  a record; r record; n integer := 0;
  d_start interval; d_end interval; s timestamptz; e timestamptz;
  v_source text; v_now timestamptz := now(); v_uid uuid := auth.uid();
  v_requires_approval boolean := false; v_reason_label text; v_author text;
  v_final boolean := public.is_manager() OR public.is_owner();
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
    SELECT requires_approval, label INTO v_requires_approval, v_reason_label
      FROM public.travel_adjust_reasons WHERE id = _reason_id AND active;
    IF v_reason_label IS NULL THEN
      RAISE EXCEPTION 'Selecione o motivo do ajuste da deslocação.';
    END IF;
    IF v_requires_approval AND coalesce(btrim(_justification), '') = '' THEN
      RAISE EXCEPTION 'Indique a justificação do ajuste.';
    END IF;
  END IF;

  v_source := CASE WHEN public.can_manage_driver_schedule(a.driver_id) THEN 'gestor' ELSE 'motorista' END;

  PERFORM set_config('app.assistant_rpc', 'on', true);

  -- Motivo com aprovação: só Motorista/Assistente/Administrador ficam pendentes; Gestor e Proprietário aplicam logo.
  IF v_requires_approval AND _start IS NOT NULL AND NOT v_final THEN
    UPDATE public.activities
       SET adjustment_proposed_start = _start,
           adjustment_proposed_end = _end,
           adjustment_justification = btrim(_justification),
           adjustment_reason_id = _reason_id,
           adjustment_approval_status = 'pending',
           adjustment_requested_by = v_uid,
           adjustment_requested_at = v_now,
           adjustment_decided_by = NULL,
           adjustment_decided_at = NULL,
           updated_by = v_uid
     WHERE id = _id;

    SELECT name INTO v_author FROM public.profiles WHERE id = v_uid;
    FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role::text IN ('owner','manager') LOOP
      PERFORM public.notify(r.user_id, 'Ajuste de ocupação aguarda aprovação',
        coalesce(a.title, 'Serviço') || ' · ' ||
        to_char(_start AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') || ' – ' ||
        to_char(_end AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') ||
        ' · pedido por ' || coalesce(v_author, 'utilizador') ||
        E'\nJustificação: ' || btrim(_justification),
        'adjustment_approval', 'activity', _id);
    END LOOP;

    PERFORM public.audit('activity_adjustment_requested', 'activity', _id,
      jsonb_build_object('occupation_start', coalesce(a.driver_adjusted_start, a.calculated_occupation_start, a.start_datetime),
                         'occupation_end', coalesce(a.driver_adjusted_end, a.calculated_occupation_end, a.end_datetime)),
      jsonb_build_object('proposed_start', _start, 'proposed_end', _end,
                         'reason', v_reason_label, 'justification', btrim(_justification),
                         'requested_by', v_uid, 'requested_at', v_now));

    PERFORM set_config('app.assistant_rpc', 'off', true);
    RETURN 0;
  END IF;

  UPDATE public.activities
     SET driver_adjusted_start = _start,
         driver_adjusted_end = _end,
         adjustment_reason_id = CASE WHEN _start IS NULL AND _end IS NULL THEN NULL ELSE _reason_id END,
         adjustment_source = CASE WHEN _start IS NULL AND _end IS NULL THEN NULL ELSE v_source END,
         adjusted_by = CASE WHEN _start IS NULL AND _end IS NULL THEN NULL ELSE v_uid END,
         adjusted_at = CASE WHEN _start IS NULL AND _end IS NULL THEN NULL ELSE v_now END,
         adjustment_justification = CASE WHEN _start IS NULL THEN NULL ELSE nullif(btrim(coalesce(_justification, '')), '') END,
         adjustment_approval_status = NULL,
         adjustment_proposed_start = NULL,
         adjustment_proposed_end = NULL,
         adjustment_requested_by = NULL,
         adjustment_requested_at = NULL,
         adjustment_decided_by = NULL,
         adjustment_decided_at = NULL,
         updated_by = v_uid
   WHERE id = _id;
  n := 1;

  PERFORM public.audit('activity_occupation_adjusted', 'activity', _id,
    jsonb_build_object('driver_adjusted_start', a.driver_adjusted_start, 'driver_adjusted_end', a.driver_adjusted_end,
                       'occupation_start', coalesce(a.driver_adjusted_start, a.calculated_occupation_start, a.start_datetime),
                       'occupation_end', coalesce(a.driver_adjusted_end, a.calculated_occupation_end, a.end_datetime),
                       'adjustment_reason_id', a.adjustment_reason_id),
    jsonb_build_object('driver_adjusted_start', _start, 'driver_adjusted_end', _end,
                       'adjustment_reason_id', _reason_id, 'adjustment_reason', v_reason_label,
                       'justification', nullif(btrim(coalesce(_justification, '')), ''),
                       'adjusted_by', v_uid, 'auto_approved', v_final AND v_requires_approval));

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
END; $fn$;