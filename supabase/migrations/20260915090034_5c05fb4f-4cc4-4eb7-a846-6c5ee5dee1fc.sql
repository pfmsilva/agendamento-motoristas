DROP POLICY IF EXISTS "Authorized service participants read confidential content" ON public.activity_confidential_content;

CREATE POLICY "Authorized service participants read confidential content"
ON public.activity_confidential_content FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.activities a
    WHERE a.id = activity_id
      AND (
        (
          (public.my_assistant_id() IS NOT NULL OR public.my_administrator_id() IS NOT NULL)
          AND public.can_view_activity(a.administrator_id, a.assistant_id, a.driver_id, a.start_datetime)
        )
        OR (public.my_driver_id() IS NOT NULL AND a.driver_id = public.my_driver_id())
      )
  )
);