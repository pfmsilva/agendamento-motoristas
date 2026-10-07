update public.analytics_widgets
set visualization = 'stacked_hbar',
    dimension_key = 'driver',
    config = jsonb_build_object(
      'viz', 'stacked_hbar',
      'axis', 'driver',
      'legend', 'event_kind',
      'rows', 'driver',
      'columns', 'hour',
      'values', jsonb_build_array(jsonb_build_object('measure','occupied_hours','agg','sum')),
      'tooltips', '[]'::jsonb,
      'sort', jsonb_build_object('by','measure','direction','desc'),
      'comparePrevious', false,
      'target', null
    )
where title = 'Horas por motorista' and metric_key = 'occupied_hours';