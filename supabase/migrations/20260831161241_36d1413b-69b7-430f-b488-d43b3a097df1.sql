-- ============ 1. CITIES ============
CREATE TABLE public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  outbound_minutes integer NOT NULL DEFAULT 0 CHECK (outbound_minutes >= 0),
  return_minutes integer NOT NULL DEFAULT 0 CHECK (return_minutes >= 0),
  is_base boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cities TO authenticated;
GRANT ALL ON public.cities TO service_role;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cities read" ON public.cities FOR SELECT TO authenticated USING (true);
CREATE POLICY "cities write" ON public.cities FOR ALL TO authenticated
  USING (public.is_manager() OR public.is_owner())
  WITH CHECK (public.is_manager() OR public.is_owner());
CREATE TRIGGER t_cities_updated BEFORE UPDATE ON public.cities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.cities (name, outbound_minutes, return_minutes, is_base) VALUES
  ('Lisboa', 0, 0, true),
  ('Cascais', 30, 30, false),
  ('Setúbal', 45, 45, false),
  ('Évora', 90, 90, false),
  ('Leiria', 90, 90, false),
  ('Coimbra', 120, 120, false),
  ('Aveiro', 150, 150, false),
  ('Viseu', 165, 165, false),
  ('Faro', 165, 165, false),
  ('Porto', 180, 180, false),
  ('Guimarães', 210, 210, false),
  ('Braga', 213, 213, false);

-- ============ 2. ASSIGNMENTS + SETTINGS ============
ALTER TABLE public.assistant_driver_assignments ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS conditional_margin_minutes integer NOT NULL DEFAULT 60;

-- ============ 3. DELEGATIONS ============
CREATE TYPE public.delegation_type AS ENUM ('assistant', 'owner_limited');

CREATE TABLE public.assistant_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  original_assistant_id uuid REFERENCES public.assistants(id) ON DELETE SET NULL,
  delegate_assistant_id uuid NOT NULL REFERENCES public.assistants(id) ON DELETE CASCADE,
  start_datetime timestamptz NOT NULL,
  end_datetime timestamptz NOT NULL,
  delegation_type public.delegation_type NOT NULL DEFAULT 'assistant',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_delegations TO authenticated;
GRANT ALL ON public.assistant_delegations TO service_role;
ALTER TABLE public.assistant_delegations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER t_delegations_updated BEFORE UPDATE ON public.assistant_delegations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ 4. ACCESS HELPERS ============
CREATE OR REPLACE FUNCTION public.assistant_assigned_driver(_driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assistant_driver_assignments a
    JOIN public.assistants s ON s.id = a.assistant_id
    WHERE a.driver_id = _driver_id AND a.active AND s.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.assistant_delegated_driver(_driver_id uuid, _allow_limited boolean DEFAULT true)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assistant_delegations d
    JOIN public.assistants s ON s.id = d.delegate_assistant_id
    WHERE d.driver_id = _driver_id
      AND s.user_id = auth.uid()
      AND d.active
      AND now() >= d.start_datetime
      AND now() <= d.end_datetime
      AND (_allow_limited OR d.delegation_type <> 'owner_limited')
  )
$$;

