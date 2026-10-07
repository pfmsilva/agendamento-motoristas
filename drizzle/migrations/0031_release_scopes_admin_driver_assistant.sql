COMMENT ON COLUMN public.schedule_releases.driver_id IS 'Libertação do próprio Motorista (activity_id e administrator_id nulos), ou motorista do serviço nas libertações antigas por serviço.';

CREATE OR REPLACE FUNCTION public.schedule_releases_sync_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; my_admin uuid; my_driver uuid; my_asst uuid;
BEGIN
  IF NEW.activity_id IS NULL THEN
    IF NEW.end_datetime <= NEW.start_datetime THEN RAISE EXCEPTION 'O fim tem de ser posterior ao início.'; END IF;
    my_admin := public.my_administrator_id();
    my_driver := public.my_driver_id();
    my_asst := public.my_assistant_id();
    IF TG_OP = 'UPDATE' AND NOT (
         (OLD.administrator_id IS NOT NULL AND (OLD.administrator_id = my_admin
            OR (my_asst IS NOT NULL AND public.assistant_serves_administrator(my_asst, OLD.administrator_id))))
      OR (OLD.administrator_id IS NULL AND OLD.driver_id IS NOT NULL AND OLD.driver_id = my_driver)) THEN
      RAISE EXCEPTION 'Não pode alterar esta libertação.';
    END IF;
    IF my_admin IS NOT NULL THEN
      NEW.administrator_id := my_admin; NEW.driver_id := NULL;
    ELSIF my_driver IS NOT NULL THEN
      NEW.administrator_id := NULL; NEW.driver_id := my_driver;
    ELSIF my_asst IS NOT NULL THEN
      IF NEW.administrator_id IS NULL OR NOT public.assistant_serves_administrator(my_asst, NEW.administrator_id) THEN
        RAISE EXCEPTION 'Só pode libertar o horário de um Administrador que assiste.';
      END IF;
      NEW.driver_id := NULL;
    ELSE
      RAISE EXCEPTION 'Sem permissão para libertar horário.';
    END IF;
    IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid(); END IF;
    NEW.updated_by := auth.uid();
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'As libertações são feitas no cabeçalho do calendário.'; END IF;
  SELECT id, driver_id INTO a FROM public.activities WHERE id = NEW.activity_id;
  NEW.driver_id := a.driver_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.can_own_release(_administrator_id uuid, _driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _administrator_id IS NOT NULL THEN
      _administrator_id = public.my_administrator_id()
      OR (public.my_assistant_id() IS NOT NULL AND public.assistant_serves_administrator(public.my_assistant_id(), _administrator_id))
    ELSE _driver_id IS NOT NULL AND _driver_id = public.my_driver_id()
  END
$$;
GRANT EXECUTE ON FUNCTION public.can_own_release(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "releases insert own" ON public.schedule_releases;
DROP POLICY IF EXISTS "releases update own" ON public.schedule_releases;
DROP POLICY IF EXISTS "releases delete own" ON public.schedule_releases;
CREATE POLICY "releases insert own" ON public.schedule_releases FOR INSERT TO authenticated
  WITH CHECK (activity_id IS NULL AND public.can_own_release(administrator_id, driver_id));
CREATE POLICY "releases update own" ON public.schedule_releases FOR UPDATE TO authenticated
  USING (activity_id IS NULL AND public.can_own_release(administrator_id, driver_id))
  WITH CHECK (activity_id IS NULL AND public.can_own_release(administrator_id, driver_id));
CREATE POLICY "releases delete own" ON public.schedule_releases FOR DELETE TO authenticated
  USING ((activity_id IS NULL AND public.can_own_release(administrator_id, driver_id))
         OR (activity_id IS NOT NULL AND driver_id IS NOT NULL AND public.can_release_driver_schedule(driver_id)));

CREATE OR REPLACE FUNCTION public.released_minutes(_driver_id uuid, _start timestamptz, _end timestamptz)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE rec record; cs timestamptz; ce timestamptz; total numeric := 0;
BEGIN
  IF _driver_id IS NULL OR _start IS NULL OR _end IS NULL OR _end <= _start THEN RETURN 0; END IF;
  FOR rec IN
    SELECT greatest(r.start_datetime, coalesce(a.effective_start, a.start_datetime), _start) rs,
           least(r.end_datetime, coalesce(a.effective_end, a.end_datetime), _end) re
      FROM public.schedule_releases r
      JOIN public.activities a ON a.driver_id = _driver_id AND a.status <> 'cancelled'
       AND (r.activity_id = a.id
         OR (r.activity_id IS NULL AND r.administrator_id IS NOT NULL AND r.administrator_id = a.administrator_id)
         OR (r.activity_id IS NULL AND r.administrator_id IS NULL AND r.driver_id = a.driver_id))
     WHERE r.start_datetime < _end AND r.end_datetime > _start
     ORDER BY 1, 2
  LOOP
    IF rec.re <= rec.rs THEN CONTINUE; END IF;
    IF cs IS NULL THEN cs := rec.rs; ce := rec.re;
    ELSIF rec.rs <= ce THEN ce := greatest(ce, rec.re);
    ELSE total := total + extract(epoch FROM (ce - cs)); cs := rec.rs; ce := rec.re; END IF;
  END LOOP;
  IF cs IS NOT NULL THEN total := total + extract(epoch FROM (ce - cs)); END IF;
  RETURN floor(total / 60)::bigint;
END $$;

CREATE INDEX IF NOT EXISTS schedule_releases_own_driver_idx ON public.schedule_releases(driver_id, start_datetime) WHERE activity_id IS NULL AND administrator_id IS NULL;