CREATE TABLE public.schedule_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  start_datetime timestamptz NOT NULL,
  end_datetime timestamptz NOT NULL,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_releases_range CHECK (end_datetime > start_datetime)
);
CREATE INDEX schedule_releases_driver_idx ON public.schedule_releases(driver_id, start_datetime);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_releases TO authenticated;
GRANT ALL ON public.schedule_releases TO service_role;
ALTER TABLE public.schedule_releases ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_release_driver_schedule(_driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_driver_schedule(_driver_id)
      OR _driver_id = public.my_driver_id()
      OR ((public.has_role(auth.uid(), 'assistant') OR public.has_role(auth.uid(), 'administrator'))
          AND public.can_view_driver(_driver_id))
$$;

CREATE POLICY "releases read" ON public.schedule_releases FOR SELECT TO authenticated USING (public.can_view_driver(driver_id));
CREATE POLICY "releases insert" ON public.schedule_releases FOR INSERT TO authenticated WITH CHECK (public.can_release_driver_schedule(driver_id));
CREATE POLICY "releases update" ON public.schedule_releases FOR UPDATE TO authenticated USING (public.can_release_driver_schedule(driver_id)) WITH CHECK (public.can_release_driver_schedule(driver_id));
CREATE POLICY "releases delete" ON public.schedule_releases FOR DELETE TO authenticated USING (public.can_release_driver_schedule(driver_id));

CREATE OR REPLACE FUNCTION public.schedule_releases_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN new.updated_at := now(); new.updated_by := auth.uid(); RETURN new; END; $$;
CREATE TRIGGER schedule_releases_touch BEFORE UPDATE ON public.schedule_releases FOR EACH ROW EXECUTE FUNCTION public.schedule_releases_touch();
CREATE TRIGGER schedule_releases_audit AFTER INSERT OR UPDATE OR DELETE ON public.schedule_releases FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes('schedule_release');

CREATE OR REPLACE FUNCTION public.is_released(_driver_id uuid, _start timestamptz, _end timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.schedule_releases r
                  WHERE r.driver_id = _driver_id AND r.start_datetime <= _start AND r.end_datetime >= _end)
$$;

CREATE OR REPLACE FUNCTION public.driver_is_available(_driver_id uuid, _start timestamptz, _end timestamptz, _ignore_activity uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t_type text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = _driver_id AND active) THEN
    RETURN 'motorista inativo';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.activities a
     WHERE a.driver_id = _driver_id
       AND (_ignore_activity IS NULL OR a.id <> _ignore_activity)
       AND a.status <> 'cancelled'
       AND coalesce(a.driver_adjusted_start, a.calculated_occupation_start, a.start_datetime) < _end
       AND coalesce(a.driver_adjusted_end, a.calculated_occupation_end, a.end_datetime) > _start
       AND NOT public.is_released(_driver_id,
             greatest(_start, coalesce(a.driver_adjusted_start, a.calculated_occupation_start, a.start_datetime)),
             least(_end, coalesce(a.driver_adjusted_end, a.calculated_occupation_end, a.end_datetime)))
  ) THEN
    RETURN 'já tem um serviço neste período';
  END IF;
  SELECT t.type::text INTO t_type FROM public.time_off t
   WHERE t.driver_id = _driver_id AND t.status = 'approved'
     AND (_start AT TIME ZONE 'Europe/Lisbon')::date <= t.end_date
     AND (_end AT TIME ZONE 'Europe/Lisbon')::date >= t.start_date
   LIMIT 1;
  IF t_type IS NOT NULL THEN
    RETURN CASE WHEN t_type = 'holiday' THEN 'está de férias neste período' ELSE 'tem ausência registada neste período' END;
  END IF;
  IF EXISTS (SELECT 1 FROM public.unavailability u
              WHERE u.driver_id = _driver_id AND u.status = 'active'
                AND _start < u.end_datetime AND _end > u.start_datetime) THEN
    RETURN 'está indisponível neste período';
  END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.driver_is_available(_driver_id uuid, _start timestamptz, _end timestamptz, _ignore_activity uuid, _ignore_timeoff uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE msg text;
BEGIN
  msg := public.driver_is_available(_driver_id, _start, _end, _ignore_activity);
  IF msg IS NULL OR _ignore_timeoff IS NULL THEN RETURN msg; END IF;
  IF EXISTS (SELECT 1 FROM public.drivers WHERE id = _driver_id AND NOT active) THEN RETURN 'motorista inativo'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.activities a
     WHERE a.driver_id = _driver_id AND a.status <> 'cancelled'
       AND (_ignore_activity IS NULL OR a.id <> _ignore_activity)
       AND coalesce(a.calculated_occupation_start, a.start_datetime) < _end
       AND coalesce(a.calculated_occupation_end, a.end_datetime) > _start
       AND NOT public.is_released(_driver_id,
             greatest(_start, coalesce(a.calculated_occupation_start, a.start_datetime)),
             least(_end, coalesce(a.calculated_occupation_end, a.end_datetime)))
  ) THEN RETURN 'serviço sobreposto'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.time_off t
     WHERE t.driver_id = _driver_id AND t.status = 'approved' AND t.id <> _ignore_timeoff
       AND t.start_date <= (_end AT TIME ZONE 'Europe/Lisbon')::date
       AND t.end_date >= (_start AT TIME ZONE 'Europe/Lisbon')::date
  ) THEN RETURN 'ausência aprovada'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.unavailability u
     WHERE u.driver_id = _driver_id AND u.status = 'active'
       AND u.start_datetime < _end AND u.end_datetime > _start
  ) THEN RETURN 'indisponibilidade registada'; END IF;
  RETURN NULL;
