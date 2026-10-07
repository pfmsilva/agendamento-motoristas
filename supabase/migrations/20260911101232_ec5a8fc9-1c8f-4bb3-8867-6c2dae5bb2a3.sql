ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS original_driver_id uuid REFERENCES public.drivers(id),
  ADD COLUMN IF NOT EXISTS reassign_reason text,
  ADD COLUMN IF NOT EXISTS reassign_timeoff_id uuid REFERENCES public.time_off(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reassigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS reassign_overridden boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS activities_reassign_timeoff_idx ON public.activities (reassign_timeoff_id) WHERE reassign_timeoff_id IS NOT NULL;

-- Disponibilidade "A confirmar": compromisso adjacente dentro da margem configurada.
CREATE OR REPLACE FUNCTION public.driver_is_conditional(_driver_id uuid, _start timestamptz, _end timestamptz, _ignore_activity uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.activities a, public.app_settings s
     WHERE s.id AND a.driver_id = _driver_id
       AND (_ignore_activity IS NULL OR a.id <> _ignore_activity)
       AND a.status <> 'cancelled'
       AND (
         coalesce(a.driver_adjusted_end, a.calculated_occupation_end, a.end_datetime)
           BETWEEN _start - make_interval(mins => s.conditional_margin_minutes) AND _start
         OR coalesce(a.driver_adjusted_start, a.calculated_occupation_start, a.start_datetime)
           BETWEEN _end AND _end + make_interval(mins => s.conditional_margin_minutes)
       )
  )
$$;

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

  -- Restauro: ocorrências movidas por esta ausência que já não estão cobertas por ela.
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

CREATE OR REPLACE FUNCTION public.timeoff_reassign_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF tg_op = 'DELETE' THEN
    PERFORM public.timeoff_apply_reassignment(old.id, old.driver_id, old.start_date, old.end_date, false);
    RETURN old;
  END IF;
  PERFORM public.timeoff_apply_reassignment(new.id, new.driver_id, new.start_date, new.end_date, new.status = 'approved');
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS timeoff_reassign ON public.time_off;
CREATE TRIGGER timeoff_reassign
AFTER INSERT OR UPDATE OF start_date, end_date, status, driver_id OR DELETE ON public.time_off
FOR EACH ROW EXECUTE FUNCTION public.timeoff_reassign_trigger();

-- Atribuição manual passa a ter precedência sobre o restauro automático.
CREATE OR REPLACE FUNCTION public.assign_service_driver(_id uuid, _driver_id uuid, _override boolean, _expected_updated_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a record;
BEGIN
  IF NOT public.can_edit_activities() THEN RAISE EXCEPTION 'Não tem permissão para atribuir motoristas'; END IF;
  IF _driver_id IS NULL THEN RAISE EXCEPTION 'Indique o motorista'; END IF;
  SELECT * INTO a FROM public.activities WHERE id = _id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe - foi eliminado por outro utilizador.'; END IF;
  IF _expected_updated_at IS NOT NULL AND a.updated_at <> _expected_updated_at THEN
    RAISE EXCEPTION 'Este registo foi alterado por outro utilizador entretanto. Atualize a página para ver a versão mais recente e repita a alteração.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(_driver_id::text));
  UPDATE public.activities SET driver_id = _driver_id, assignment_status = 'manual', assigned_at = now(),
    override_conflict = coalesce(_override, false),
    driver_adjusted_start = CASE WHEN _driver_id = a.driver_id THEN a.driver_adjusted_start END,
    driver_adjusted_end = CASE WHEN _driver_id = a.driver_id THEN a.driver_adjusted_end END,
    reassign_overridden = CASE WHEN a.reassign_timeoff_id IS NOT NULL OR a.original_driver_id IS NOT NULL THEN true ELSE a.reassign_overridden END,
    updated_by = auth.uid()
  WHERE id = _id;
END; $function$;

-- Resumo da última reatribuição, para feedback na interface.
CREATE OR REPLACE FUNCTION public.timeoff_last_summary(_timeoff_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT l.new_value FROM public.audit_log l
   WHERE l.entity_type = 'time_off' AND l.entity_id = _timeoff_id AND l.action = 'timeoff_reassignment'
   ORDER BY l.created_at DESC LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.timeoff_apply_reassignment(uuid, uuid, date, date, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.driver_is_conditional(uuid, timestamptz, timestamptz, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.timeoff_last_summary(uuid) TO authenticated;