ALTER TABLE public.schedule_releases ADD COLUMN activity_id uuid REFERENCES public.activities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS schedule_releases_activity_idx ON public.schedule_releases(activity_id);
CREATE INDEX IF NOT EXISTS schedule_releases_driver_time_idx ON public.schedule_releases(driver_id, start_datetime, end_datetime);

UPDATE public.schedule_releases r SET activity_id = (
  SELECT a.id FROM public.activities a
   WHERE a.driver_id = r.driver_id AND a.status <> 'cancelled'
     AND coalesce(a.effective_start, a.start_datetime) < r.end_datetime
     AND coalesce(a.effective_end, a.end_datetime) > r.start_datetime
   ORDER BY a.start_datetime LIMIT 1)
WHERE r.activity_id IS NULL;

-- A libertação pertence ao serviço: o motorista é sempre o do serviço e o intervalo fica dentro da ocupação.
CREATE OR REPLACE FUNCTION public.schedule_releases_sync_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
  IF NEW.activity_id IS NULL THEN
    RAISE EXCEPTION 'A libertação de horário tem de pertencer a um serviço.';
  END IF;
  SELECT id, driver_id, status, coalesce(effective_start, start_datetime) s, coalesce(effective_end, end_datetime) e
    INTO a FROM public.activities WHERE id = NEW.activity_id;
  IF a.id IS NULL OR a.status = 'cancelled' THEN RAISE EXCEPTION 'Serviço inexistente ou cancelado.'; END IF;
  IF a.driver_id IS NULL THEN RAISE EXCEPTION 'O serviço ainda não tem motorista atribuído.'; END IF;
  NEW.driver_id := a.driver_id;
  NEW.start_datetime := greatest(NEW.start_datetime, a.s);
  NEW.end_datetime := least(NEW.end_datetime, a.e);
  IF NEW.end_datetime <= NEW.start_datetime THEN
    RAISE EXCEPTION 'O intervalo libertado tem de estar dentro da ocupação do serviço.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS schedule_releases_sync_activity ON public.schedule_releases;
CREATE TRIGGER schedule_releases_sync_activity BEFORE INSERT OR UPDATE ON public.schedule_releases
  FOR EACH ROW EXECUTE FUNCTION public.schedule_releases_sync_activity();

-- Se o serviço mudar de motorista, as libertações acompanham-no.
CREATE OR REPLACE FUNCTION public.activities_sync_release_driver()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN
    IF NEW.driver_id IS NULL THEN
      DELETE FROM public.schedule_releases WHERE activity_id = NEW.id;
    ELSE
      UPDATE public.schedule_releases SET driver_id = NEW.driver_id WHERE activity_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS activities_sync_release_driver ON public.activities;
CREATE TRIGGER activities_sync_release_driver AFTER UPDATE OF driver_id ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.activities_sync_release_driver();

-- Ação de gestão: o motorista deixa de poder libertar o próprio horário.
CREATE OR REPLACE FUNCTION public.can_release_driver_schedule(_driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_driver_schedule(_driver_id)
      OR ((public.has_role(auth.uid(), 'assistant') OR public.has_role(auth.uid(), 'administrator'))
          AND _driver_id IN (SELECT public.my_releasable_driver_ids()))
$$;