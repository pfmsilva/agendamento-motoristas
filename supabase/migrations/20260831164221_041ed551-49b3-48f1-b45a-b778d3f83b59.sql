ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS travel_minutes integer NOT NULL DEFAULT 0;

UPDATE public.cities SET travel_minutes = GREATEST(COALESCE(outbound_minutes,0), COALESCE(return_minutes,0));

CREATE OR REPLACE FUNCTION public.cities_sync_travel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF new.travel_minutes = 0 AND (COALESCE(new.outbound_minutes,0) > 0 OR COALESCE(new.return_minutes,0) > 0) THEN
      new.travel_minutes := GREATEST(COALESCE(new.outbound_minutes,0), COALESCE(new.return_minutes,0));
    END IF;
  ELSIF new.travel_minutes IS DISTINCT FROM old.travel_minutes THEN
    -- new single value wins
    NULL;
  ELSIF COALESCE(new.outbound_minutes,0) IS DISTINCT FROM COALESCE(old.outbound_minutes,0)
     OR COALESCE(new.return_minutes,0) IS DISTINCT FROM COALESCE(old.return_minutes,0) THEN
    new.travel_minutes := GREATEST(COALESCE(new.outbound_minutes,0), COALESCE(new.return_minutes,0));
  END IF;

  new.outbound_minutes := new.travel_minutes;
  new.return_minutes := new.travel_minutes;
  RETURN new;
END; $$;

REVOKE EXECUTE ON FUNCTION public.cities_sync_travel() FROM anon, authenticated;

DROP TRIGGER IF EXISTS cities_sync_travel_trg ON public.cities;
CREATE TRIGGER cities_sync_travel_trg
BEFORE INSERT OR UPDATE ON public.cities
FOR EACH ROW EXECUTE FUNCTION public.cities_sync_travel();

CREATE OR REPLACE FUNCTION public.compute_activity_occupation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE tm integer; base boolean;
BEGIN
  IF new.city_id IS NOT NULL THEN
    SELECT travel_minutes, is_base INTO tm, base
      FROM public.cities WHERE id = new.city_id AND active;
  END IF;

  IF new.city_id IS NULL OR tm IS NULL THEN
    new.travel_unknown := true;
    tm := 0;
  ELSE
    new.travel_unknown := false;
  END IF;

  new.calculated_occupation_start := new.start_datetime - make_interval(mins => COALESCE(tm, 0));
  new.calculated_occupation_end   := new.end_datetime   + make_interval(mins => COALESCE(tm, 0));

  IF new.driver_adjusted_start IS NOT NULL AND new.driver_adjusted_end IS NOT NULL
     AND new.driver_adjusted_end <= new.driver_adjusted_start THEN
    RAISE EXCEPTION 'O fim do ajuste tem de ser posterior ao início';
  END IF;
  RETURN new;
END; $$;