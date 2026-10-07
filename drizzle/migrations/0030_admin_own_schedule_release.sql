ALTER TABLE public.schedule_releases ALTER COLUMN driver_id DROP NOT NULL;
COMMENT ON COLUMN public.schedule_releases.driver_id IS 'Apenas em libertações antigas ligadas a um serviço (activity_id). Libertações do Administrador não têm motorista.';
COMMENT ON COLUMN public.schedule_releases.activity_id IS 'DEPRECATED: libertações antigas por serviço. Novas libertações pertencem ao Administrador (administrator_id).';

CREATE OR REPLACE FUNCTION public.schedule_releases_sync_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; me uuid;
BEGIN
  IF NEW.activity_id IS NULL THEN
    -- Libertação do próprio calendário do Administrador com sessão iniciada.
    me := public.my_administrator_id();
    IF me IS NULL THEN RAISE EXCEPTION 'Apenas um Administrador pode libertar o seu horário.'; END IF;
    IF TG_OP = 'UPDATE' AND OLD.administrator_id IS DISTINCT FROM me THEN
      RAISE EXCEPTION 'Não pode alterar libertações de outro Administrador.';
    END IF;
    NEW.administrator_id := me;
    NEW.driver_id := NULL;
    IF NEW.end_datetime <= NEW.start_datetime THEN RAISE EXCEPTION 'O fim tem de ser posterior ao início.'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'As libertações são feitas no calendário do Administrador.'; END IF;
  SELECT id, driver_id, coalesce(effective_start, start_datetime) s, coalesce(effective_end, end_datetime) e
    INTO a FROM public.activities WHERE id = NEW.activity_id;
  NEW.driver_id := a.driver_id;
  RETURN NEW;
END $$;

DROP POLICY IF EXISTS "releases read" ON public.schedule_releases;
DROP POLICY IF EXISTS "releases insert" ON public.schedule_releases;
DROP POLICY IF EXISTS "releases update" ON public.schedule_releases;
DROP POLICY IF EXISTS "releases delete" ON public.schedule_releases;
CREATE POLICY "releases read" ON public.schedule_releases FOR SELECT TO authenticated USING (true);
CREATE POLICY "releases insert own" ON public.schedule_releases FOR INSERT TO authenticated
  WITH CHECK (activity_id IS NULL AND administrator_id = public.my_administrator_id());
CREATE POLICY "releases update own" ON public.schedule_releases FOR UPDATE TO authenticated
  USING (activity_id IS NULL AND administrator_id = public.my_administrator_id())
  WITH CHECK (activity_id IS NULL AND administrator_id = public.my_administrator_id());
CREATE POLICY "releases delete own" ON public.schedule_releases FOR DELETE TO authenticated
  USING (administrator_id = public.my_administrator_id()
         OR (activity_id IS NOT NULL AND driver_id IS NOT NULL AND public.can_release_driver_schedule(driver_id)));

-- Minutos libertados de um motorista: cada libertação só corta os serviços a que se aplica
-- (os do Administrador que a criou, ou o serviço ligado nas libertações antigas).
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
       AND (r.activity_id = a.id OR (r.activity_id IS NULL AND r.administrator_id = a.administrator_id))
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

CREATE INDEX IF NOT EXISTS schedule_releases_admin_time_idx ON public.schedule_releases(administrator_id, start_datetime);