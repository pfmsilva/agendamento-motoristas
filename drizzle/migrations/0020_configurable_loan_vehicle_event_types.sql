CREATE TABLE public.loan_vehicle_event_types (
  key text PRIMARY KEY,
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  color_key text NOT NULL DEFAULT 'blue' CHECK (color_key IN ('blue', 'teal', 'green', 'amber', 'red', 'neutral')),
  pattern text NOT NULL DEFAULT 'solid' CHECK (pattern IN ('solid', 'dashed')),
  requires_person boolean NOT NULL DEFAULT false,
  allows_permanent boolean NOT NULL DEFAULT false,
  default_start_time time NOT NULL DEFAULT '09:00',
  default_end_time time NOT NULL DEFAULT '18:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_vehicle_event_types TO authenticated;
GRANT ALL ON public.loan_vehicle_event_types TO service_role;
ALTER TABLE public.loan_vehicle_event_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loan_vehicle_event_types_select" ON public.loan_vehicle_event_types FOR SELECT TO authenticated USING (public.is_admin_view());
CREATE POLICY "loan_vehicle_event_types_insert" ON public.loan_vehicle_event_types FOR INSERT TO authenticated WITH CHECK (public.is_owner());
CREATE POLICY "loan_vehicle_event_types_update" ON public.loan_vehicle_event_types FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY "loan_vehicle_event_types_delete" ON public.loan_vehicle_event_types FOR DELETE TO authenticated USING (public.is_owner());

ALTER TABLE public.loan_vehicle_events ADD COLUMN kind_label_snapshot text;
ALTER TABLE public.loan_vehicle_events ADD COLUMN kind_color_snapshot text;
ALTER TABLE public.loan_vehicle_events ADD COLUMN kind_pattern_snapshot text;

INSERT INTO public.loan_vehicle_event_types (key, label, active, sort_order, color_key, pattern, requires_person, allows_permanent, default_start_time, default_end_time)
SELECT DISTINCT e.kind,
  CASE WHEN e.kind = 'inspection' THEN 'Inspeção' WHEN e.kind = 'allocation' THEN 'Alocação' ELSE initcap(e.kind) END,
  true,
  CASE WHEN e.kind = 'allocation' THEN 10 WHEN e.kind = 'inspection' THEN 20 ELSE 100 END,
  'blue',
  CASE WHEN e.kind = 'inspection' THEN 'dashed' ELSE 'solid' END,
  e.kind = 'allocation',
  e.kind = 'allocation',
  CASE WHEN e.kind = 'inspection' THEN '10:00'::time ELSE '09:00'::time END,
  CASE WHEN e.kind = 'inspection' THEN '12:00'::time ELSE '18:00'::time END
FROM public.loan_vehicle_events e
ON CONFLICT (key) DO NOTHING;

UPDATE public.loan_vehicle_events e
SET kind_label_snapshot = t.label,
    kind_color_snapshot = t.color_key,
    kind_pattern_snapshot = t.pattern
FROM public.loan_vehicle_event_types t
WHERE t.key = e.kind
  AND (e.kind_label_snapshot IS NULL OR e.kind_color_snapshot IS NULL OR e.kind_pattern_snapshot IS NULL);

ALTER TABLE public.loan_vehicle_events DROP CONSTRAINT loan_vehicle_events_kind_chk;
ALTER TABLE public.loan_vehicle_events DROP CONSTRAINT loan_vehicle_events_person_chk;
ALTER TABLE public.loan_vehicle_events DROP CONSTRAINT loan_vehicle_events_permanent_kind_chk;

CREATE OR REPLACE FUNCTION public.loan_vehicle_event_config_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE cfg public.loan_vehicle_event_types%ROWTYPE;
BEGIN
  SELECT * INTO cfg FROM public.loan_vehicle_event_types WHERE key = new.kind;
  IF NOT FOUND THEN
    IF tg_op = 'UPDATE' AND new.kind = old.kind AND new.kind_label_snapshot IS NOT NULL THEN
      RETURN new;
    END IF;
    RAISE EXCEPTION 'O tipo de evento selecionado já não está disponível.';
  END IF;
  IF NOT cfg.active AND (tg_op = 'INSERT' OR new.kind IS DISTINCT FROM old.kind) THEN
    RAISE EXCEPTION 'O tipo de evento selecionado está inativo.';
  END IF;
  IF cfg.requires_person AND coalesce(btrim(new.person_name), '') = '' THEN
    RAISE EXCEPTION 'Este tipo de evento exige a indicação de uma pessoa.';
  END IF;
  IF new.permanent AND NOT cfg.allows_permanent THEN
    RAISE EXCEPTION 'Este tipo de evento não permite registos permanentes.';
  END IF;
  new.kind_label_snapshot := cfg.label;
  new.kind_color_snapshot := cfg.color_key;
  new.kind_pattern_snapshot := cfg.pattern;
  RETURN new;
END;
$function$;

CREATE TRIGGER loan_vehicle_event_config_guard
BEFORE INSERT OR UPDATE ON public.loan_vehicle_events
FOR EACH ROW EXECUTE FUNCTION public.loan_vehicle_event_config_guard();

CREATE OR REPLACE FUNCTION public.loan_events_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE c record;
BEGIN
  IF new.cancelled THEN RETURN new; END IF;
  SELECT e.kind, e.kind_label_snapshot, e.start_datetime, e.end_datetime, e.permanent, e.person_name INTO c
  FROM public.loan_vehicle_events e
  WHERE e.vehicle_id = new.vehicle_id
    AND e.id <> new.id
    AND NOT e.cancelled
    AND e.start_datetime < new.end_datetime
    AND e.end_datetime > new.start_datetime
    AND NOT (
      (new.permanent AND NOT e.permanent)
      OR (e.permanent AND NOT new.permanent)
      OR (
        NOT e.permanent
        AND EXISTS (
          SELECT 1 FROM public.loan_vehicle_events previous
          WHERE previous.id = new.id AND previous.permanent
        )
      )
    )
  ORDER BY e.start_datetime
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Esta viatura já se encontra indisponível durante parte do período selecionado. Conflito: % de % a %',
      coalesce(c.kind_label_snapshot, c.kind),
      to_char(c.start_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI'),
      CASE WHEN c.permanent THEN 'sem data de fim' ELSE to_char(c.end_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') END;
  END IF;
  RETURN new;
END;
$function$;

CREATE TRIGGER loan_vehicle_event_types_touch BEFORE UPDATE ON public.loan_vehicle_event_types
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER loan_vehicle_event_types_audit AFTER INSERT OR UPDATE OR DELETE ON public.loan_vehicle_event_types
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes('loan_vehicle_event_type');

COMMENT ON TABLE public.loan_vehicle_event_types IS 'Tipos configuráveis dos eventos de viaturas de empréstimo.';
COMMENT ON COLUMN public.loan_vehicle_events.kind_label_snapshot IS 'Nome histórico do tipo no momento da gravação.';
COMMENT ON COLUMN public.loan_vehicle_events.kind_color_snapshot IS 'Cor histórica do tipo no momento da gravação.';
COMMENT ON COLUMN public.loan_vehicle_events.kind_pattern_snapshot IS 'Padrão histórico do tipo no momento da gravação.';