CREATE OR REPLACE FUNCTION public.set_activity_series_tag(_series_id uuid, _tag_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series public.activity_series%ROWTYPE;
  v_tag public.event_tags%ROWTYPE;
BEGIN
  SELECT * INTO v_series FROM public.activity_series WHERE id = _series_id FOR UPDATE;
  IF v_series.id IS NULL THEN RAISE EXCEPTION 'Esta série já não existe.'; END IF;
  IF NOT (public.can_edit_activities() OR public.serves_administrator(v_series.administrator_id)) THEN
    RAISE EXCEPTION 'Não tem permissão para alterar esta série.';
  END IF;
  SELECT * INTO v_tag FROM public.event_tags WHERE id = _tag_id AND active;
  IF v_tag.id IS NULL OR v_tag.system_key IN ('garage', 'vacation') THEN
    RAISE EXCEPTION 'Selecione uma TAG de serviço ativa.';
  END IF;
  UPDATE public.activity_series SET tag_id = _tag_id WHERE id = _series_id;
  UPDATE public.activities
     SET tag_id = _tag_id, updated_by = auth.uid()
   WHERE series_id = _series_id AND status <> 'cancelled';
END;
$$;
REVOKE ALL ON FUNCTION public.set_activity_series_tag(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_activity_series_tag(uuid, uuid) TO authenticated;