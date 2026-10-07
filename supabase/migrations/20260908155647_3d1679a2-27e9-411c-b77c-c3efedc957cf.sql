REVOKE ALL ON FUNCTION public.display_names() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_garage_event(uuid, text, timestamptz, timestamptz, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_service_series(uuid, text, public.activity_type, uuid, timestamptz, timestamptz, text, public.recurrence_freq, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_service_series(uuid, text, text, public.activity_type, uuid, time, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_service_series(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.series_shift(timestamptz, public.recurrence_freq, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activities_kind_guard() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.display_names() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_garage_event(uuid, text, timestamptz, timestamptz, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_service_series(uuid, text, public.activity_type, uuid, timestamptz, timestamptz, text, public.recurrence_freq, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_service_series(uuid, text, text, public.activity_type, uuid, time, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_service_series(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.series_shift(timestamptz, public.recurrence_freq, integer) TO authenticated;