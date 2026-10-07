REVOKE ALL ON FUNCTION public.protect_admin_activity_content() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_admin_series_content() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_activity_confidential_content() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_series_confidential_content() FROM PUBLIC, anon, authenticated;