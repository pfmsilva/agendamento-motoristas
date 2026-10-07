CREATE OR REPLACE FUNCTION public.activities_driver_adjust_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Reatribuição automática por ausência: alteração do sistema, já validada a montante.
  IF coalesce(current_setting('app.system_reassign', true), '') = 'on' THEN
    RETURN new;
  END IF;

  IF new.driver_adjusted_start IS DISTINCT FROM old.driver_adjusted_start
     OR new.driver_adjusted_end IS DISTINCT FROM old.driver_adjusted_end THEN
    IF new.driver_adjusted_start IS NULL AND new.driver_adjusted_end IS NULL THEN
      new.adjustment_source := NULL;
    ELSIF public.can_manage_driver_schedule(new.driver_id) THEN
      new.adjustment_source := 'gestor';
    ELSE
      new.adjustment_source := 'motorista';
    END IF;

    PERFORM public.audit('activity_occupation_adjusted', 'activity', new.id,
      jsonb_build_object('driver_adjusted_start', old.driver_adjusted_start, 'driver_adjusted_end', old.driver_adjusted_end, 'adjustment_source', old.adjustment_source),
      jsonb_build_object('driver_adjusted_start', new.driver_adjusted_start, 'driver_adjusted_end', new.driver_adjusted_end, 'adjustment_source', new.adjustment_source));
  END IF;

  IF public.can_manage_driver_schedule(new.driver_id) THEN
    RETURN new;
  END IF;

  IF new.driver_id <> old.driver_id OR new.driver_id IS DISTINCT FROM public.my_driver_id() THEN
    RAISE EXCEPTION 'Não tem permissão para alterar esta atividade';
  END IF;

  IF new.title IS DISTINCT FROM old.title
     OR new.type IS DISTINCT FROM old.type
     OR new.start_datetime IS DISTINCT FROM old.start_datetime
     OR new.end_datetime IS DISTINCT FROM old.end_datetime
     OR new.city_id IS DISTINCT FROM old.city_id
     OR new.origin IS DISTINCT FROM old.origin
     OR new.destination IS DISTINCT FROM old.destination
     OR new.passenger IS DISTINCT FROM old.passenger
     OR new.status IS DISTINCT FROM old.status
     OR new.notes IS DISTINCT FROM old.notes THEN
    RAISE EXCEPTION 'O motorista só pode ajustar o seu período de ocupação';
  END IF;

  RETURN new;
END; $function$;

