-- Ordenação canónica das chaves de rota passa a usar a collation "C"
-- (mesma ordem por pontos de código usada no frontend), evitando rejeições
-- de rotas válidas por divergência entre camadas.

ALTER TABLE public.travel_routes DROP CONSTRAINT IF EXISTS travel_routes_key_order;

-- Normaliza pares existentes que violem a nova ordem.
UPDATE public.travel_routes
   SET key_a = key_b, key_b = key_a
 WHERE key_a COLLATE "C" > key_b COLLATE "C";

ALTER TABLE public.travel_routes
  ADD CONSTRAINT travel_routes_key_order CHECK (key_a COLLATE "C" < key_b COLLATE "C");

CREATE OR REPLACE FUNCTION public.route_travel_minutes(_origin_city_id uuid, _dest_city_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ka text; kb text; m integer;
BEGIN
  IF _origin_city_id IS NULL OR _dest_city_id IS NULL THEN RETURN NULL; END IF;
  ka := public.city_travel_key(_origin_city_id);
  kb := public.city_travel_key(_dest_city_id);
  IF ka IS NULL OR kb IS NULL THEN RETURN NULL; END IF;
  IF ka = 'LISBOA' AND kb = 'LISBOA' THEN RETURN 60; END IF;
  IF ka = kb THEN RETURN 0; END IF;
  SELECT minutes INTO m FROM public.travel_routes
   WHERE key_a = LEAST(ka COLLATE "C", kb COLLATE "C")
     AND key_b = GREATEST(ka COLLATE "C", kb COLLATE "C");
  RETURN m;
END; $function$;

CREATE OR REPLACE FUNCTION public.travel_routes_recalc_activities()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE k_a text; k_b text;
BEGIN
  k_a := COALESCE(new.key_a, old.key_a);
  k_b := COALESCE(new.key_b, old.key_b);
  PERFORM set_config('app.recalc_travel', 'on', true);
  UPDATE public.activities a
     SET updated_at = now()
   WHERE a.city_id IS NOT NULL AND a.origin_city_id IS NOT NULL
     AND LEAST(public.city_travel_key(a.origin_city_id) COLLATE "C", public.city_travel_key(a.city_id) COLLATE "C") = k_a
     AND GREATEST(public.city_travel_key(a.origin_city_id) COLLATE "C", public.city_travel_key(a.city_id) COLLATE "C") = k_b;
  PERFORM set_config('app.recalc_travel', 'off', true);
  RETURN NULL;
END; $function$;