REVOKE ALL ON FUNCTION public.can_manage_driver_schedule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_driver_schedule(uuid) TO authenticated, service_role;