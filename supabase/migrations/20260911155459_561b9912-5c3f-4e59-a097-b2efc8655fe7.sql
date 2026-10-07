CREATE TABLE public.analytics_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  shared_with_managers boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  global_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_dashboards_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 100)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_dashboards TO authenticated;
GRANT ALL ON public.analytics_dashboards TO service_role;
ALTER TABLE public.analytics_dashboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics dashboards read" ON public.analytics_dashboards
FOR SELECT TO authenticated
USING (
  (public.is_owner() AND owner_user_id = auth.uid())
  OR (public.is_manager() AND shared_with_managers)
);
CREATE POLICY "analytics dashboards owner insert" ON public.analytics_dashboards
FOR INSERT TO authenticated
WITH CHECK (public.is_owner() AND owner_user_id = auth.uid());
CREATE POLICY "analytics dashboards owner update" ON public.analytics_dashboards
FOR UPDATE TO authenticated
USING (public.is_owner() AND owner_user_id = auth.uid())
WITH CHECK (public.is_owner() AND owner_user_id = auth.uid());
CREATE POLICY "analytics dashboards owner delete" ON public.analytics_dashboards
FOR DELETE TO authenticated
USING (public.is_owner() AND owner_user_id = auth.uid());
CREATE UNIQUE INDEX analytics_one_default_per_owner
ON public.analytics_dashboards(owner_user_id) WHERE is_default;
CREATE INDEX analytics_dashboards_shared_idx
ON public.analytics_dashboards(shared_with_managers) WHERE shared_with_managers;
CREATE TRIGGER analytics_dashboards_touch
BEFORE UPDATE ON public.analytics_dashboards
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER analytics_dashboards_audit
AFTER INSERT OR UPDATE OR DELETE ON public.analytics_dashboards
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

CREATE TABLE public.analytics_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES public.analytics_dashboards(id) ON DELETE CASCADE,
  title text NOT NULL,
  metric_key text NOT NULL,
  visualization text NOT NULL,
  dimension_key text,
  follows_global_filters boolean NOT NULL DEFAULT true,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  grid_x integer NOT NULL DEFAULT 0,
  grid_y integer NOT NULL DEFAULT 0,
  grid_w integer NOT NULL DEFAULT 4,
  grid_h integer NOT NULL DEFAULT 3,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_widgets_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT analytics_widgets_visualization CHECK (visualization IN ('kpi','bar','horizontal_bar','line','area','donut','stacked','table','heatmap')),
  CONSTRAINT analytics_widgets_grid CHECK (grid_x BETWEEN 0 AND 11 AND grid_y >= 0 AND grid_w BETWEEN 2 AND 12 AND grid_h BETWEEN 2 AND 12 AND grid_x + grid_w <= 12)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_widgets TO authenticated;
GRANT ALL ON public.analytics_widgets TO service_role;
ALTER TABLE public.analytics_widgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics widgets read" ON public.analytics_widgets
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.analytics_dashboards d
  WHERE d.id = dashboard_id
    AND ((public.is_owner() AND d.owner_user_id = auth.uid()) OR (public.is_manager() AND d.shared_with_managers))
));
CREATE POLICY "analytics widgets owner insert" ON public.analytics_widgets
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.analytics_dashboards d
  WHERE d.id = dashboard_id AND public.is_owner() AND d.owner_user_id = auth.uid()
));
CREATE POLICY "analytics widgets owner update" ON public.analytics_widgets
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.analytics_dashboards d
  WHERE d.id = dashboard_id AND public.is_owner() AND d.owner_user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.analytics_dashboards d
  WHERE d.id = dashboard_id AND public.is_owner() AND d.owner_user_id = auth.uid()
));
CREATE POLICY "analytics widgets owner delete" ON public.analytics_widgets
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.analytics_dashboards d
  WHERE d.id = dashboard_id AND public.is_owner() AND d.owner_user_id = auth.uid()
));
CREATE INDEX analytics_widgets_dashboard_order_idx
ON public.analytics_widgets(dashboard_id, sort_order, grid_y, grid_x);
CREATE TRIGGER analytics_widgets_touch
BEFORE UPDATE ON public.analytics_widgets
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER analytics_widgets_audit
AFTER INSERT OR UPDATE OR DELETE ON public.analytics_widgets
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

