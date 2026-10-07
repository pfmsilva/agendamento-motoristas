SET LOCAL app.system_reassign = 'on';

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS adjusted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS adjusted_at timestamptz;

CREATE OR REPLACE FUNCTION public.activities_driver_adjust_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE reason_label text;
BEGIN
  IF coalesce(current_setting('app.system_reassign', true), '') = 'on'
     OR coalesce(current_setting('app.validation_restore', true), '') = 'on' THEN
    RETURN new;
  END IF;

  IF new.driver_adjusted_start IS DISTINCT FROM old.driver_adjusted_start
     OR new.driver_adjusted_end IS DISTINCT FROM old.driver_adjusted_end THEN
    IF NOT public.can_manage_driver_schedule(new.driver_id)
       AND NOT public.my_driver_can_create_events() THEN
      RAISE EXCEPTION 'Não tem permissão para alterar eventos.';
    END IF;
    IF new.driver_adjusted_start IS NULL AND new.driver_adjusted_end IS NULL THEN
      new.adjustment_source := NULL;
      new.adjustment_reason_id := NULL;
      new.adjusted_by := NULL;
      new.adjusted_at := NULL;
    ELSE
      SELECT label INTO reason_label FROM public.travel_adjust_reasons
       WHERE id = new.adjustment_reason_id AND active;
      IF reason_label IS NULL THEN
        RAISE EXCEPTION 'Selecione o motivo do ajuste da deslocação.';
      END IF;
      IF public.can_manage_driver_schedule(new.driver_id) THEN
        new.adjustment_source := 'gestor';
      ELSE
        new.adjustment_source := 'motorista';
      END IF;
      new.adjusted_by := auth.uid();
      new.adjusted_at := now();
    END IF;

    PERFORM public.audit('activity_occupation_adjusted', 'activity', new.id,
      jsonb_build_object('driver_adjusted_start', old.driver_adjusted_start,
                         'driver_adjusted_end', old.driver_adjusted_end,
                         'adjustment_source', old.adjustment_source,
                         'adjustment_reason_id', old.adjustment_reason_id,
                         'adjustment_reason', (SELECT label FROM public.travel_adjust_reasons WHERE id = old.adjustment_reason_id)),
      jsonb_build_object('driver_adjusted_start', new.driver_adjusted_start,
                         'driver_adjusted_end', new.driver_adjusted_end,
                         'adjustment_source', new.adjustment_source,
                         'adjustment_reason_id', new.adjustment_reason_id,
                         'adjustment_reason', reason_label));
  ELSIF new.adjustment_reason_id IS DISTINCT FROM old.adjustment_reason_id
        AND (new.driver_adjusted_start IS NOT NULL OR new.driver_adjusted_end IS NOT NULL) THEN
    IF NOT public.can_manage_driver_schedule(new.driver_id)
       AND NOT public.my_driver_can_create_events() THEN
      RAISE EXCEPTION 'Não tem permissão para alterar eventos.';
    END IF;
    new.adjusted_by := auth.uid();
    new.adjusted_at := now();
  END IF;

  IF public.can_manage_driver_schedule(new.driver_id) THEN
    RETURN new;
  END IF;

  IF NOT public.my_driver_can_create_events() THEN
    RAISE EXCEPTION 'Não tem permissão para alterar eventos.';
  END IF;

  IF new.driver_id <> old.driver_id OR new.driver_id IS DISTINCT FROM public.my_driver_id() THEN
    RAISE EXCEPTION 'Não tem permissão para alterar esta atividade';
  END IF;

  IF new.title IS DISTINCT FROM old.title
     OR new.type IS DISTINCT FROM old.type
     OR new.start_datetime IS DISTINCT FROM old.start_datetime
     OR new.end_datetime IS DISTINCT FROM old.end_datetime
     OR new.city_id IS DISTINCT FROM old.city_id
     OR new.origin_city_id IS DISTINCT FROM old.origin_city_id
     OR new.passenger IS DISTINCT FROM old.passenger
     OR new.status IS DISTINCT FROM old.status
     OR new.notes IS DISTINCT FROM old.notes THEN
    RAISE EXCEPTION 'O motorista só pode ajustar o seu período de ocupação';
  END IF;

  RETURN new;
END; $function$;

UPDATE public.activities a
SET adjusted_by = l.user_id, adjusted_at = l.created_at
FROM (
  SELECT DISTINCT ON (entity_id) entity_id, user_id, created_at
  FROM public.audit_log
  WHERE action = 'activity_occupation_adjusted' AND entity_type = 'activity'
  ORDER BY entity_id, created_at DESC
) l
WHERE l.entity_id = a.id
  AND a.adjusted_at IS NULL
  AND (a.driver_adjusted_start IS NOT NULL OR a.driver_adjusted_end IS NOT NULL);