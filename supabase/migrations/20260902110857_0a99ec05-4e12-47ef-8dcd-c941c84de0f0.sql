-- Assignments: only owner may write
DROP POLICY IF EXISTS "assignments admin write" ON public.assistant_driver_assignments;
CREATE POLICY "assignments owner write" ON public.assistant_driver_assignments
  FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());

-- Delegations: manager (non-owner) loses visibility
DROP POLICY IF EXISTS "delegations read" ON public.assistant_delegations;
CREATE POLICY "delegations read" ON public.assistant_delegations
  FOR SELECT TO authenticated USING (
    is_owner()
    OR original_assistant_id = my_assistant_id()
    OR delegate_assistant_id = my_assistant_id()
    OR driver_id = my_driver_id()
  );

-- Audit log: owner only
DROP POLICY IF EXISTS "audit manager read" ON public.audit_log;
CREATE POLICY "audit owner read" ON public.audit_log
  FOR SELECT TO authenticated USING (is_owner());