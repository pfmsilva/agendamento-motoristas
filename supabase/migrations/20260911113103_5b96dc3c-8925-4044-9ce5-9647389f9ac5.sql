DROP POLICY IF EXISTS "activities driver adjust" ON public.activities;
CREATE POLICY "activities driver adjust" ON public.activities
FOR UPDATE TO authenticated
USING (driver_id = public.my_driver_id() AND public.my_driver_can_create_events())
WITH CHECK (driver_id = public.my_driver_id() AND public.my_driver_can_create_events());

CREATE OR REPLACE FUNCTION public.activities_driver_adjust_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('app.system_reassign', true), '') = 'on' THEN
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
    ELSIF public.can_manage_driver_schedule(new.driver_id) THEN
      new.adjustment_source := 'gestor';
    ELSE
      new.adjustment_source := 'motorista';
    END IF;

    PERFORM public.audit('activity_occupation_adjusted', 'activity', new.id,
      jsonb_build_object('driver_adjusted_start', old.driver_adjusted_start, 'driver_adjusted_end', old.driver_adjusted_end, 'adjustment_source', old.adjustment_source),
      jsonb_build_object('driver_adjusted_start', new.driver_adjusted_start, 'driver_adjusted_end', new.driver_adjusted_end, 'adjustment_source', new.adjustment_source));
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
     OR new.origin IS DISTINCT FROM old.origin
     OR new.destination IS DISTINCT FROM old.destination
     OR new.passenger IS DISTINCT FROM old.passenger
     OR new.status IS DISTINCT FROM old.status
     OR new.notes IS DISTINCT FROM old.notes THEN
    RAISE EXCEPTION 'O motorista só pode ajustar o seu período de ocupação';
  END IF;

  RETURN new;
END;
$$;