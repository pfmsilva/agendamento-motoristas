ALTER TABLE public.unavailability ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS t_unavail_updated ON public.unavailability;
CREATE TRIGGER t_unavail_updated BEFORE UPDATE ON public.unavailability
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.audit_log REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'audit_log'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log';
  END IF;
END $$;