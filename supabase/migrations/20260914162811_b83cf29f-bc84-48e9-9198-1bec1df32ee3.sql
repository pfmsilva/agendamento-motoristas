DO $$
DECLARE d uuid;
BEGIN
  SELECT id INTO d FROM public.analytics_dashboards WHERE is_default ORDER BY created_at LIMIT 1;
  IF d IS NULL THEN RETURN; END IF;

  UPDATE public.analytics_widgets
     SET metric_key = 'driver_detail', visualization = 'table', title = 'Detalhe por motorista',
         grid_w = 12, grid_h = 5, sort_order = 20
   WHERE dashboard_id = d AND title = 'Detalhe por motorista';

  INSERT INTO public.analytics_widgets
    (dashboard_id, title, metric_key, visualization, dimension_key, follows_global_filters, filters, config, grid_x, grid_y, grid_w, grid_h, sort_order)
  SELECT d, v.title, v.metric_key, v.visualization, v.dimension_key, true, '{}'::jsonb, v.config::jsonb, 0, v.sort_order, v.grid_w, v.grid_h, v.sort_order
  FROM (VALUES
    ('Ocupação por motorista', 'driver_occupancy', 'bar', 'driver', '{}', 12, 4, 10),
    ('Evolução da ocupação', 'occupancy_evolution', 'line', 'time', '{}', 12, 4, 11),
    ('Serviços por motorista e TAG', 'services_by_tag', 'stacked_hbar', 'driver', '{"viz":"stacked_hbar","axis":"driver","legend":"tag","values":[{"measure":"service_count","agg":"count"}],"sort":{"by":"measure","direction":"desc"}}', 12, 4, 12),
    ('Serviço, deslocação e ajustes', 'time_breakdown', 'stacked_hbar', 'driver', '{}', 12, 5, 13),
    ('Duração média por motorista e TAG', 'avg_duration_by_tag', 'stacked_bar', 'driver', '{}', 12, 4, 14),
    ('Deslocação calculada vs. ajustada', 'travel_accuracy', 'table', 'city', '{}', 12, 4, 15),
    ('Disponibilidade ao longo do dia', 'driver_availability', 'area', 'time', '{}', 12, 4, 16)
  ) AS v(title, metric_key, visualization, dimension_key, config, grid_w, grid_h, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.analytics_widgets w WHERE w.dashboard_id = d AND w.metric_key = v.metric_key
  );
END $$;