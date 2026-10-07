-- Tipos de evento configuráveis pelo Proprietário, mantidos separados das TAGs.
ALTER TABLE public.event_kind_tags
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_core boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;

UPDATE public.event_kind_tags SET is_core = true, sort_order = CASE kind
    WHEN 'administration' THEN 1 WHEN 'absence' THEN 2 WHEN 'garage' THEN 3 ELSE 100 END
 WHERE kind IN ('administration', 'absence', 'garage');

-- A chave do tipo fica gravada em cada novo evento; o histórico mantém o valor
-- anterior (event_kind) e nunca é reescrito.
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS event_kind_key text;
ALTER TABLE public.activity_series ADD COLUMN IF NOT EXISTS event_kind_key text;

CREATE OR REPLACE FUNCTION public.event_kinds_protect_core()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF old.is_core THEN
      RAISE EXCEPTION 'Os tipos de evento base não podem ser eliminados.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.activities WHERE event_kind_key = old.kind) THEN
      RAISE EXCEPTION 'Este tipo de evento já foi usado em serviços e só pode ser desativado.';
    END IF;
    RETURN old;
  END IF;

  IF TG_OP = 'INSERT' THEN
    new.kind := trim(both '_' from regexp_replace(lower(trim(coalesce(new.kind, ''))), '[^a-z0-9]+', '_', 'g'));
    IF new.kind = '' THEN
      RAISE EXCEPTION 'Indique um nome para o tipo de evento.';
    END IF;
    new.is_core := false;
    RETURN new;
  END IF;

  IF old.is_core THEN
    IF new.label IS DISTINCT FROM old.label THEN
      RAISE EXCEPTION 'Os tipos de evento base não podem ser renomeados.';
    END IF;
    IF NOT new.active THEN
      RAISE EXCEPTION 'Os tipos de evento base não podem ser desativados.';
    END IF;
    new.is_core := true;
  END IF;
  new.kind := old.kind;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS t_event_kinds_protect_core ON public.event_kind_tags;
CREATE TRIGGER t_event_kinds_protect_core
  BEFORE INSERT OR UPDATE OR DELETE ON public.event_kind_tags
  FOR EACH ROW EXECUTE FUNCTION public.event_kinds_protect_core();

-- O tipo configurado determina o comportamento: 'garage' mantém-se especial,
-- os restantes (incluindo tipos novos) comportam-se como Administração.
CREATE OR REPLACE FUNCTION public.activities_kind_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF new.event_kind_key IS NULL THEN
    new.event_kind_key := new.event_kind::text;
  ELSIF NOT EXISTS (SELECT 1 FROM public.event_kind_tags WHERE kind = new.event_kind_key) THEN
    RAISE EXCEPTION 'Tipo de evento desconhecido: %', new.event_kind_key;
  END IF;
  new.event_kind := CASE WHEN new.event_kind_key = 'garage' THEN 'garage'::event_kind
                         ELSE 'administration'::event_kind END;

  IF new.event_kind = 'garage' THEN
    IF new.driver_id IS NULL THEN
      RAISE EXCEPTION 'Um evento de garagem tem de ter motorista';
    END IF;
    new.administrator_id := NULL;
    new.assistant_id := NULL;
    new.series_id := NULL;
    new.series_index := NULL;
    new.assignment_status := 'manual';
  END IF;
  IF new.end_datetime <= new.start_datetime THEN
    RAISE EXCEPTION 'O fim tem de ser posterior ao início';
  END IF;
  RETURN new;
END; $$;

CREATE OR REPLACE FUNCTION public.activities_tag_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tag public.event_tags%ROWTYPE;
BEGIN
  IF new.tag_id IS NULL THEN
    SELECT t.* INTO v_tag
      FROM public.event_kind_tags k
      JOIN public.event_tags t ON t.id = k.tag_id
     WHERE k.kind = coalesce(new.event_kind_key, new.event_kind::text);
    IF v_tag.id IS NULL THEN
      SELECT * INTO v_tag FROM public.event_tags
       WHERE system_key = CASE WHEN new.event_kind = 'garage' THEN 'garage' ELSE 'admin' END;
    END IF;
    new.tag_id := v_tag.id;
  ELSE
    SELECT * INTO v_tag FROM public.event_tags WHERE id = new.tag_id;
  END IF;

  IF v_tag.id IS NULL THEN
    RAISE EXCEPTION 'Este tipo de evento ainda não tem uma TAG associada. Configure a associação no backoffice antes de guardar o serviço.';
  END IF;
  RETURN new;
END; $$;

-- Sobrecargas que transportam a chave do tipo de evento escolhido.
CREATE OR REPLACE FUNCTION public.create_service_auto(
  _administrator_id uuid, _title text, _type activity_type, _city_id uuid,
  _start timestamptz, _end timestamptz, _notes text, _origin_city_id uuid,
  _tag_id uuid, _round_trip boolean, _event_kind_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := public.create_service_auto(_administrator_id, _title, _type, _city_id, _start, _end,
                                     _notes, _origin_city_id, _tag_id, _round_trip);
  IF _event_kind_key IS NOT NULL THEN
    UPDATE public.activities SET event_kind_key = _event_kind_key WHERE id = v_id;
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_service_auto(
  _id uuid, _title text, _type activity_type, _city_id uuid, _start timestamptz, _end timestamptz,
  _notes text, _expected_updated_at timestamptz, _origin_city_id uuid, _tag_id uuid,
  _round_trip boolean, _event_kind_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.update_service_auto(_id, _title, _type, _city_id, _start, _end, _notes,
                                     _expected_updated_at, _origin_city_id, _tag_id, _round_trip);
  IF _event_kind_key IS NOT NULL THEN
    UPDATE public.activities SET event_kind_key = _event_kind_key WHERE id = _id;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.create_service_series(
  _administrator_id uuid, _title text, _type activity_type, _city_id uuid,
  _start timestamptz, _end timestamptz, _notes text, _freq recurrence_freq, _until date,
  _origin_city_id uuid, _tag_id uuid, _round_trip boolean, _event_kind_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := public.create_service_series(_administrator_id, _title, _type, _city_id, _start, _end,
                                       _notes, _freq, _until, _origin_city_id, _tag_id, _round_trip);
  IF _event_kind_key IS NOT NULL THEN
    UPDATE public.activity_series SET event_kind_key = _event_kind_key WHERE id = v_id;
    UPDATE public.activities SET event_kind_key = _event_kind_key WHERE series_id = v_id;
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_service_series(
  _id uuid, _scope text, _title text, _type activity_type, _city_id uuid,
  _start_time time, _duration_minutes integer, _notes text, _origin_city_id uuid,
  _tag_id uuid, _round_trip boolean, _event_kind_key text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  v_count := public.update_service_series(_id, _scope, _title, _type, _city_id, _start_time,
                                          _duration_minutes, _notes, _origin_city_id, _tag_id, _round_trip);
  IF _event_kind_key IS NOT NULL THEN
    UPDATE public.activity_series SET event_kind_key = _event_kind_key WHERE id = _id;
  END IF;
  RETURN v_count;
END; $$;

GRANT EXECUTE ON FUNCTION public.create_service_auto(uuid, text, activity_type, uuid, timestamptz, timestamptz, text, uuid, uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_service_auto(uuid, text, activity_type, uuid, timestamptz, timestamptz, text, timestamptz, uuid, uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_service_series(uuid, text, activity_type, uuid, timestamptz, timestamptz, text, recurrence_freq, date, uuid, uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_service_series(uuid, text, text, activity_type, uuid, time, integer, text, uuid, uuid, boolean, text) TO authenticated;