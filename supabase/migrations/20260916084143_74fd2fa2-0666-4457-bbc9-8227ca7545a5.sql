-- 1. Remove Driver F completely
DO $$
DECLARE d uuid := '679cd649-ece2-4eab-9d6d-40ff9743c061';
BEGIN
  UPDATE public.activities SET original_driver_id = NULL WHERE original_driver_id = d;
  DELETE FROM public.activity_confidential_content WHERE activity_id IN (SELECT id FROM public.activities WHERE driver_id = d);
  DELETE FROM public.activity_private_notes WHERE activity_id IN (SELECT id FROM public.activities WHERE driver_id = d);
  DELETE FROM public.activity_change_validations WHERE driver_id = d OR activity_id IN (SELECT id FROM public.activities WHERE driver_id = d);
  DELETE FROM public.activities WHERE driver_id = d;
  DELETE FROM public.administrator_driver_priorities WHERE driver_id = d;
  DELETE FROM public.assistant_driver_assignments WHERE driver_id = d;
  DELETE FROM public.assistant_delegations WHERE driver_id = d;
  DELETE FROM public.time_off WHERE driver_id = d;
  DELETE FROM public.unavailability WHERE driver_id = d;
  DELETE FROM public.audit_log WHERE entity_id = d;
  DELETE FROM public.drivers WHERE id = d;
END $$;

-- 2. Drop passenger from functions, then from the table
CREATE OR REPLACE FUNCTION public.validation_field_label(_field text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE _field
    WHEN 'title' THEN 'Título'
    WHEN 'type' THEN 'Tipo'
    WHEN 'notes' THEN 'Notas'
    WHEN 'start_datetime' THEN 'Início do serviço'
    WHEN 'end_datetime' THEN 'Fim do serviço'
    WHEN 'city_id' THEN 'Destino'
    WHEN 'origin_city_id' THEN 'Origem'
    WHEN 'status' THEN 'Estado'
    WHEN 'round_trip' THEN 'Ida e volta'
    WHEN 'tag_id' THEN 'TAG'
    WHEN 'driver_adjusted_start' THEN 'Início da ocupação'
    WHEN 'driver_adjusted_end' THEN 'Fim da ocupação'
    WHEN 'adjustment_reason_id' THEN 'Motivo do ajuste'
    ELSE _field
  END
$function$;
