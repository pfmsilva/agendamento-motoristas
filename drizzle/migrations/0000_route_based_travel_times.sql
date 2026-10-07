-- Rotas de deslocação (origem ↔ destino), bidirecionais e sem duplicados invertidos.

-- Chave de zona: todos os locais "Lisboa - ..." e "Casa" formam a zona LISBOA.
CREATE OR REPLACE FUNCTION public.city_travel_key(_city_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
           WHEN c.name = 'Casa' OR c.name ILIKE 'Lisboa -%' THEN 'LISBOA'
           ELSE c.id::text
         END
    FROM public.cities c
   WHERE c.id = _city_id
$$;

CREATE TABLE IF NOT EXISTS public.travel_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_a text NOT NULL,
  key_b text NOT NULL,
  minutes integer NOT NULL CHECK (minutes > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT travel_routes_key_order CHECK (key_a < key_b),
  CONSTRAINT travel_routes_unique_pair UNIQUE (key_a, key_b)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_routes TO authenticated;
GRANT ALL ON public.travel_routes TO service_role;

ALTER TABLE public.travel_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "travel_routes_select" ON public.travel_routes;
CREATE POLICY "travel_routes_select" ON public.travel_routes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "travel_routes_manage" ON public.travel_routes;
CREATE POLICY "travel_routes_manage" ON public.travel_routes
  FOR ALL TO authenticated
  USING (public.is_owner() OR public.is_manager())
  WITH CHECK (public.is_owner() OR public.is_manager());

DROP TRIGGER IF EXISTS t_travel_routes_touch ON public.travel_routes;
CREATE TRIGGER t_travel_routes_touch BEFORE UPDATE ON public.travel_routes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Minutos de deslocação de uma rota. NULL = rota por configurar.
CREATE OR REPLACE FUNCTION public.route_travel_minutes(_origin_city_id uuid, _dest_city_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE ka text; kb text; m integer;
BEGIN
  IF _origin_city_id IS NULL OR _dest_city_id IS NULL THEN RETURN NULL; END IF;
  ka := public.city_travel_key(_origin_city_id);
  kb := public.city_travel_key(_dest_city_id);
  IF ka IS NULL OR kb IS NULL THEN RETURN NULL; END IF;
  IF ka = 'LISBOA' AND kb = 'LISBOA' THEN RETURN 60; END IF;
  IF ka = kb THEN RETURN 0; END IF;
  SELECT minutes INTO m FROM public.travel_routes
   WHERE key_a = LEAST(ka, kb) AND key_b = GREATEST(ka, kb);
  RETURN m;
END; $$;

-- Migração dos tempos por cidade: passam a ser rotas zona de Lisboa ↔ cidade.
INSERT INTO public.travel_routes (key_a, key_b, minutes)
SELECT LEAST('LISBOA', c.id::text), GREATEST('LISBOA', c.id::text), c.travel_minutes
  FROM public.cities c
 WHERE c.travel_minutes > 0
   AND c.travel_configured
   AND NOT (c.name = 'Casa' OR c.name ILIKE 'Lisboa -%')
ON CONFLICT (key_a, key_b) DO NOTHING;

-- Ocupação calculada: passa a depender da rota origem → destino.
CREATE OR REPLACE FUNCTION public.compute_activity_occupation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE tm integer;
BEGIN
  tm := public.route_travel_minutes(new.origin_city_id, new.city_id);

  IF tm IS NULL THEN
    new.travel_unknown := true;
    tm := 0;
  ELSE
    new.travel_unknown := false;
  END IF;

  new.calculated_occupation_start := new.start_datetime - make_interval(mins => tm);
  new.calculated_occupation_end   := new.end_datetime
    + make_interval(mins => CASE WHEN COALESCE(new.round_trip, true) THEN tm ELSE 0 END);

  IF new.driver_adjusted_start IS NOT NULL AND new.driver_adjusted_end IS NOT NULL
     AND new.driver_adjusted_end <= new.driver_adjusted_start THEN
    RAISE EXCEPTION 'O fim do ajuste tem de ser posterior ao início';
  END IF;
  RETURN new;
END; $$;

-- Pré-visualização usada pelas RPC de serviços: mesma lógica de rota.
CREATE OR REPLACE FUNCTION public.occupation_window(
  _origin_city_id uuid, _city_id uuid,
  _start timestamptz, _end timestamptz, _round_trip boolean,
  OUT occ_start timestamptz, OUT occ_end timestamptz)
RETURNS record
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE tm integer;
BEGIN
  tm := COALESCE(public.route_travel_minutes(_origin_city_id, _city_id), 0);
  occ_start := _start - make_interval(mins => tm);
  occ_end := _end + make_interval(mins => CASE WHEN COALESCE(_round_trip, true) THEN tm ELSE 0 END);
END; $$;

CREATE OR REPLACE FUNCTION public.occupation_window(
  _city_id uuid, _start timestamptz, _end timestamptz,
  OUT occ_start timestamptz, OUT occ_end timestamptz)
RETURNS record
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE tm integer; lis uuid;
BEGIN
  SELECT id INTO lis FROM public.cities
   WHERE name ILIKE 'Lisboa -%' OR name = 'Casa' ORDER BY name LIMIT 1;
  tm := COALESCE(public.route_travel_minutes(lis, _city_id), 0);
  occ_start := _start - make_interval(mins => tm);
  occ_end := _end + make_interval(mins => tm);
END; $$;

CREATE OR REPLACE FUNCTION public.occupation_window(
  _city_id uuid, _start timestamptz, _end timestamptz, _round_trip boolean,
  OUT occ_start timestamptz, OUT occ_end timestamptz)
RETURNS record
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE tm integer; lis uuid;
BEGIN
  SELECT id INTO lis FROM public.cities
   WHERE name ILIKE 'Lisboa -%' OR name = 'Casa' ORDER BY name LIMIT 1;
  tm := COALESCE(public.route_travel_minutes(lis, _city_id), 0);
  occ_start := _start - make_interval(mins => tm);
  occ_end := _end + make_interval(mins => CASE WHEN COALESCE(_round_trip, true) THEN tm ELSE 0 END);
END; $$;

-- Recalcular ocupações quando uma rota muda.
CREATE OR REPLACE FUNCTION public.travel_routes_recalc_activities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE k_a text; k_b text;
BEGIN
  k_a := COALESCE(new.key_a, old.key_a);
  k_b := COALESCE(new.key_b, old.key_b);
  PERFORM set_config('app.recalc_travel', 'on', true);
  UPDATE public.activities a
     SET updated_at = now()
   WHERE a.city_id IS NOT NULL AND a.origin_city_id IS NOT NULL
     AND LEAST(public.city_travel_key(a.origin_city_id), public.city_travel_key(a.city_id)) = k_a
     AND GREATEST(public.city_travel_key(a.origin_city_id), public.city_travel_key(a.city_id)) = k_b;
  PERFORM set_config('app.recalc_travel', 'off', true);
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS t_travel_routes_recalc ON public.travel_routes;
CREATE TRIGGER t_travel_routes_recalc AFTER INSERT OR UPDATE OR DELETE ON public.travel_routes
  FOR EACH ROW EXECUTE FUNCTION public.travel_routes_recalc_activities();