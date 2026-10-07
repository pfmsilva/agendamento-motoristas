ALTER TABLE public.analytics_widgets DROP CONSTRAINT IF EXISTS analytics_widgets_visualization;
ALTER TABLE public.analytics_widgets DROP CONSTRAINT IF EXISTS analytics_widgets_visualization_check;
ALTER TABLE public.analytics_widgets DROP CONSTRAINT IF EXISTS analytics_widgets_metric_key;
ALTER TABLE public.analytics_widgets DROP CONSTRAINT IF EXISTS analytics_widgets_metric_key_check;
ALTER TABLE public.analytics_widgets ADD CONSTRAINT analytics_widgets_visualization CHECK (visualization IN ('kpi','bar','hbar','stacked_bar','stacked_hbar','percent_bar','line','area','combo','pie','donut','heatmap','table','matrix','scatter','horizontal_bar','stacked'));