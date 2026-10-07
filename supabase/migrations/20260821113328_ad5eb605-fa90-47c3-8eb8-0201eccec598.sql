GRANT EXECUTE ON FUNCTION public.can_view_driver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_driver_schedule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_manages_driver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_driver_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_assistant_id() TO authenticated;