ALTER TABLE public.assistant_delegations
  ADD COLUMN IF NOT EXISTS share_history boolean NOT NULL DEFAULT false;

UPDATE public.assistant_delegations SET share_history = true;

CREATE OR REPLACE FUNCTION public.delegated_activity_visible(_driver_id uuid, _start timestamptz, _end timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assistant_delegations d
    JOIN public.assistants s ON s.id = d.delegate_assistant_id
    WHERE d.driver_id = _driver_id
      AND s.user_id = auth.uid()
      AND d.active
      AND now() >= d.start_datetime
      AND now() <= d.end_datetime
      AND (
        d.share_history
        OR (coalesce(_start, d.start_datetime) < d.end_datetime
            AND coalesce(_end, d.end_datetime) > d.start_datetime)
      )
  )
$$;

REVOKE ALL ON FUNCTION public.delegated_activity_visible(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delegated_activity_visible(uuid, timestamptz, timestamptz) TO authenticated;

DROP POLICY IF EXISTS "activities read" ON public.activities;
CREATE POLICY "activities read" ON public.activities
FOR SELECT TO authenticated
USING (
  public.is_manager()
  OR public.is_owner()
  OR public.assistant_assigned_driver(driver_id)
  OR driver_id = public.my_driver_id()
  OR public.delegated_activity_visible(
       driver_id,
       coalesce(effective_start, calculated_occupation_start, start_datetime),
       coalesce(effective_end, calculated_occupation_end, end_datetime)
     )
);