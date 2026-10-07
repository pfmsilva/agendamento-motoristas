ALTER TABLE public.loan_vehicle_event_types
ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX loan_vehicle_event_types_id_key ON public.loan_vehicle_event_types (id);
ALTER TABLE public.loan_vehicle_event_types
ADD COLUMN allows_overlap_with_permanent boolean NOT NULL DEFAULT true;

UPDATE public.loan_vehicle_event_types
SET allows_overlap_with_permanent = true
WHERE key IN ('allocation', 'inspection');

CREATE OR REPLACE FUNCTION public.loan_events_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE c record;
DECLARE new_allows_overlap boolean;
BEGIN
  IF new.cancelled THEN RETURN new; END IF;

  SELECT allows_overlap_with_permanent INTO new_allows_overlap
  FROM public.loan_vehicle_event_types
  WHERE key = new.kind;

  SELECT e.kind, e.kind_label_snapshot, e.start_datetime, e.end_datetime, e.permanent, e.person_name INTO c
  FROM public.loan_vehicle_events e
  LEFT JOIN public.loan_vehicle_event_types existing_type ON existing_type.key = e.kind
  WHERE e.vehicle_id = new.vehicle_id
    AND e.id <> new.id
    AND NOT e.cancelled
    AND e.start_datetime < new.end_datetime
    AND e.end_datetime > new.start_datetime
    AND NOT (
      (new.permanent AND NOT e.permanent AND coalesce(existing_type.allows_overlap_with_permanent, true))
      OR (e.permanent AND NOT new.permanent AND coalesce(new_allows_overlap, true))
      OR (
        NOT e.permanent
        AND coalesce(new_allows_overlap, true)
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

COMMENT ON COLUMN public.loan_vehicle_event_types.allows_overlap_with_permanent IS 'Permite este tipo temporário dentro de um registo permanente, recortando-o apenas na apresentação.';