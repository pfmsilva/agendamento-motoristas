
revoke execute on function public.has_role(uuid, app_role) from public, anon;
revoke execute on function public.is_manager() from public, anon;
revoke execute on function public.my_driver_id() from public, anon;
revoke execute on function public.my_assistant_id() from public, anon;
revoke execute on function public.assistant_manages_driver(uuid) from public, anon;
revoke execute on function public.can_view_driver(uuid) from public, anon;
revoke execute on function public.can_manage_driver_schedule(uuid) from public, anon;
grant execute on function public.has_role(uuid, app_role) to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.my_driver_id() to authenticated;
grant execute on function public.my_assistant_id() to authenticated;
grant execute on function public.assistant_manages_driver(uuid) to authenticated;
grant execute on function public.can_view_driver(uuid) to authenticated;
grant execute on function public.can_manage_driver_schedule(uuid) to authenticated;

revoke execute on function public.notify(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.audit(text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.driver_audience(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.check_activity_conflicts() from public, anon, authenticated;
revoke execute on function public.activities_after() from public, anon, authenticated;
revoke execute on function public.timeoff_guard() from public, anon, authenticated;
revoke execute on function public.timeoff_after() from public, anon, authenticated;
revoke execute on function public.unavailability_before() from public, anon, authenticated;
