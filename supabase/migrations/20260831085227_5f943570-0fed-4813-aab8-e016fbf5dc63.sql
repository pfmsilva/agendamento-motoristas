-- 1) new role value (added without referencing the literal later in this tx)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';

-- 2) owner helper: compares as text so it does not need the new enum literal in this transaction
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role::text = 'owner'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_view()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select public.is_manager() or public.is_owner()
$$;

REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_view() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_view() TO authenticated;

-- 3) owners can see every driver (and therefore every activity/time off/unavailability via can_view_driver)
CREATE OR REPLACE FUNCTION public.can_view_driver(_driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select public.is_manager()
     or public.is_owner()
     or public.assistant_manages_driver(_driver_id)
     or _driver_id = public.my_driver_id()
$$;

-- 4) owner read access on the remaining tables
DROP POLICY IF EXISTS "assistants read" ON public.assistants;
CREATE POLICY "assistants read" ON public.assistants
  FOR SELECT TO authenticated
  USING (public.is_admin_view() OR user_id = auth.uid());

DROP POLICY IF EXISTS "assignments read" ON public.assistant_driver_assignments;
CREATE POLICY "assignments read" ON public.assistant_driver_assignments
  FOR SELECT TO authenticated
  USING (public.is_admin_view() OR assistant_id = public.my_assistant_id());

DROP POLICY IF EXISTS "profiles self or manager read" ON public.profiles;
CREATE POLICY "profiles self or manager read" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin_view());

DROP POLICY IF EXISTS "audit manager read" ON public.audit_log;
CREATE POLICY "audit manager read" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin_view());

DROP POLICY IF EXISTS "roles self or manager read" ON public.user_roles;
CREATE POLICY "roles self or manager read" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_view());
