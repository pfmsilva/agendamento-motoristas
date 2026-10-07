INSERT INTO public.activities (title, type, driver_id, assistant_id, assignment_status, start_datetime, end_datetime, origin, destination, notes, status, city_id)
SELECT 'Demonstração - serviço por atribuir', 'trip', NULL, a.id, 'pending_manual',
       date_trunc('day', now()) + interval '1 day 9 hours',
       date_trunc('day', now()) + interval '1 day 12 hours',
       'Lisboa', c.name, 'Serviço de demonstração sem motorista disponível.', 'confirmed', c.id
FROM public.assistants a
LEFT JOIN public.cities c ON c.active AND NOT c.is_base
WHERE a.active
  AND NOT EXISTS (SELECT 1 FROM public.activities x WHERE x.title = 'Demonstração - serviço por atribuir')
ORDER BY a.name
LIMIT 1;
