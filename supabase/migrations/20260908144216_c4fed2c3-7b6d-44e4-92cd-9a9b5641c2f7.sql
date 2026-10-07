CREATE OR REPLACE FUNCTION public.can_edit_activities()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select public.is_manager() or public.is_owner()
$$;

CREATE OR REPLACE FUNCTION public.can_view_driver(_driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select public.can_edit_activities() or public.is_administrator() or _driver_id = public.my_driver_id()
$$;

DROP POLICY IF EXISTS "activities read" ON public.activities;
CREATE POLICY "activities read" ON public.activities FOR SELECT TO authenticated
  USING (public.can_edit_activities() OR public.is_administrator() OR assistant_id = public.my_assistant_id() OR driver_id = public.my_driver_id());

DROP POLICY IF EXISTS "timeoff insert" ON public.time_off;
CREATE POLICY "timeoff insert" ON public.time_off FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_driver_schedule(driver_id) OR driver_id = public.my_driver_id());

DROP POLICY IF EXISTS "unavail insert" ON public.unavailability;
CREATE POLICY "unavail insert" ON public.unavailability FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_driver_schedule(driver_id) OR driver_id = public.my_driver_id());
