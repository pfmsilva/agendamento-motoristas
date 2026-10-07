CREATE TABLE public.event_kind_tags (
  kind text PRIMARY KEY,
  label text NOT NULL,
  tag_id uuid NOT NULL REFERENCES public.event_tags(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.event_kind_tags TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.event_kind_tags TO authenticated;
GRANT ALL ON public.event_kind_tags TO service_role;

ALTER TABLE public.event_kind_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_kind_tags_select" ON public.event_kind_tags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "event_kind_tags_owner_write" ON public.event_kind_tags
  FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

CREATE TRIGGER t_event_kind_tags_touch BEFORE UPDATE ON public.event_kind_tags
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.event_kind_tags (kind, label, tag_id)
SELECT v.kind, v.label, t.id
  FROM (VALUES
    ('administration', 'Administração', 'admin'),
    ('garage', 'Garagem', 'garage'),
    ('absence', 'Ausência / Indisponibilidade', 'vacation')
  ) AS v(kind, label, sys)
  JOIN public.event_tags t ON t.system_key = v.sys
ON CONFLICT (kind) DO NOTHING;

CREATE OR REPLACE FUNCTION public.activities_tag_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tag public.event_tags%ROWTYPE;
BEGIN
  IF new.tag_id IS NULL THEN
    -- A TAG deriva da associação configurada pelo Proprietário para o tipo de evento.
    SELECT t.* INTO v_tag
      FROM public.event_kind_tags k
      JOIN public.event_tags t ON t.id = k.tag_id
     WHERE k.kind = new.event_kind::text;
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
$function$;