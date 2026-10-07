CREATE TABLE public.event_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  system_key text UNIQUE,
  is_core boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_tags_label_nonempty CHECK (btrim(label) <> ''),
  CONSTRAINT event_tags_system_key_valid CHECK (
    (is_core AND system_key IN ('admin', 'garage', 'vacation'))
    OR (NOT is_core AND system_key IS NULL)
  )
);

GRANT SELECT ON public.event_tags TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.event_tags TO authenticated;
GRANT ALL ON public.event_tags TO service_role;

ALTER TABLE public.event_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view event tags"
ON public.event_tags FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Owners can create event tags"
ON public.event_tags FOR INSERT TO authenticated
WITH CHECK (public.is_owner() AND NOT is_core AND system_key IS NULL);

CREATE POLICY "Owners can update event tags"
ON public.event_tags FOR UPDATE TO authenticated
USING (public.is_owner())
WITH CHECK (public.is_owner());

CREATE POLICY "Owners can delete custom unused event tags"
ON public.event_tags FOR DELETE TO authenticated
USING (public.is_owner() AND NOT is_core);

CREATE TRIGGER event_tags_touch_updated_at
BEFORE UPDATE ON public.event_tags
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER event_tags_audit
AFTER INSERT OR UPDATE OR DELETE ON public.event_tags
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes('event_tag');

INSERT INTO public.event_tags (label, system_key, is_core, active, sort_order)
VALUES
  ('Admin', 'admin', true, true, 1),
  ('Garagem', 'garage', true, true, 2),
  ('Férias', 'vacation', true, true, 3);

ALTER TABLE public.activities
ADD COLUMN tag_id uuid REFERENCES public.event_tags(id);

ALTER TABLE public.activity_series
ADD COLUMN tag_id uuid REFERENCES public.event_tags(id);

ALTER TABLE public.time_off
ADD COLUMN tag_id uuid REFERENCES public.event_tags(id);

SELECT set_config('app.system_reassign', 'on', false);

UPDATE public.activities a
SET tag_id = t.id
FROM public.event_tags t
WHERE t.system_key = CASE WHEN a.event_kind = 'garage' THEN 'garage' ELSE 'admin' END;

UPDATE public.activity_series s
SET tag_id = t.id
FROM public.event_tags t
WHERE t.system_key = 'admin';

UPDATE public.time_off o
SET tag_id = t.id
FROM public.event_tags t
WHERE t.system_key = 'vacation' AND o.type = 'holiday';

SELECT set_config('app.system_reassign', 'off', false);

CREATE OR REPLACE FUNCTION public.event_tags_protect_core()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF old.is_core THEN
      RAISE EXCEPTION 'As TAGs base não podem ser eliminadas.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.activities WHERE tag_id = old.id)
       OR EXISTS (SELECT 1 FROM public.activity_series WHERE tag_id = old.id)
       OR EXISTS (SELECT 1 FROM public.time_off WHERE tag_id = old.id) THEN
      RAISE EXCEPTION 'Esta TAG está associada ao histórico e não pode ser eliminada. Desative-a.';
    END IF;
    RETURN old;
  END IF;

  IF old.is_core AND (
    new.label IS DISTINCT FROM old.label
    OR new.system_key IS DISTINCT FROM old.system_key
    OR new.is_core IS DISTINCT FROM old.is_core
  ) THEN
    RAISE EXCEPTION 'As TAGs base não podem ser renomeadas nem convertidas.';
  END IF;

  IF NOT old.is_core AND (new.is_core OR new.system_key IS NOT NULL) THEN
    RAISE EXCEPTION 'Uma TAG personalizada não pode ser convertida em TAG base.';
  END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER event_tags_protect_core_trigger
BEFORE UPDATE OR DELETE ON public.event_tags
FOR EACH ROW EXECUTE FUNCTION public.event_tags_protect_core();

