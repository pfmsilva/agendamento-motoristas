CREATE OR REPLACE FUNCTION public.can_resolve_assignments()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager');
$$;

DROP POLICY IF EXISTS "notifications own read" ON public.notifications;
CREATE POLICY "notifications own read"
ON public.notifications FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND (kind <> 'assignment_pending' OR public.can_resolve_assignments())
);