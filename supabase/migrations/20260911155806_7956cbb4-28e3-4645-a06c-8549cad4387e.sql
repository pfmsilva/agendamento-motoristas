CREATE OR REPLACE FUNCTION public.analytics_occupancy(
  _from timestamptz,
  _to timestamptz,
  _driver_ids uuid[] DEFAULT NULL,
  _administrator_ids uuid[] DEFAULT NULL,
  _assistant_ids uuid[] DEFAULT NULL,
  _tag_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(driver_id uuid, driver_name text, occupied_minutes bigint, capacity_minutes bigint, hour_data jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH RECURSIVE
params AS (SELECT _from from_ts, _to to_ts WHERE _from < _to AND (_to - _from) <= interval '2 years'),
visible_drivers AS (
  SELECT d.id, d.name FROM public.drivers d, params p
  WHERE d.active AND (public.is_owner() OR public.is_manager()) AND (_driver_ids IS NULL OR d.id = ANY(_driver_ids))
),
raw_intervals AS (
  SELECT a.id activity_id, a.driver_id, greatest(a.effective_start,p.from_ts) start_ts, least(a.effective_end,p.to_ts) end_ts
  FROM public.activities a JOIN visible_drivers d ON d.id=a.driver_id CROSS JOIN params p
  WHERE a.status<>'cancelled' AND a.effective_start<p.to_ts AND a.effective_end>p.from_ts
    AND (_administrator_ids IS NULL OR a.administrator_id=ANY(_administrator_ids))
    AND (_assistant_ids IS NULL OR a.assistant_id=ANY(_assistant_ids))
    AND (_tag_ids IS NULL OR a.tag_id=ANY(_tag_ids))
),
ordered AS (
  SELECT r.*, max(end_ts) OVER (PARTITION BY driver_id ORDER BY start_ts,end_ts ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) prior_max_end FROM raw_intervals r
),
grouped AS (
  SELECT o.*, sum(CASE WHEN prior_max_end IS NULL OR start_ts>prior_max_end THEN 1 ELSE 0 END) OVER (PARTITION BY driver_id ORDER BY start_ts,end_ts) grp FROM ordered o
),
merged AS (SELECT driver_id,min(start_ts) start_ts,max(end_ts) end_ts FROM grouped GROUP BY driver_id,grp),
days AS (
  SELECT ((p.from_ts AT TIME ZONE 'Europe/Lisbon')::date+n)::date AS local_date FROM params p, generate_series(0,greatest(0,(p.to_ts AT TIME ZONE 'Europe/Lisbon')::date-(p.from_ts AT TIME ZONE 'Europe/Lisbon')::date)) n
),
working_days AS (SELECT local_date FROM days WHERE extract(isodow FROM local_date) BETWEEN 1 AND 5),
base_capacity AS (SELECT d.id driver_id,count(w.local_date)::bigint*420 minutes FROM visible_drivers d CROSS JOIN working_days w GROUP BY d.id),
holiday_reduction AS (
  SELECT t.driver_id,count(DISTINCT w.local_date)::bigint*420 minutes FROM public.time_off t JOIN visible_drivers d ON d.id=t.driver_id JOIN working_days w ON w.local_date BETWEEN t.start_date AND t.end_date WHERE t.status='approved' GROUP BY t.driver_id
),
unavailability_raw AS (
  SELECT u.driver_id,greatest(u.start_datetime,p.from_ts) start_ts,least(u.end_datetime,p.to_ts) end_ts
  FROM public.unavailability u JOIN visible_drivers d ON d.id=u.driver_id CROSS JOIN params p
  WHERE u.status='active' AND u.start_datetime<p.to_ts AND u.end_datetime>p.from_ts
),
unavailability_ordered AS (
  SELECT u.*,max(end_ts) OVER (PARTITION BY driver_id ORDER BY start_ts,end_ts ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) prior_max_end FROM unavailability_raw u
),
unavailability_grouped AS (
  SELECT u.*,sum(CASE WHEN prior_max_end IS NULL OR start_ts>prior_max_end THEN 1 ELSE 0 END) OVER (PARTITION BY driver_id ORDER BY start_ts,end_ts) grp FROM unavailability_ordered u
),
unavailability_merged AS (SELECT driver_id,min(start_ts) start_ts,max(end_ts) end_ts FROM unavailability_grouped GROUP BY driver_id,grp),
unavailability_minutes AS (
  SELECT u.driver_id,least(count(DISTINCT w.local_date)::bigint*420,round(sum(greatest(0,extract(epoch FROM (least(u.end_ts,((w.local_date+1)::timestamp AT TIME ZONE 'Europe/Lisbon'))-greatest(u.start_ts,(w.local_date::timestamp AT TIME ZONE 'Europe/Lisbon'))))/60)))::bigint) minutes
  FROM unavailability_merged u JOIN working_days w ON u.start_ts<((w.local_date+1)::timestamp AT TIME ZONE 'Europe/Lisbon') AND u.end_ts>(w.local_date::timestamp AT TIME ZONE 'Europe/Lisbon') GROUP BY u.driver_id
),
occupied_totals AS (SELECT driver_id,round(sum(extract(epoch FROM (end_ts-start_ts))/60))::bigint minutes FROM merged GROUP BY driver_id),
hour_slots AS (
  SELECT w.local_date,h.hour,(w.local_date::timestamp+make_interval(hours=>h.hour)) AT TIME ZONE 'Europe/Lisbon' slot_start,(w.local_date::timestamp+make_interval(hours=>h.hour+1)) AT TIME ZONE 'Europe/Lisbon' slot_end
  FROM days w CROSS JOIN generate_series(0,23) h(hour)
),
hour_occupation AS (
  SELECT d.id driver_id,h.local_date,h.hour,coalesce(round(sum(greatest(0,extract(epoch FROM (least(m.end_ts,h.slot_end)-greatest(m.start_ts,h.slot_start)))/60)) FILTER (WHERE m.driver_id IS NOT NULL)),0)::bigint minutes
  FROM visible_drivers d CROSS JOIN hour_slots h LEFT JOIN merged m ON m.driver_id=d.id AND m.start_ts<h.slot_end AND m.end_ts>h.slot_start GROUP BY d.id,h.local_date,h.hour
),
hour_services AS (
  SELECT d.id driver_id,h.hour,count(DISTINCT r.activity_id)::int services FROM visible_drivers d CROSS JOIN hour_slots h LEFT JOIN raw_intervals r ON r.driver_id=d.id AND r.start_ts<h.slot_end AND r.end_ts>h.slot_start GROUP BY d.id,h.hour
),
hour_metrics AS (
  SELECT o.driver_id,o.hour,s.services,count(*) FILTER (WHERE o.minutes>0)::int occupied_days,sum(o.minutes)::bigint minutes
  FROM hour_occupation o JOIN hour_services s USING(driver_id,hour) GROUP BY o.driver_id,o.hour,s.services
),
hours_json AS (
  SELECT driver_id,jsonb_agg(jsonb_build_object('hour',hour,'services',services,'occupiedDays',occupied_days,'minutes',minutes) ORDER BY hour) data FROM hour_metrics GROUP BY driver_id
)
SELECT d.id,d.name,coalesce(o.minutes,0),greatest(0,coalesce(c.minutes,0)-coalesce(hr.minutes,0)-coalesce(um.minutes,0)),coalesce(hj.data,'[]'::jsonb)
FROM visible_drivers d LEFT JOIN occupied_totals o ON o.driver_id=d.id LEFT JOIN base_capacity c ON c.driver_id=d.id LEFT JOIN holiday_reduction hr ON hr.driver_id=d.id LEFT JOIN unavailability_minutes um ON um.driver_id=d.id LEFT JOIN hours_json hj ON hj.driver_id=d.id ORDER BY d.name;
$$;
REVOKE ALL ON FUNCTION public.analytics_occupancy(timestamptz,timestamptz,uuid[],uuid[],uuid[],uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_occupancy(timestamptz,timestamptz,uuid[],uuid[],uuid[],uuid[]) TO authenticated, service_role;