END; $$;

-- Gestor gere tipos de evento como o Proprietário
DROP POLICY IF EXISTS event_kind_tags_owner_write ON public.event_kind_tags;
CREATE POLICY event_kind_tags_owner_write ON public.event_kind_tags FOR ALL TO authenticated
  USING (public.is_owner() OR public.is_manager()) WITH CHECK (public.is_owner() OR public.is_manager());
DROP POLICY IF EXISTS "Owners can create event tags" ON public.event_tags;
CREATE POLICY "Owners can create event tags" ON public.event_tags FOR INSERT TO authenticated
  WITH CHECK ((public.is_owner() OR public.is_manager()) AND (NOT is_core) AND (system_key IS NULL));
DROP POLICY IF EXISTS "Owners can delete custom unused event tags" ON public.event_tags;
CREATE POLICY "Owners can delete custom unused event tags" ON public.event_tags FOR DELETE TO authenticated
  USING ((public.is_owner() OR public.is_manager()) AND (NOT is_core));
DROP POLICY IF EXISTS "Owners can update event tags" ON public.event_tags;
CREATE POLICY "Owners can update event tags" ON public.event_tags FOR UPDATE TO authenticated
  USING (public.is_owner() OR public.is_manager()) WITH CHECK (public.is_owner() OR public.is_manager());
DROP POLICY IF EXISTS loan_vehicle_event_types_insert ON public.loan_vehicle_event_types;
CREATE POLICY loan_vehicle_event_types_insert ON public.loan_vehicle_event_types FOR INSERT TO authenticated
  WITH CHECK (public.is_owner() OR public.is_manager());
DROP POLICY IF EXISTS loan_vehicle_event_types_update ON public.loan_vehicle_event_types;
CREATE POLICY loan_vehicle_event_types_update ON public.loan_vehicle_event_types FOR UPDATE TO authenticated
  USING (public.is_owner() OR public.is_manager()) WITH CHECK (public.is_owner() OR public.is_manager());
DROP POLICY IF EXISTS loan_vehicle_event_types_delete ON public.loan_vehicle_event_types;
CREATE POLICY loan_vehicle_event_types_delete ON public.loan_vehicle_event_types FOR DELETE TO authenticated
  USING (public.is_owner() OR public.is_manager());