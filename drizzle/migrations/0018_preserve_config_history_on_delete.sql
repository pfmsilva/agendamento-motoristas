ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS event_kind_label_snapshot text,
  ADD COLUMN IF NOT EXISTS adjustment_reason_label_snapshot text;

ALTER TABLE public.activity_series
  ADD COLUMN IF NOT EXISTS event_kind_label_snapshot text;

ALTER TABLE public.activities DISABLE TRIGGER USER;
UPDATE public.activities a
SET event_kind_label_snapshot = k.label
FROM public.event_kind_tags k
WHERE a.event_kind_key = k.kind
  AND a.event_kind_label_snapshot IS NULL;
UPDATE public.activities a
SET adjustment_reason_label_snapshot = r.label
FROM public.travel_adjust_reasons r
WHERE a.adjustment_reason_id = r.id
  AND a.adjustment_reason_label_snapshot IS NULL;
ALTER TABLE public.activities ENABLE TRIGGER USER;

ALTER TABLE public.activity_series DISABLE TRIGGER USER;
UPDATE public.activity_series s
SET event_kind_label_snapshot = k.label
FROM public.event_kind_tags k
WHERE s.event_kind_key = k.kind
  AND s.event_kind_label_snapshot IS NULL;
ALTER TABLE public.activity_series ENABLE TRIGGER USER;

COMMENT ON COLUMN public.activities.event_kind_label_snapshot IS 'Historical event type label retained when its configuration is deleted.';
COMMENT ON COLUMN public.activity_series.event_kind_label_snapshot IS 'Historical event type label retained when its configuration is deleted.';
COMMENT ON COLUMN public.activities.adjustment_reason_label_snapshot IS 'Historical adjustment reason label retained when its configuration is deleted.';
COMMENT ON COLUMN public.travel_adjust_reasons.is_core IS 'DEPRECATED: retained for compatibility; all adjustment reasons are equally editable and deletable.';

CREATE OR REPLACE FUNCTION public.activities_config_label_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_label text;
BEGIN
  IF new.event_kind_key IS NOT NULL AND (TG_OP = 'INSERT' OR new.event_kind_key IS DISTINCT FROM old.event_kind_key OR new.event_kind_label_snapshot IS NULL) THEN
    SELECT label INTO v_label FROM public.event_kind_tags WHERE kind = new.event_kind_key;
    IF v_label IS NOT NULL THEN new.event_kind_label_snapshot := v_label; END IF;
  END IF;
  IF new.adjustment_reason_id IS NOT NULL AND (TG_OP = 'INSERT' OR new.adjustment_reason_id IS DISTINCT FROM old.adjustment_reason_id OR new.adjustment_reason_label_snapshot IS NULL) THEN
    SELECT label INTO v_label FROM public.travel_adjust_reasons WHERE id = new.adjustment_reason_id;
    IF v_label IS NOT NULL THEN new.adjustment_reason_label_snapshot := v_label; END IF;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS activities_config_label_snapshot_trigger ON public.activities;
CREATE TRIGGER activities_config_label_snapshot_trigger BEFORE INSERT OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.activities_config_label_snapshot();

CREATE OR REPLACE FUNCTION public.activity_series_config_label_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_label text;
BEGIN
  IF new.event_kind_key IS NOT NULL AND (TG_OP = 'INSERT' OR new.event_kind_key IS DISTINCT FROM old.event_kind_key OR new.event_kind_label_snapshot IS NULL) THEN
    SELECT label INTO v_label FROM public.event_kind_tags WHERE kind = new.event_kind_key;
    IF v_label IS NOT NULL THEN new.event_kind_label_snapshot := v_label; END IF;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS activity_series_config_label_snapshot_trigger ON public.activity_series;
CREATE TRIGGER activity_series_config_label_snapshot_trigger BEFORE INSERT OR UPDATE ON public.activity_series FOR EACH ROW EXECUTE FUNCTION public.activity_series_config_label_snapshot();

CREATE OR REPLACE FUNCTION public.event_kinds_protect_core()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RETURN old; END IF;
  IF TG_OP = 'INSERT' THEN
    new.kind := trim(both '_' from regexp_replace(lower(trim(coalesce(new.kind, ''))), '[^a-z0-9]+', '_', 'g'));
    IF new.kind = '' THEN RAISE EXCEPTION 'Indique um nome para o tipo de evento.'; END IF;
    new.is_core := false;
    RETURN new;
  END IF;
  IF old.is_core THEN
    IF new.label IS DISTINCT FROM old.label THEN RAISE EXCEPTION 'Os tipos de evento base não podem ser renomeados.'; END IF;
    IF NOT new.active THEN RAISE EXCEPTION 'Os tipos de evento base não podem ser desativados.'; END IF;
    new.is_core := true;
  END IF;
  new.kind := old.kind;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.travel_reason_core_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN CASE WHEN TG_OP = 'DELETE' THEN old ELSE new END;
END;
$$;

CREATE OR REPLACE FUNCTION public.activities_kind_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF new.event_kind_key IS NULL THEN
    new.event_kind_key := new.event_kind::text;
  ELSIF (TG_OP = 'INSERT' OR new.event_kind_key IS DISTINCT FROM old.event_kind_key)
    AND NOT EXISTS (SELECT 1 FROM public.event_kind_tags WHERE kind = new.event_kind_key) THEN
    RAISE EXCEPTION 'Tipo de evento desconhecido: %', new.event_kind_key;
  END IF;
  new.event_kind := CASE WHEN new.event_kind_key = 'garage' THEN 'garage'::event_kind ELSE 'administration'::event_kind END;
  IF new.event_kind = 'garage' THEN
    IF new.driver_id IS NULL THEN RAISE EXCEPTION 'Um evento de garagem tem de ter motorista'; END IF;
    new.administrator_id := NULL;
    new.assistant_id := NULL;
    new.series_id := NULL;
    new.series_index := NULL;
    new.assignment_status := 'manual';
  END IF;
  IF new.end_datetime <= new.start_datetime THEN RAISE EXCEPTION 'O fim tem de ser posterior ao início'; END IF;
  RETURN new;
END;
$$;

ALTER TABLE public.activities DROP CONSTRAINT activities_adjustment_reason_id_fkey;
ALTER TABLE public.activities ADD CONSTRAINT activities_adjustment_reason_id_fkey FOREIGN KEY (adjustment_reason_id) REFERENCES public.travel_adjust_reasons(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "reasons delete owner custom" ON public.travel_adjust_reasons;
CREATE POLICY "reasons delete owner" ON public.travel_adjust_reasons FOR DELETE TO authenticated USING (public.is_owner());