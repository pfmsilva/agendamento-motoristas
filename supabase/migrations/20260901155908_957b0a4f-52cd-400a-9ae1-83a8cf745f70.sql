-- 1. Generic audit trigger for people/config tables
CREATE OR REPLACE FUNCTION public.audit_row_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ent text := TG_ARGV[0];
  act text;
  rec_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    act := ent || '_created';
    rec_id := new.id;
    PERFORM public.audit(act, ent, rec_id, NULL, to_jsonb(new));
    RETURN new;
  ELSIF TG_OP = 'DELETE' THEN
    act := ent || '_deleted';
    PERFORM public.audit(act, ent, old.id, to_jsonb(old), NULL);
    RETURN old;
  ELSE
    rec_id := new.id;
    IF to_jsonb(new) ? 'active'
       AND (to_jsonb(new)->>'active') IS DISTINCT FROM (to_jsonb(old)->>'active') THEN
      act := ent || CASE WHEN (to_jsonb(new)->>'active')::boolean THEN '_activated' ELSE '_deactivated' END;
    ELSE
      act := ent || '_updated';
    END IF;
    IF to_jsonb(new) - 'updated_at' = to_jsonb(old) - 'updated_at' THEN
      RETURN new;
    END IF;
    PERFORM public.audit(act, ent, rec_id, to_jsonb(old), to_jsonb(new));
    RETURN new;
  END IF;
END; $$;

DROP TRIGGER IF EXISTS t_audit_drivers ON public.drivers;
CREATE TRIGGER t_audit_drivers AFTER INSERT OR UPDATE OR DELETE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes('driver');

DROP TRIGGER IF EXISTS t_audit_assistants ON public.assistants;
CREATE TRIGGER t_audit_assistants AFTER INSERT OR UPDATE OR DELETE ON public.assistants
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes('assistant');

DROP TRIGGER IF EXISTS t_audit_cities ON public.cities;
CREATE TRIGGER t_audit_cities AFTER INSERT OR UPDATE OR DELETE ON public.cities
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes('city');

DROP TRIGGER IF EXISTS t_audit_assignments ON public.assistant_driver_assignments;
CREATE TRIGGER t_audit_assignments AFTER INSERT OR UPDATE OR DELETE ON public.assistant_driver_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes('assignment');

-- 2. Concurrency support: updated_at on assignments
ALTER TABLE public.assistant_driver_assignments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS t_assignments_updated ON public.assistant_driver_assignments;
CREATE TRIGGER t_assignments_updated BEFORE UPDATE ON public.assistant_driver_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Realtime: full row images + publication membership
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'activities','drivers','assistants','cities','time_off','unavailability',
    'assistant_driver_assignments','assistant_delegations','notifications'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;