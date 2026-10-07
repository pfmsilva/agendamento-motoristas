CREATE OR REPLACE FUNCTION public.create_driver_service(
  _administrator_id uuid,
  _title text,
  _type activity_type,
  _start timestamptz,
  _end timestamptz,
  _notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_driver uuid; v_id uuid;
BEGIN
  v_driver := public.my_driver_id();
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Apenas motoristas podem criar eventos na sua agenda';
  END IF;
  IF _administrator_id IS NULL THEN
    RAISE EXCEPTION 'Indique o Administrador a que o serviço pertence';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.administrators WHERE id = _administrator_id AND active) THEN
    RAISE EXCEPTION 'Administrador inválido';
  END IF;
  IF btrim(coalesce(_title, '')) = '' THEN
    RAISE EXCEPTION 'Indique o título do serviço';
  END IF;
  IF _end <= _start THEN
    RAISE EXCEPTION 'O fim tem de ser posterior ao início';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_driver::text));

  INSERT INTO public.activities (title, type, event_kind, driver_id, administrator_id,
                                 start_datetime, end_datetime, notes, status,
                                 assignment_status, assigned_at, override_conflict,
                                 created_by, updated_by)
  VALUES (btrim(_title), coalesce(_type, 'other'), 'administration', v_driver, _administrator_id,
          _start, _end, nullif(btrim(coalesce(_notes, '')), ''), 'confirmed',
          'manual', now(), false, auth.uid(), auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_driver_service(uuid, text, activity_type, timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_driver_service(uuid, text, activity_type, timestamptz, timestamptz, text) TO authenticated;