CREATE OR REPLACE FUNCTION public.analytics_occupancy(
  _from timestamptz,
  _to timestamptz,
  _driver_ids uuid[] DEFAULT NULL,
  _administrator_ids uuid[] DEFAULT NULL,
  _assistant_ids uuid[] DEFAULT NULL,
  _tag_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  driver_id uuid,
  driver_name text,
  occupied_minutes bigint,
  capacity_minutes bigint,
  hour_data jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH RECURSIVE
params AS (
  SELECT _from AS from_ts, _to AS to_ts
  WHERE _from < _to AND (_to - _from) <= interval '2 years'
),
visible_drivers AS (
  SELECT d.id, d.name
  FROM public.drivers d, params p
  WHERE d.active
    AND (public.is_owner() OR public.is_manager())
    AND (_driver_ids IS NULL OR d.id = ANY(_driver_ids))
),
raw_intervals AS (
  SELECT a.id AS activity_id, a.driver_id,
         greatest(a.effective_start, p.from_ts) AS start_ts,
         least(a.effective_end, p.to_ts) AS end_ts
  FROM public.activities a
  JOIN visible_drivers d ON d.id = a.driver_id
  CROSS JOIN params p
  WHERE a.status <> 'cancelled'
    AND a.effective_start < p.to_ts
    AND a.effective_end > p.from_ts
    AND (_administrator_ids IS NULL OR a.administrator_id = ANY(_administrator_ids))
    AND (_assistant_ids IS NULL OR a.assistant_id = ANY(_assistant_ids))
    AND (_tag_ids IS NULL OR a.tag_id = ANY(_tag_ids))
),
ordered AS (
  SELECT r.*,
         max(end_ts) OVER (PARTITION BY driver_id ORDER BY start_ts, end_ts ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prior_max_end
  FROM raw_intervals r
),
grouped AS (
  SELECT o.*,
         sum(CASE WHEN prior_max_end IS NULL OR start_ts > prior_max_end THEN 1 ELSE 0 END)
           OVER (PARTITION BY driver_id ORDER BY start_ts, end_ts) AS grp
  FROM ordered o
),
merged AS (
  SELECT driver_id, min(start_ts) AS start_ts, max(end_ts) AS end_ts
  FROM grouped GROUP BY driver_id, grp
),
days AS (
  SELECT p.from_ts::date + n AS day
  FROM params p,
       generate_series(0, greatest(0, (p.to_ts::date - p.from_ts::date))) AS n
),
working_days AS (
  SELECT day FROM days WHERE extract(isodow FROM day) BETWEEN 1 AND 5
),
base_capacity AS (
  SELECT d.id AS driver_id, count(w.day)::bigint * 420 AS minutes
  FROM visible_drivers d CROSS JOIN working_days w GROUP BY d.id
),
holiday_reduction AS (
  SELECT t.driver_id, count(DISTINCT w.day)::bigint * 420 AS minutes
  FROM public.time_off t
  JOIN visible_drivers d ON d.id = t.driver_id
  JOIN working_days w ON w.day BETWEEN t.start_date AND t.end_date
  WHERE t.status = 'approved'
  GROUP BY t.driver_id
),
unavailability_raw AS (
  SELECT u.driver_id, greatest(u.start_datetime, p.from_ts) AS start_ts,
         least(u.end_datetime, p.to_ts) AS end_ts
  FROM public.unavailability u
  JOIN visible_drivers d ON d.id = u.driver_id CROSS JOIN params p
  WHERE u.status = 'active' AND u.start_datetime < p.to_ts AND u.end_datetime > p.from_ts
),
unavailability_minutes AS (
  SELECT u.driver_id,
         round(sum(greatest(0, extract(epoch FROM (
           least(u.end_ts, w.day + interval '1 day') - greatest(u.start_ts, w.day::timestamptz)
         )) / 60)))::bigint AS minutes
  FROM unavailability_raw u
  JOIN working_days w ON u.start_ts < w.day + interval '1 day' AND u.end_ts > w.day::timestamptz
  GROUP BY u.driver_id
),
occupied_totals AS (
  SELECT driver_id, round(sum(extract(epoch FROM (end_ts - start_ts)) / 60))::bigint AS minutes
  FROM merged GROUP BY driver_id
),
hour_slots AS (
  SELECT w.day, h.hour,
         (w.day + make_interval(hours => h.hour))::timestamptz AS slot_start,
         (w.day + make_interval(hours => h.hour + 1))::timestamptz AS slot_end
  FROM days w CROSS JOIN generate_series(0, 23) AS h(hour)
),
hour_metrics AS (
  SELECT d.id AS driver_id, h.hour,
         count(DISTINCT r.activity_id) FILTER (WHERE r.activity_id IS NOT NULL)::int AS services,
         count(DISTINCT h.day) FILTER (WHERE m.driver_id IS NOT NULL)::int AS occupied_days,
         coalesce(round(sum(greatest(0, extract(epoch FROM (least(m.end_ts,h.slot_end) - greatest(m.start_ts,h.slot_start))) / 60)) FILTER (WHERE m.driver_id IS NOT NULL)),0)::bigint AS minutes
  FROM visible_drivers d CROSS JOIN hour_slots h
  LEFT JOIN merged m ON m.driver_id=d.id AND m.start_ts < h.slot_end AND m.end_ts > h.slot_start
  LEFT JOIN raw_intervals r ON r.driver_id=d.id AND r.start_ts < h.slot_end AND r.end_ts > h.slot_start
  GROUP BY d.id, h.hour
),
hours_json AS (
  SELECT driver_id, jsonb_agg(jsonb_build_object(
    'hour', hour,
    'services', services,
    'occupiedDays', occupied_days,
    'minutes', minutes
  ) ORDER BY hour) AS data
  FROM hour_metrics GROUP BY driver_id
)
SELECT d.id, d.name,
       coalesce(o.minutes,0),
       greatest(0, coalesce(c.minutes,0) - coalesce(hr.minutes,0) - coalesce(um.minutes,0)),
       coalesce(hj.data,'[]'::jsonb)
FROM visible_drivers d
LEFT JOIN occupied_totals o ON o.driver_id=d.id
LEFT JOIN base_capacity c ON c.driver_id=d.id
LEFT JOIN holiday_reduction hr ON hr.driver_id=d.id
LEFT JOIN unavailability_minutes um ON um.driver_id=d.id
LEFT JOIN hours_json hj ON hj.driver_id=d.id
ORDER BY d.name;
$$;
REVOKE ALL ON FUNCTION public.analytics_occupancy(timestamptz,timestamptz,uuid[],uuid[],uuid[],uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_occupancy(timestamptz,timestamptz,uuid[],uuid[],uuid[],uuid[]) TO authenticated, service_role;