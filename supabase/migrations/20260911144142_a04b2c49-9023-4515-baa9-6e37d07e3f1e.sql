REVOKE ALL ON FUNCTION public.event_tags_protect_core() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activities_tag_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_series_tag_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.time_off_tag_guard() FROM PUBLIC, anon, authenticated;