CREATE OR REPLACE FUNCTION public.assistant_manages_driver(_driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.assistant_assigned_driver(_driver_id)
      OR public.assistant_delegated_driver(_driver_id, true)
$$;

-- full access = permanent assignment or assistant-created delegation (not owner_limited)
CREATE OR REPLACE FUNCTION public.assistant_manages_driver_full(_driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.assistant_assigned_driver(_driver_id)
      OR public.assistant_delegated_driver(_driver_id, false)
$$;

CREATE OR REPLACE FUNCTION public.can_view_driver_details(_driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_manager() OR public.is_owner()
      OR public.assistant_manages_driver_full(_driver_id)
      OR _driver_id = public.my_driver_id()
$$;

GRANT EXECUTE ON FUNCTION public.assistant_assigned_driver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_delegated_driver(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_manages_driver_full(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_driver_details(uuid) TO authenticated;

CREATE POLICY "delegations read" ON public.assistant_delegations FOR SELECT TO authenticated
  USING (
    public.is_admin_view()
    OR original_assistant_id = public.my_assistant_id()
    OR delegate_assistant_id = public.my_assistant_id()
    OR driver_id = public.my_driver_id()
  );
CREATE POLICY "delegations insert" ON public.assistant_delegations FOR INSERT TO authenticated
  WITH CHECK (
    public.is_owner()
    OR (delegation_type = 'assistant'
        AND original_assistant_id = public.my_assistant_id()
        AND public.assistant_assigned_driver(driver_id))
  );
CREATE POLICY "delegations update" ON public.assistant_delegations FOR UPDATE TO authenticated
  USING (public.is_owner() OR original_assistant_id = public.my_assistant_id())
  WITH CHECK (public.is_owner() OR original_assistant_id = public.my_assistant_id());
CREATE POLICY "delegations delete" ON public.assistant_delegations FOR DELETE TO authenticated
  USING (public.is_owner() OR original_assistant_id = public.my_assistant_id());

-- ============ 5. ACTIVITIES: service / occupation / adjustment ============
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES public.cities(id),
  ADD COLUMN IF NOT EXISTS calculated_occupation_start timestamptz,
  ADD COLUMN IF NOT EXISTS calculated_occupation_end timestamptz,
  ADD COLUMN IF NOT EXISTS driver_adjusted_start timestamptz,
  ADD COLUMN IF NOT EXISTS driver_adjusted_end timestamptz,
  ADD COLUMN IF NOT EXISTS travel_unknown boolean NOT NULL DEFAULT false;

UPDATE public.activities
   SET calculated_occupation_start = COALESCE(calculated_occupation_start, start_datetime),
       calculated_occupation_end   = COALESCE(calculated_occupation_end, end_datetime);

ALTER TABLE public.activities
  ADD COLUMN effective_start timestamptz
    GENERATED ALWAYS AS (COALESCE(driver_adjusted_start, calculated_occupation_start, start_datetime)) STORED,
  ADD COLUMN effective_end timestamptz
    GENERATED ALWAYS AS (COALESCE(driver_adjusted_end, calculated_occupation_end, end_datetime)) STORED;

CREATE INDEX IF NOT EXISTS idx_activities_driver_eff ON public.activities (driver_id, effective_start, effective_end);

-- compute occupation from city travel times
CREATE OR REPLACE FUNCTION public.compute_activity_occupation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ob integer; rb integer; base boolean;
BEGIN
  IF new.city_id IS NOT NULL THEN
    SELECT outbound_minutes, return_minutes, is_base INTO ob, rb, base
      FROM public.cities WHERE id = new.city_id AND active;
  END IF;

  IF new.city_id IS NULL THEN
    new.travel_unknown := true;
    ob := 0; rb := 0;
  ELSIF ob IS NULL THEN
    new.travel_unknown := true;
    ob := 0; rb := 0;
  ELSE
    new.travel_unknown := false;
  END IF;

  new.calculated_occupation_start := new.start_datetime - make_interval(mins => COALESCE(ob, 0));
  new.calculated_occupation_end   := new.end_datetime   + make_interval(mins => COALESCE(rb, 0));

  IF new.driver_adjusted_start IS NOT NULL AND new.driver_adjusted_end IS NOT NULL
     AND new.driver_adjusted_end <= new.driver_adjusted_start THEN
    RAISE EXCEPTION 'O fim do ajuste tem de ser posterior ao início';
  END IF;
  RETURN new;
END; $$;

CREATE TRIGGER t_activities_occupation BEFORE INSERT OR UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.compute_activity_occupation();

-- driver may only adjust their own occupation window
CREATE OR REPLACE FUNCTION public.activities_driver_adjust_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
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

  PERFORM public.audit('activity_occupation_adjusted', 'activity', new.id,
    jsonb_build_object('driver_adjusted_start', old.driver_adjusted_start, 'driver_adjusted_end', old.driver_adjusted_end),
    jsonb_build_object('driver_adjusted_start', new.driver_adjusted_start, 'driver_adjusted_end', new.driver_adjusted_end));
  RETURN new;
END; $$;

CREATE TRIGGER t_activities_driver_adjust BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.activities_driver_adjust_guard();

CREATE POLICY "activities driver adjust" ON public.activities FOR UPDATE TO authenticated
  USING (driver_id = public.my_driver_id())
  WITH CHECK (driver_id = public.my_driver_id());

-- ============ 6. CONFLICT DETECTION ON EFFECTIVE OCCUPATION ============
CREATE OR REPLACE FUNCTION public.check_activity_conflicts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_conflict record;
  v_allowed boolean;
  v_msg text;
  eff_start timestamptz;
  eff_end timestamptz;
BEGIN
  IF new.end_datetime <= new.start_datetime THEN
    RAISE EXCEPTION 'A hora de fim tem de ser posterior à de início';
  END IF;

  new.updated_by := auth.uid();
  IF tg_op = 'INSERT' THEN new.created_by := COALESCE(new.created_by, auth.uid()); END IF;

  IF new.status = 'cancelled' THEN RETURN new; END IF;

  eff_start := COALESCE(new.driver_adjusted_start, new.calculated_occupation_start, new.start_datetime);
  eff_end   := COALESCE(new.driver_adjusted_end, new.calculated_occupation_end, new.end_datetime);

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
END; $$;

-- ============ 7. ABSENCES WITHOUT APPROVAL ============
ALTER TABLE public.time_off ALTER COLUMN status SET DEFAULT 'approved'::public.timeoff_status;
UPDATE public.time_off SET status = 'approved' WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.timeoff_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    new.requested_by := COALESCE(new.requested_by, auth.uid());
    IF new.status IS NULL OR new.status = 'pending' THEN
      new.status := 'approved';
    END IF;
    RETURN new;
  END IF;

  IF new.status IS DISTINCT FROM old.status THEN
    IF NOT (public.can_manage_driver_schedule(new.driver_id)
            OR public.is_owner()
            OR new.driver_id = public.my_driver_id()) THEN
      RAISE EXCEPTION 'Não tem permissão para alterar esta ausência';
    END IF;
  END IF;
  RETURN new;
END; $$;

-- ============ 8. DELEGATION AUDIT ============
CREATE OR REPLACE FUNCTION public.delegations_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u record; d_name text; act text;
BEGIN
  SELECT name INTO d_name FROM public.drivers WHERE id = new.driver_id;
  act := CASE WHEN tg_op = 'INSERT' THEN 'delegation_created' ELSE 'delegation_modified' END;
  PERFORM public.audit(act, 'delegation', new.id,
    CASE WHEN tg_op = 'UPDATE' THEN to_jsonb(old) ELSE NULL END, to_jsonb(new));

  SELECT s.user_id INTO u FROM public.assistants s WHERE s.id = new.delegate_assistant_id;
  IF u.user_id IS NOT NULL THEN
    PERFORM public.notify(u.user_id,
      CASE WHEN tg_op = 'INSERT' THEN 'Nova delegação temporária' ELSE 'Delegação atualizada' END,
      d_name || ': ' || to_char(new.start_datetime, 'YYYY-MM-DD HH24:MI') || ' a ' ||
      to_char(new.end_datetime, 'YYYY-MM-DD HH24:MI'),
      'delegation', 'delegation', new.id);
  END IF;
  RETURN new;
END; $$;

CREATE TRIGGER t_delegations_after AFTER INSERT OR UPDATE ON public.assistant_delegations
  FOR EACH ROW EXECUTE FUNCTION public.delegations_after();

CREATE OR REPLACE FUNCTION public.delegations_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF new.end_datetime <= new.start_datetime THEN
    RAISE EXCEPTION 'O fim da delegação tem de ser posterior ao início';
  END IF;
  IF tg_op = 'INSERT' THEN new.created_by := COALESCE(new.created_by, auth.uid()); END IF;
  RETURN new;
END; $$;

CREATE TRIGGER t_delegations_before BEFORE INSERT OR UPDATE ON public.assistant_delegations
  FOR EACH ROW EXECUTE FUNCTION public.delegations_before();

REVOKE EXECUTE ON FUNCTION public.compute_activity_occupation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.activities_driver_adjust_guard() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delegations_after() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delegations_before() FROM anon, authenticated;