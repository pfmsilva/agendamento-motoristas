ALTER TABLE public.loan_vehicle_events
ADD COLUMN permanent boolean NOT NULL DEFAULT false;

ALTER TABLE public.loan_vehicle_events
ADD CONSTRAINT loan_vehicle_events_permanent_kind_chk
CHECK (NOT permanent OR kind = 'allocation');

COMMENT ON COLUMN public.loan_vehicle_events.permanent IS
'Alocação contínua sem fim operacional; end_datetime mantém um limite técnico distante enquanto permanent=true.';

CREATE OR REPLACE FUNCTION public.loan_events_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE c record;
BEGIN
  IF new.cancelled THEN RETURN new; END IF;

  IF new.permanent AND new.kind <> 'allocation' THEN
    RAISE EXCEPTION 'Apenas uma alocação pode ser permanente.';
  END IF;

  SELECT e.kind, e.start_datetime, e.end_datetime, e.permanent, e.person_name INTO c
  FROM public.loan_vehicle_events e
  WHERE e.vehicle_id = new.vehicle_id
    AND e.id <> new.id
    AND NOT e.cancelled
    AND e.start_datetime < new.end_datetime
    AND e.end_datetime > new.start_datetime
    AND NOT (
      (new.kind = 'inspection' AND e.kind = 'allocation' AND e.permanent)
      OR (new.kind = 'allocation' AND new.permanent AND e.kind = 'inspection')
    )
  ORDER BY e.start_datetime
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Esta viatura já se encontra indisponível durante parte do período selecionado. Conflito: % de % a %',
      CASE
        WHEN c.kind = 'inspection' THEN 'Inspeção'
        WHEN c.permanent THEN 'Alocação permanente'
        ELSE 'Alocação'
      END,
      to_char(c.start_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI'),
      CASE
        WHEN c.permanent THEN 'sem data de fim'
        ELSE to_char(c.end_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI')
      END;
  END IF;
  RETURN new;
END; $$;