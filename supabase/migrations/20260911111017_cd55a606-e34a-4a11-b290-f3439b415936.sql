ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS passive boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.driver_is_passive(_driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT passive FROM public.drivers WHERE id = _driver_id), false)
$$;
REVOKE ALL ON FUNCTION public.driver_is_passive(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.driver_is_passive(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_driver_is_passive()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT passive FROM public.drivers WHERE user_id = auth.uid() LIMIT 1), false)
$$;
REVOKE ALL ON FUNCTION public.my_driver_is_passive() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_driver_is_passive() TO authenticated, service_role;

-- Owner-only mode changes + audit (no driver-facing notification)
CREATE OR REPLACE FUNCTION public.drivers_passive_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.passive IS DISTINCT FROM OLD.passive THEN
    IF NOT public.is_owner() THEN
      RAISE EXCEPTION 'Apenas o Proprietário pode alterar o tipo de motorista';
    END IF;
    PERFORM public.audit('driver_mode_change', 'drivers', NEW.id,
      jsonb_build_object('motorista', OLD.name, 'tipo', CASE WHEN OLD.passive THEN 'passivo' ELSE 'ativo' END),
      jsonb_build_object('motorista', NEW.name, 'tipo', CASE WHEN NEW.passive THEN 'passivo' ELSE 'ativo' END));
  ELSIF TG_OP = 'INSERT' AND NEW.passive THEN
    IF NOT public.is_owner() THEN
      RAISE EXCEPTION 'Apenas o Proprietário pode criar motoristas passivos';
    END IF;
    PERFORM public.audit('driver_mode_change', 'drivers', NEW.id, NULL,
      jsonb_build_object('motorista', NEW.name, 'tipo', 'passivo'));
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.drivers_passive_guard() FROM public, anon;

DROP TRIGGER IF EXISTS drivers_passive_guard ON public.drivers;
CREATE TRIGGER drivers_passive_guard AFTER INSERT OR UPDATE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.drivers_passive_guard();

-- Passive drivers cannot create their own schedule records
DROP POLICY IF EXISTS "timeoff insert" ON public.time_off;
CREATE POLICY "timeoff insert" ON public.time_off FOR INSERT TO authenticated
WITH CHECK (can_manage_driver_schedule(driver_id) OR (driver_id = my_driver_id() AND NOT my_driver_is_passive()));

DROP POLICY IF EXISTS "timeoff update" ON public.time_off;
CREATE POLICY "timeoff update" ON public.time_off FOR UPDATE TO authenticated
USING (can_manage_driver_schedule(driver_id) OR (driver_id = my_driver_id() AND NOT my_driver_is_passive()))
WITH CHECK (can_manage_driver_schedule(driver_id) OR (driver_id = my_driver_id() AND NOT my_driver_is_passive()));

DROP POLICY IF EXISTS "timeoff delete" ON public.time_off;
CREATE POLICY "timeoff delete" ON public.time_off FOR DELETE TO authenticated
USING (can_manage_driver_schedule(driver_id) OR (driver_id = my_driver_id() AND NOT my_driver_is_passive()));

DROP POLICY IF EXISTS "unavail insert" ON public.unavailability;
CREATE POLICY "unavail insert" ON public.unavailability FOR INSERT TO authenticated
WITH CHECK (can_manage_driver_schedule(driver_id) OR (driver_id = my_driver_id() AND NOT my_driver_is_passive()));

DROP POLICY IF EXISTS "unavail update" ON public.unavailability;
CREATE POLICY "unavail update" ON public.unavailability FOR UPDATE TO authenticated
USING (can_manage_driver_schedule(driver_id) OR (driver_id = my_driver_id() AND NOT my_driver_is_passive()))
WITH CHECK (can_manage_driver_schedule(driver_id) OR (driver_id = my_driver_id() AND NOT my_driver_is_passive()));

DROP POLICY IF EXISTS "unavail delete" ON public.unavailability;
CREATE POLICY "unavail delete" ON public.unavailability FOR DELETE TO authenticated
USING (can_manage_driver_schedule(driver_id) OR (driver_id = my_driver_id() AND NOT my_driver_is_passive()));

-- Passive drivers cannot create services or garage events
CREATE OR REPLACE FUNCTION public.create_driver_service(_administrator_id uuid, _title text, _type activity_type, _start timestamp with time zone, _end timestamp with time zone, _notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_driver uuid; v_id uuid;
BEGIN
  v_driver := public.my_driver_id();
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Apenas motoristas podem criar eventos na sua agenda';
  END IF;
  IF public.driver_is_passive(v_driver) THEN
    RAISE EXCEPTION 'Não tem permissão para criar serviços.';
  END IF;
  IF _administrator_id IS NULL THEN
    RAISE EXCEPTION 'Indique o Administrador a que o serviço pertence';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.administrators WHERE id = _administrator_id AND active) THEN
    RAISE EXCEPTION 'Administrador inválido';
  END IF;
  IF btrim(coalesce(_title, '')) = '' THEN
    RAISE EXCEPTION 'Indique o título do serviço';
  END IF;
  IF _end <= _start THEN
    RAISE EXCEPTION 'O fim tem de ser posterior ao início';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_driver::text));

  INSERT INTO public.activities (title, type, event_kind, driver_id, administrator_id,
                                 start_datetime, end_datetime, notes, status,
                                 assignment_status, assigned_at, override_conflict,
                                 created_by, updated_by)
  VALUES (btrim(_title), coalesce(_type, 'other'), 'administration', v_driver, _administrator_id,
          _start, _end, nullif(btrim(coalesce(_notes, '')), ''), 'confirmed',
          'manual', now(), false, auth.uid(), auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_driver_garage_event(_title text, _city_id uuid, _start timestamp with time zone, _end timestamp with time zone, _notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_driver uuid;
  v_id uuid;
  city_name text;
  city_base boolean;
  base_name text;
BEGIN
  v_driver := public.my_driver_id();
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Apenas motoristas podem criar eventos na sua agenda';
  END IF;
  IF public.driver_is_passive(v_driver) THEN
    RAISE EXCEPTION 'Não tem permissão para criar eventos.';
  END IF;
  IF btrim(coalesce(_title, '')) = '' THEN
    RAISE EXCEPTION 'Indique o título do evento';
  END IF;
  IF _city_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o local do serviço.';
  END IF;
  IF _end <= _start THEN
    RAISE EXCEPTION 'O fim tem de ser posterior ao início';
  END IF;

  SELECT name, is_base INTO city_name, city_base
    FROM public.cities
   WHERE id = _city_id AND active;
  IF city_name IS NULL THEN
    RAISE EXCEPTION 'Selecione um local válido para o serviço.';
  END IF;
  SELECT name INTO base_name FROM public.cities WHERE is_base AND active LIMIT 1;

  PERFORM pg_advisory_xact_lock(hashtext(v_driver::text));

  INSERT INTO public.activities (title, type, event_kind, driver_id, city_id,
                                 start_datetime, end_datetime, origin, destination,
                                 notes, status, assignment_status, assigned_at,
                                 override_conflict, created_by, updated_by)
  VALUES (btrim(_title), 'service', 'garage', v_driver, _city_id,
          _start, _end, base_name,
          CASE WHEN NOT coalesce(city_base, false) THEN city_name END,
          nullif(btrim(coalesce(_notes, '')), ''), 'confirmed',
          'manual', now(), false, auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;