CREATE OR REPLACE FUNCTION public.activities_tag_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag public.event_tags%ROWTYPE;
BEGIN
  IF new.tag_id IS NULL THEN
    SELECT * INTO v_tag FROM public.event_tags
    WHERE system_key = CASE WHEN new.event_kind = 'garage' THEN 'garage' ELSE 'admin' END;
    new.tag_id := v_tag.id;
  ELSE
    SELECT * INTO v_tag FROM public.event_tags WHERE id = new.tag_id;
  END IF;

  IF v_tag.id IS NULL THEN RAISE EXCEPTION 'Selecione uma TAG válida.'; END IF;
  IF TG_OP = 'INSERT' OR new.tag_id IS DISTINCT FROM old.tag_id THEN
    IF NOT v_tag.active THEN RAISE EXCEPTION 'A TAG selecionada está inativa.'; END IF;
  END IF;
  IF new.event_kind = 'garage' AND v_tag.system_key <> 'garage' THEN
    RAISE EXCEPTION 'Os eventos de Garagem têm de usar a TAG Garagem.';
  END IF;
  IF new.event_kind = 'administration' AND v_tag.system_key IN ('garage', 'vacation') THEN
    RAISE EXCEPTION 'Selecione uma TAG de serviço válida.';
  END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER activities_tag_guard_trigger
BEFORE INSERT OR UPDATE OF tag_id, event_kind ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.activities_tag_guard();

CREATE OR REPLACE FUNCTION public.activity_series_tag_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tag public.event_tags%ROWTYPE;
BEGIN
  IF new.tag_id IS NULL THEN
    SELECT * INTO v_tag FROM public.event_tags WHERE system_key = 'admin';
    new.tag_id := v_tag.id;
  ELSE
    SELECT * INTO v_tag FROM public.event_tags WHERE id = new.tag_id;
  END IF;
  IF v_tag.id IS NULL OR v_tag.system_key IN ('garage', 'vacation') THEN
    RAISE EXCEPTION 'Selecione uma TAG de serviço válida.';
  END IF;
  IF (TG_OP = 'INSERT' OR new.tag_id IS DISTINCT FROM old.tag_id) AND NOT v_tag.active THEN
    RAISE EXCEPTION 'A TAG selecionada está inativa.';
  END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER activity_series_tag_guard_trigger
BEFORE INSERT OR UPDATE OF tag_id ON public.activity_series
FOR EACH ROW EXECUTE FUNCTION public.activity_series_tag_guard();

CREATE OR REPLACE FUNCTION public.time_off_tag_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tag public.event_tags%ROWTYPE;
BEGIN
  IF new.type = 'holiday' THEN
    IF new.tag_id IS NULL THEN
      SELECT * INTO v_tag FROM public.event_tags WHERE system_key = 'vacation';
      new.tag_id := v_tag.id;
    ELSE
      SELECT * INTO v_tag FROM public.event_tags WHERE id = new.tag_id;
    END IF;
    IF v_tag.id IS NULL OR v_tag.system_key <> 'vacation' THEN
      RAISE EXCEPTION 'As férias têm de usar a TAG Férias.';
    END IF;
    IF TG_OP = 'INSERT' AND NOT v_tag.active THEN
      RAISE EXCEPTION 'A TAG Férias está inativa.';
    END IF;
  ELSE
    new.tag_id := NULL;
  END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER time_off_tag_guard_trigger
BEFORE INSERT OR UPDATE OF tag_id, type ON public.time_off
FOR EACH ROW EXECUTE FUNCTION public.time_off_tag_guard();

CREATE OR REPLACE FUNCTION public.set_activity_tag(_activity_id uuid, _tag_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE a public.activities%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = _activity_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe.'; END IF;
  IF NOT (
    public.can_edit_activities()
    OR public.serves_administrator(a.administrator_id)
    OR (a.driver_id = public.my_driver_id() AND public.my_driver_can_create_events())
  ) THEN
    RAISE EXCEPTION 'Não tem permissão para alterar este serviço.';
  END IF;
  UPDATE public.activities SET tag_id = _tag_id, updated_by = auth.uid() WHERE id = _activity_id;
  IF a.series_id IS NOT NULL THEN
    UPDATE public.activity_series SET tag_id = _tag_id WHERE id = a.series_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_activity_tag(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_activity_tag(uuid, uuid) TO authenticated;