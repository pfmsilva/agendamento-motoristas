REVOKE ALL ON FUNCTION public.unavailability_before() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.activities_after() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.timeoff_after() FROM anon, authenticated, public;