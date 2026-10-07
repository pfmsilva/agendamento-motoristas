-- activities delete
CREATE POLICY "activities write delete" ON public.activities FOR DELETE TO authenticated
USING (public.can_manage_driver_schedule(driver_id));

-- time_off delete
CREATE POLICY "timeoff delete" ON public.time_off FOR DELETE TO authenticated
USING (public.can_manage_driver_schedule(driver_id) OR driver_id = public.my_driver_id());

-- unavailability delete
CREATE POLICY "unavail delete" ON public.unavailability FOR DELETE TO authenticated
USING (public.can_manage_driver_schedule(driver_id) OR driver_id = public.my_driver_id());

-- notifications: explicit deny on direct inserts, allow deleting own
CREATE POLICY "notifications no client insert" ON public.notifications FOR INSERT TO authenticated
WITH CHECK (false);
CREATE POLICY "notifications own delete" ON public.notifications FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- user_roles: manager-only writes
CREATE POLICY "roles manager insert" ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.is_manager());
CREATE POLICY "roles manager update" ON public.user_roles FOR UPDATE TO authenticated
USING (public.is_manager()) WITH CHECK (public.is_manager());
CREATE POLICY "roles manager delete" ON public.user_roles FOR DELETE TO authenticated
USING (public.is_manager());

GRANT DELETE ON public.activities, public.time_off, public.unavailability, public.notifications TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

-- Revoke direct execution of internal SECURITY DEFINER routines from clients
REVOKE EXECUTE ON FUNCTION public.audit(text, text, uuid, jsonb, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify(uuid, text, text, text, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.driver_audience(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.activities_after() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.timeoff_after() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.timeoff_guard() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_activity_conflicts() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unavailability_before() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assistant_manages_driver(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.my_assistant_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.my_driver_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_manager() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_view_driver(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_driver_schedule(uuid) FROM anon, authenticated;