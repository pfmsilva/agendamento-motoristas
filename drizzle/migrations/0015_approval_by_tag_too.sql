CREATE OR REPLACE FUNCTION public.activities_approval_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.event_kind_tags k
     WHERE k.requires_approval
       AND (k.kind = new.event_kind_key OR k.tag_id = new.tag_id)
  ) THEN
    new.approval_status := coalesce(new.approval_status, 'pending');
  END IF;
  RETURN new;
END; $$;