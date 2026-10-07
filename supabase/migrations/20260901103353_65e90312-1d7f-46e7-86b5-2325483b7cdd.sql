-- 1. Conflict check: when a driver only adjusts their own occupation window,
--    do not block on their own time off / unavailability.
CREATE OR REPLACE FUNCTION public.check_activity_conflicts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conflict record;
  v_allowed boolean;
  v_msg text;
  eff_start timestamptz;
  eff_end timestamptz;
  adjust_only boolean := false;
BEGIN
  IF new.end_datetime <= new.start_datetime THEN
    RAISE EXCEPTION 'A hora de fim tem de ser posterior à de início';
  END IF;

  new.updated_by := auth.uid();
  IF tg_op = 'INSERT' THEN new.created_by := COALESCE(new.created_by, auth.uid()); END IF;

  IF new.status = 'cancelled' THEN RETURN new; END IF;

  IF tg_op = 'UPDATE' THEN
    adjust_only := (
      new.driver_id = old.driver_id
      AND new.start_datetime = old.start_datetime
      AND new.end_datetime = old.end_datetime
      AND new.city_id IS NOT DISTINCT FROM old.city_id
      AND new.status = old.status
      AND (new.driver_adjusted_start IS DISTINCT FROM old.driver_adjusted_start
           OR new.driver_adjusted_end IS DISTINCT FROM old.driver_adjusted_end)
    );
  END IF;

  eff_start := COALESCE(new.driver_adjusted_start, new.calculated_occupation_start, new.start_datetime);
  eff_end   := COALESCE(new.driver_adjusted_end, new.calculated_occupation_end, new.end_datetime);

  IF eff_end <= eff_start THEN
    RAISE EXCEPTION 'O fim da ocupação tem de ser posterior ao início';
  END IF;

  SELECT a.* INTO v_conflict FROM public.activities a
   WHERE a.driver_id = new.driver_id
     AND a.id <> new.id
     AND a.status <> 'cancelled'
     AND eff_start < a.effective_end
     AND eff_end > a.effective_start
   LIMIT 1;
  IF found THEN
    v_msg := 'CONFLITO: o motorista já tem "' || v_conflict.title || '" (ocupação ' ||
             to_char(v_conflict.effective_start, 'YYYY-MM-DD HH24:MI') || ' a ' ||
             to_char(v_conflict.effective_end, 'YYYY-MM-DD HH24:MI') || ')';
  END IF;

  IF NOT adjust_only THEN
    IF v_msg IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.time_off t
                  WHERE t.driver_id = new.driver_id AND t.status = 'approved'
                    AND eff_start::date <= t.end_date AND eff_end::date >= t.start_date) THEN
        v_msg := 'CONFLITO: o motorista tem ausência registada neste período';
      END IF;
    END IF;

    IF v_msg IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.unavailability u
                  WHERE u.driver_id = new.driver_id AND u.status = 'active'
                    AND eff_start < u.end_datetime AND eff_end > u.start_datetime) THEN
        v_msg := 'CONFLITO: o motorista está indisponível neste período';
      END IF;
    END IF;
  END IF;

  IF v_msg IS NOT NULL THEN
    v_allowed := new.override_conflict AND (
      public.is_manager() OR public.is_owner() OR
      (public.assistant_manages_driver(new.driver_id)
        AND (SELECT assistants_can_override_conflicts FROM public.app_settings LIMIT 1))
    );
    IF NOT v_allowed THEN
      RAISE EXCEPTION '%', v_msg;
    END IF;
    PERFORM public.audit('activity_conflict_overridden', 'activity', new.id, NULL,
      jsonb_build_object('reason', v_msg));
  END IF;

  RETURN new;
END; $function$;

-- 2. Trigger order: occupation must be recalculated before the conflict check.
DROP TRIGGER IF EXISTS t_activities_conflicts ON public.activities;
DROP TRIGGER IF EXISTS t_activities_occupation ON public.activities;
DROP TRIGGER IF EXISTS t_activities_driver_adjust ON public.activities;
DROP TRIGGER IF EXISTS t_activities_updated ON public.activities;

CREATE TRIGGER t_activities_a_occupation
  BEFORE INSERT OR UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.compute_activity_occupation();

CREATE TRIGGER t_activities_b_driver_adjust
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.activities_driver_adjust_guard();

CREATE TRIGGER t_activities_c_conflicts
  BEFORE INSERT OR UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.check_activity_conflicts();

CREATE TRIGGER t_activities_d_updated
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Delegations: fill in the originating assistant automatically so the
--    row satisfies the insert policy.
CREATE OR REPLACE FUNCTION public.delegations_before()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF new.end_datetime <= new.start_datetime THEN
    RAISE EXCEPTION 'O fim da delegação tem de ser posterior ao início';
  END IF;
  IF tg_op = 'INSERT' THEN
    new.created_by := COALESCE(new.created_by, auth.uid());
    new.original_assistant_id := COALESCE(new.original_assistant_id, public.my_assistant_id());
  END IF;
  RETURN new;
END; $function$;
