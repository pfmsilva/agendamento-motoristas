DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.prorettype = 'trigger'::regtype AS is_trigger
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    IF f.is_trigger THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f.sig);
    END IF;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.pick_driver_by_priority(uuid, timestamptz, timestamptz, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_pending_assignment(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.occupation_window(uuid, timestamptz, timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify(uuid, text, text, text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.audit(text, text, uuid, jsonb, jsonb) FROM authenticated;