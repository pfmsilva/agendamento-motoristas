REVOKE ALL ON FUNCTION public.can_resolve_assignments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_resolve_assignments() TO authenticated;