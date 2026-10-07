UPDATE public.cities
SET name = 'Lisboa EAP', updated_at = now()
WHERE is_base = true
  AND name = 'Lisboa';