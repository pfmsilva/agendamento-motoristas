DROP POLICY IF EXISTS "drivers manager write" ON public.drivers;
CREATE POLICY "drivers admin write" ON public.drivers FOR ALL TO authenticated
  USING (public.is_manager() OR public.is_owner())
  WITH CHECK (public.is_manager() OR public.is_owner());

DROP POLICY IF EXISTS "assistants manager write" ON public.assistants;
CREATE POLICY "assistants admin write" ON public.assistants FOR ALL TO authenticated
  USING (public.is_manager() OR public.is_owner())
  WITH CHECK (public.is_manager() OR public.is_owner());

DROP POLICY IF EXISTS "assignments manager write" ON public.assistant_driver_assignments;
CREATE POLICY "assignments admin write" ON public.assistant_driver_assignments FOR ALL TO authenticated
  USING (public.is_manager() OR public.is_owner())
  WITH CHECK (public.is_manager() OR public.is_owner());