ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS color_index smallint;

UPDATE public.drivers d
SET color_index = s.idx
FROM (
  SELECT id, ((row_number() OVER (ORDER BY created_at, id) - 1) % 12)::smallint AS idx
  FROM public.drivers
) s
WHERE s.id = d.id AND d.color_index IS NULL;