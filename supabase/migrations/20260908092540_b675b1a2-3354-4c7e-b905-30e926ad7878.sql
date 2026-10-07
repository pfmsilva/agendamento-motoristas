ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS travel_configured boolean NOT NULL DEFAULT true;

UPDATE public.cities SET travel_configured = (travel_minutes > 0 OR is_base);

ALTER TABLE public.cities ALTER COLUMN travel_configured SET DEFAULT false;

-- Allow bulk recalculation to bypass the conflict guard (occupation windows may
-- legitimately overlap once travel time is added to already-saved services).
CREATE OR REPLACE FUNCTION public.check_activity_conflicts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  eff_start timestamptz;
  eff_end timestamptz;
  v_msg text;
  v_allowed boolean;
BEGIN
  IF coalesce(current_setting('app.recalc_travel', true), '') = 'on' THEN
    RETURN new;
  END IF;

  eff_start := coalesce(new.driver_adjusted_start, new.calculated_occupation_start, new.start_datetime);
  eff_end := coalesce(new.driver_adjusted_end, new.calculated_occupation_end, new.end_datetime);

  IF new.status <> 'cancelled' THEN
    IF EXISTS (
      SELECT 1 FROM public.activities a
       WHERE a.driver_id = new.driver_id
         AND a.id <> new.id
         AND a.status <> 'cancelled'
         AND coalesce(a.driver_adjusted_start, a.calculated_occupation_start, a.start_datetime) < eff_end
         AND coalesce(a.driver_adjusted_end, a.calculated_occupation_end, a.end_datetime) > eff_start
    ) THEN
      v_msg := 'CONFLITO: o motorista já tem uma atividade neste período';
    END IF;

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

REVOKE ALL ON FUNCTION public.check_activity_conflicts() FROM PUBLIC, anon, authenticated;

-- Create (or reuse) a destination from the service form, without travel time.
CREATE OR REPLACE FUNCTION public.create_city_pending(_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text := btrim(_name);
  v_id uuid;
  r record;
BEGIN
  IF v_name = '' OR v_name IS NULL THEN
    RAISE EXCEPTION 'Indique o nome da cidade';
  END IF;

  IF NOT (public.is_owner() OR public.is_manager() OR public.my_assistant_id() IS NOT NULL) THEN
    RAISE EXCEPTION 'Sem permissão para criar destinos';
  END IF;

  SELECT id INTO v_id FROM public.cities
   WHERE lower(btrim(name)) = lower(v_name)
   ORDER BY active DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.cities SET active = true WHERE id = v_id AND NOT active;
    RETURN v_id;
  END IF;

  INSERT INTO public.cities (name, travel_minutes, outbound_minutes, return_minutes, active, travel_configured)
  VALUES (v_name, 0, 0, 0, true, false)
  RETURNING id INTO v_id;

  FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role::text IN ('owner', 'manager') LOOP
    PERFORM public.notify(r.user_id, 'Novo destino sem tempo de deslocação',
      'O destino "' || v_name || '" foi criado num serviço e precisa de tempo de deslocação configurado.',
      'warning', 'city', v_id);
  END LOOP;

  PERFORM public.audit('city_created_pending', 'city', v_id, NULL, jsonb_build_object('name', v_name));
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.create_city_pending(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_city_pending(text) TO authenticated;

-- When travel time is finally configured, recompute every service of that city.
CREATE OR REPLACE FUNCTION public.cities_recalc_activities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF new.travel_minutes IS DISTINCT FROM old.travel_minutes THEN
    PERFORM set_config('app.recalc_travel', 'on', true);
    UPDATE public.activities SET updated_at = now() WHERE city_id = new.id;
    PERFORM set_config('app.recalc_travel', 'off', true);
  END IF;
  RETURN new;
END; $$;

REVOKE ALL ON FUNCTION public.cities_recalc_activities() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS t_cities_recalc_activities ON public.cities;
CREATE TRIGGER t_cities_recalc_activities
  AFTER UPDATE ON public.cities
  FOR EACH ROW EXECUTE FUNCTION public.cities_recalc_activities();

-- Keep the configured flag in sync with the saved travel time.
CREATE OR REPLACE FUNCTION public.cities_mark_configured()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND new.travel_minutes IS DISTINCT FROM old.travel_minutes AND new.travel_minutes > 0 THEN
    new.travel_configured := true;
  END IF;
  IF TG_OP = 'INSERT' AND new.travel_minutes > 0 THEN
    new.travel_configured := true;
  END IF;
  RETURN new;
END; $$;

REVOKE ALL ON FUNCTION public.cities_mark_configured() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS t_cities_mark_configured ON public.cities;
CREATE TRIGGER t_cities_mark_configured
  BEFORE INSERT OR UPDATE ON public.cities
  FOR EACH ROW EXECUTE FUNCTION public.cities_mark_configured();