CREATE OR REPLACE FUNCTION public.timeoff_apply_reassignment(_timeoff_id uuid, _driver_id uuid, _start date, _end date, _active boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  a record; pick record; occ_s timestamptz; occ_e timestamptz; msg text;
  reassigned int := 0; pending int := 0; restored int := 0; kept int := 0; review int := 0;
  new_drivers uuid[] := '{}'; r record; d_name text; summary jsonb; body text;
BEGIN
  SELECT name INTO d_name FROM public.drivers WHERE id = _driver_id;
  PERFORM set_config('app.system_reassign', 'on', true);

  IF _active THEN
    FOR a IN
      SELECT * FROM public.activities
       WHERE driver_id = _driver_id AND status <> 'cancelled'
         AND (start_datetime AT TIME ZONE 'Europe/Lisbon')::date <= _end
         AND (end_datetime AT TIME ZONE 'Europe/Lisbon')::date >= _start
       ORDER BY start_datetime
    LOOP
      occ_s := coalesce(a.calculated_occupation_start, a.start_datetime);
      occ_e := coalesce(a.calculated_occupation_end, a.end_datetime);
      IF a.event_kind = 'administration' AND a.administrator_id IS NOT NULL THEN
        SELECT * INTO pick FROM public.pick_driver_by_priority(a.administrator_id, occ_s, occ_e, a.id, NULL);
        UPDATE public.activities SET
          driver_id = pick.driver_id,
          assignment_status = CASE WHEN pick.driver_id IS NULL THEN 'pending_manual'::public.assignment_status ELSE 'automatic'::public.assignment_status END,
          assignment_attempts = pick.attempts,
          assigned_at = CASE WHEN pick.driver_id IS NULL THEN NULL ELSE now() END,
          driver_adjusted_start = NULL, driver_adjusted_end = NULL,
          original_driver_id = coalesce(a.original_driver_id, _driver_id),
          reassign_reason = 'timeoff',
          reassign_timeoff_id = _timeoff_id,
          reassigned_at = now(),
          reassign_overridden = false
        WHERE id = a.id;
        PERFORM public.audit('activity_timeoff_reassigned', 'activity', a.id,
          jsonb_build_object('driver_id', _driver_id),
          jsonb_build_object('driver_id', pick.driver_id, 'reason', 'timeoff', 'timeoff_id', _timeoff_id,
                             'automatic', true, 'series_id', a.series_id, 'series_index', a.series_index));
        IF pick.driver_id IS NULL THEN
          pending := pending + 1;
          PERFORM public.notify_pending_assignment(a.id);
        ELSE
          reassigned := reassigned + 1;
          new_drivers := new_drivers || pick.driver_id;
        END IF;
      ELSE
        review := review + 1;
        PERFORM public.audit('activity_timeoff_manual_review', 'activity', a.id, NULL,
          jsonb_build_object('driver_id', _driver_id, 'timeoff_id', _timeoff_id, 'event_kind', a.event_kind, 'reason', 'timeoff'));
      END IF;
    END LOOP;
  END IF;

  FOR a IN
    SELECT * FROM public.activities
     WHERE reassign_timeoff_id = _timeoff_id
       AND original_driver_id = _driver_id
       AND coalesce(reassign_overridden, false) = false
       AND status <> 'cancelled'
       AND NOT (
         _active
         AND (start_datetime AT TIME ZONE 'Europe/Lisbon')::date <= _end
         AND (end_datetime AT TIME ZONE 'Europe/Lisbon')::date >= _start
       )
     ORDER BY start_datetime
  LOOP
    occ_s := coalesce(a.calculated_occupation_start, a.start_datetime);
    occ_e := coalesce(a.calculated_occupation_end, a.end_datetime);
    PERFORM pg_advisory_xact_lock(hashtext(_driver_id::text));
    msg := public.driver_is_available(_driver_id, occ_s, occ_e, a.id);
    IF msg IS NULL AND public.driver_is_conditional(_driver_id, occ_s, occ_e, a.id) THEN
      msg := 'requer confirmação (compromisso próximo)';
    END IF;
    IF msg IS NULL THEN
      UPDATE public.activities SET
        driver_id = _driver_id,
        assignment_status = 'automatic'::public.assignment_status,
        assigned_at = now(),
        driver_adjusted_start = NULL, driver_adjusted_end = NULL,
        original_driver_id = NULL, reassign_reason = NULL,
        reassign_timeoff_id = NULL, reassigned_at = NULL, reassign_overridden = false
      WHERE id = a.id;
      restored := restored + 1;
      PERFORM public.audit('activity_timeoff_restored', 'activity', a.id,
        jsonb_build_object('driver_id', a.driver_id),
        jsonb_build_object('driver_id', _driver_id, 'reason', 'timeoff_cancelled', 'timeoff_id', _timeoff_id,
                           'automatic', true, 'series_id', a.series_id, 'series_index', a.series_index));
    ELSE
      UPDATE public.activities SET
        reassign_reason = 'timeoff_nao_restaurado', reassign_timeoff_id = NULL
      WHERE id = a.id;
      kept := kept + 1;
      PERFORM public.audit('activity_timeoff_restore_failed', 'activity', a.id, NULL,
        jsonb_build_object('original_driver_id', _driver_id, 'timeoff_id', _timeoff_id, 'reason', msg));
    END IF;
  END LOOP;

  PERFORM set_config('app.system_reassign', 'off', true);

  summary := jsonb_build_object('timeoff_id', _timeoff_id, 'driver_id', _driver_id, 'driver_name', d_name,
    'reassigned', reassigned, 'pending_manual', pending, 'restored', restored, 'kept', kept, 'manual_review', review);

  IF reassigned + pending + restored + kept + review > 0 THEN
    PERFORM public.audit('timeoff_reassignment', 'time_off', _timeoff_id, NULL, summary);

    body := 'Motorista: ' || coalesce(d_name, '-') || E'\n' ||
      'Reatribuídos automaticamente: ' || reassigned || E'\n' ||
      'A aguardar atribuição manual: ' || pending || E'\n' ||
      'Devolvidos ao motorista original: ' || restored || E'\n' ||
      'Mantidos por indisponibilidade: ' || kept || E'\n' ||
      'A rever manualmente: ' || review;
    FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role::text IN ('owner', 'manager') LOOP
      PERFORM public.notify(r.user_id, 'Ausência: serviços afetados', body, 'timeoff_reassignment', 'time_off', _timeoff_id);
    END LOOP;

    FOR r IN
      SELECT d.user_id, count(*) AS n
        FROM unnest(new_drivers) x(id)
        JOIN public.drivers d ON d.id = x.id
       WHERE d.user_id IS NOT NULL
       GROUP BY d.user_id
    LOOP
      PERFORM public.notify(r.user_id, 'Novos serviços atribuídos',
        r.n || ' serviço(s) foram atribuídos a si devido a uma ausência de outro motorista.',
        'assignment', 'time_off', _timeoff_id);
    END LOOP;
  END IF;

  RETURN summary;
END; $$;

REVOKE ALL ON FUNCTION public.timeoff_apply_reassignment(uuid, uuid, date, date, boolean) FROM public, anon, authenticated;