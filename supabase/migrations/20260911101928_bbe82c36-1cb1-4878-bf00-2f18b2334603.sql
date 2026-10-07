CREATE OR REPLACE FUNCTION public.check_activity_conflicts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  eff_start timestamptz; eff_end timestamptz; v_msg text; v_allowed boolean;
BEGIN
  IF coalesce(current_setting('app.recalc_travel', true), '') = 'on'
     OR coalesce(current_setting('app.system_reassign', true), '') = 'on' THEN
    RETURN new;
  END IF;
  IF new.driver_id IS NULL OR new.status = 'cancelled' THEN
    RETURN new;
  END IF;
  eff_start := coalesce(new.driver_adjusted_start, new.calculated_occupation_start, new.start_datetime);
  eff_end := coalesce(new.driver_adjusted_end, new.calculated_occupation_end, new.end_datetime);
  v_msg := public.driver_is_available(new.driver_id, eff_start, eff_end, new.id);
  IF v_msg IS NOT NULL THEN
    v_msg := 'CONFLITO: o motorista ' || v_msg;
    v_allowed := new.override_conflict AND public.can_edit_activities();
    IF NOT v_allowed THEN
      RAISE EXCEPTION '%', v_msg;
    END IF;
    PERFORM public.audit('activity_conflict_overridden', 'activity', new.id, NULL, jsonb_build_object('reason', v_msg));
  END IF;
  RETURN new;
END; $function$;