-- Aviso ao Gestor/Proprietário quando um serviço usa uma rota sem tempo configurado.
CREATE OR REPLACE FUNCTION public.route_display_label(_origin_city_id uuid, _dest_city_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE ka text; kb text; la text; lb text; tmp text;
BEGIN
  ka := public.city_travel_key(_origin_city_id);
  kb := public.city_travel_key(_dest_city_id);
  IF ka IS NULL OR kb IS NULL THEN RETURN NULL; END IF;
  IF ka > kb THEN tmp := ka; ka := kb; kb := tmp; END IF;
  IF ka = 'LISBOA' THEN la := 'Lisboa / Casa';
  ELSE SELECT name INTO la FROM public.cities WHERE id = ka::uuid; END IF;
  IF kb = 'LISBOA' THEN lb := 'Lisboa / Casa';
  ELSE SELECT name INTO lb FROM public.cities WHERE id = kb::uuid; END IF;
  RETURN COALESCE(la, 'Local removido') || ' ↔ ' || COALESCE(lb, 'Local removido');
END; $$;

CREATE OR REPLACE FUNCTION public.notify_missing_travel_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE lbl text; r record;
BEGIN
  IF NOT COALESCE(new.travel_unknown, false) THEN RETURN NULL; END IF;
  IF new.origin_city_id IS NULL OR new.city_id IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE'
     AND COALESCE(old.travel_unknown, false)
     AND old.origin_city_id IS NOT DISTINCT FROM new.origin_city_id
     AND old.city_id IS NOT DISTINCT FROM new.city_id THEN
    RETURN NULL;
  END IF;

  lbl := public.route_display_label(new.origin_city_id, new.city_id);
  IF lbl IS NULL THEN RETURN NULL; END IF;

  FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role::text IN ('owner', 'manager') LOOP
    PERFORM public.notify(r.user_id, 'Rota sem tempo de deslocação',
      'Tempo de deslocação não configurado para ' || lbl || '.',
      'warning', 'activity', new.id);
  END LOOP;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS t_activities_missing_route ON public.activities;
CREATE TRIGGER t_activities_missing_route
  AFTER INSERT OR UPDATE OF origin_city_id, city_id, travel_unknown ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.notify_missing_travel_route();