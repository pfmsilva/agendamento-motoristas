-- Módulo autónomo de Viaturas de Empréstimo (independente dos motoristas)
CREATE TABLE public.loan_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate text NOT NULL,
  brand text,
  model text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX loan_vehicles_plate_key ON public.loan_vehicles (upper(plate));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_vehicles TO authenticated;
GRANT ALL ON public.loan_vehicles TO service_role;
ALTER TABLE public.loan_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loan_vehicles_select" ON public.loan_vehicles FOR SELECT TO authenticated USING (public.is_admin_view());
CREATE POLICY "loan_vehicles_insert" ON public.loan_vehicles FOR INSERT TO authenticated WITH CHECK (public.is_admin_view());
CREATE POLICY "loan_vehicles_update" ON public.loan_vehicles FOR UPDATE TO authenticated USING (public.is_admin_view()) WITH CHECK (public.is_admin_view());
CREATE POLICY "loan_vehicles_delete" ON public.loan_vehicles FOR DELETE TO authenticated USING (public.is_admin_view());

CREATE TABLE public.loan_vehicle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.loan_vehicles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'allocation',
  person_name text,
  start_datetime timestamptz NOT NULL,
  end_datetime timestamptz NOT NULL,
  notes text,
  cancelled boolean NOT NULL DEFAULT false,
  cancel_reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loan_vehicle_events_kind_chk CHECK (kind IN ('allocation','inspection')),
  CONSTRAINT loan_vehicle_events_period_chk CHECK (end_datetime > start_datetime),
  CONSTRAINT loan_vehicle_events_person_chk CHECK (kind <> 'allocation' OR coalesce(btrim(person_name),'') <> '')
);
CREATE INDEX loan_vehicle_events_vehicle_idx ON public.loan_vehicle_events (vehicle_id, start_datetime);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_vehicle_events TO authenticated;
GRANT ALL ON public.loan_vehicle_events TO service_role;
ALTER TABLE public.loan_vehicle_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loan_events_select" ON public.loan_vehicle_events FOR SELECT TO authenticated USING (public.is_admin_view());
CREATE POLICY "loan_events_insert" ON public.loan_vehicle_events FOR INSERT TO authenticated WITH CHECK (public.is_admin_view());
CREATE POLICY "loan_events_update" ON public.loan_vehicle_events FOR UPDATE TO authenticated USING (public.is_admin_view()) WITH CHECK (public.is_admin_view());
CREATE POLICY "loan_events_delete" ON public.loan_vehicle_events FOR DELETE TO authenticated USING (public.is_admin_view());

-- Impede sobreposições na mesma viatura (alocações e inspeções)
CREATE OR REPLACE FUNCTION public.loan_events_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE c record;
BEGIN
  IF new.cancelled THEN RETURN new; END IF;
  SELECT e.kind, e.start_datetime, e.end_datetime INTO c
  FROM public.loan_vehicle_events e
  WHERE e.vehicle_id = new.vehicle_id
    AND e.id <> new.id
    AND NOT e.cancelled
    AND e.start_datetime < new.end_datetime
    AND e.end_datetime > new.start_datetime
  ORDER BY e.start_datetime
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Esta viatura já se encontra indisponível durante parte do período selecionado. Conflito: % de % a %',
      CASE WHEN c.kind = 'inspection' THEN 'Inspeção' ELSE 'Alocação' END,
      to_char(c.start_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI'),
      to_char(c.end_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI');
  END IF;
  RETURN new;
END; $$;

CREATE TRIGGER loan_events_no_overlap
BEFORE INSERT OR UPDATE ON public.loan_vehicle_events
FOR EACH ROW EXECUTE FUNCTION public.loan_events_no_overlap();

CREATE TRIGGER loan_vehicles_touch BEFORE UPDATE ON public.loan_vehicles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER loan_events_touch BEFORE UPDATE ON public.loan_vehicle_events
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER loan_vehicles_audit AFTER INSERT OR UPDATE OR DELETE ON public.loan_vehicles
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes('loan_vehicle');
CREATE TRIGGER loan_events_audit AFTER INSERT OR UPDATE OR DELETE ON public.loan_vehicle_events
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes('loan_vehicle_event');