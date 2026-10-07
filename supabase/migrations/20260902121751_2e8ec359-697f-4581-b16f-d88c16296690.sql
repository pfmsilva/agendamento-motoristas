UPDATE public.notifications SET title = CASE title
  WHEN 'Activity updated' THEN 'Serviço atualizado'
  WHEN 'New activity assigned' THEN 'Novo serviço atribuído'
  WHEN 'Activity cancelled' THEN 'Serviço cancelado'
  WHEN 'Activity driver changed' THEN 'Serviço com motorista alterado'
  WHEN 'Activity moved to another driver' THEN 'Serviço transferido para outro motorista'
  WHEN 'Holiday requested' THEN 'Ausência registada'
  WHEN 'Holiday approved' THEN 'Ausência aprovada'
  WHEN 'Holiday rejected' THEN 'Ausência rejeitada'
  WHEN 'Holiday cancelled' THEN 'Ausência cancelada'
  WHEN 'Holiday request updated' THEN 'Ausência atualizada'
  ELSE title END
WHERE title IN ('Activity updated','New activity assigned','Activity cancelled','Activity driver changed','Activity moved to another driver','Holiday requested','Holiday approved','Holiday rejected','Holiday cancelled','Holiday request updated');

UPDATE public.notifications SET body = replace(body, ' to ', ' a ') WHERE kind = 'time_off' AND body LIKE '% to %';