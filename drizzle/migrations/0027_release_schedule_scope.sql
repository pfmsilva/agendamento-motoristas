CREATE OR REPLACE FUNCTION public.my_releasable_driver_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- Hierarquia dos Administradores servidos (próprio ou ligações ativas do assistente)
  SELECT p.driver_id FROM public.administrator_driver_priorities p
   JOIN public.drivers d ON d.id = p.driver_id AND d.active
   WHERE p.active AND public.serves_administrator(p.administrator_id)
  UNION
  -- Alocação permanente ao assistente
  SELECT d.id FROM public.drivers d
   WHERE d.active AND d.assistant_id IS NOT NULL AND d.assistant_id = public.my_assistant_id()
  UNION
  -- Alocação temporária ao assistente, apenas enquanto ativa
  SELECT g.driver_id FROM public.assistant_delegations g
   JOIN public.drivers d ON d.id = g.driver_id AND d.active
   WHERE g.active AND g.delegate_assistant_id = public.my_assistant_id()
     AND g.start_datetime <= now() AND g.end_datetime > now()
$$;
GRANT EXECUTE ON FUNCTION public.my_releasable_driver_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_release_driver_schedule(_driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_manage_driver_schedule(_driver_id)
      OR _driver_id = public.my_driver_id()
      OR ((public.has_role(auth.uid(), 'assistant') OR public.has_role(auth.uid(), 'administrator'))
          AND _driver_id IN (SELECT public.my_releasable_driver_ids()))
$$;