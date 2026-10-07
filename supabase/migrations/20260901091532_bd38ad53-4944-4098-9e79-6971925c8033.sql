CREATE OR REPLACE FUNCTION public.can_manage_driver_schedule(_driver_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_manager()
      or public.is_owner()
      or public.assistant_manages_driver(_driver_id)
$function$;