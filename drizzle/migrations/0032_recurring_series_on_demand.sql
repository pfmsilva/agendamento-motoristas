ALTER TABLE public.activity_series ADD COLUMN IF NOT EXISTS weekdays smallint[];
ALTER TABLE public.activity_series ADD COLUMN IF NOT EXISTS origin_city_id uuid REFERENCES public.cities(id);
ALTER TABLE public.activity_series ADD COLUMN IF NOT EXISTS parent_series_id uuid REFERENCES public.activity_series(id);
UPDATE public.activity_series s SET origin_city_id = x.origin_city_id
  FROM (SELECT DISTINCT ON (series_id) series_id, origin_city_id FROM public.activities
         WHERE series_id IS NOT NULL AND origin_city_id IS NOT NULL ORDER BY series_id, series_index DESC) x
 WHERE x.series_id = s.id AND s.origin_city_id IS NULL;
COMMENT ON COLUMN public.activity_series.materialized_until IS 'DEPRECATED: occurrences are created on demand by ensure_series_range';

CREATE UNIQUE INDEX IF NOT EXISTS activities_series_index_uniq ON public.activities (series_id, series_index) WHERE series_id IS NOT NULL;

-- Datas eliminadas de uma série: nunca voltam a ser geradas.
CREATE TABLE public.activity_series_skips (
  series_id uuid NOT NULL REFERENCES public.activity_series(id) ON DELETE CASCADE,
  series_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (series_id, series_index)
);
GRANT SELECT ON public.activity_series_skips TO authenticated;
GRANT ALL ON public.activity_series_skips TO service_role;
ALTER TABLE public.activity_series_skips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read series skips" ON public.activity_series_skips FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.activities_record_series_skip()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.series_id IS NOT NULL AND OLD.series_index IS NOT NULL
     AND coalesce(current_setting('app.series_cleanup', true), 'off') <> 'on' THEN
    INSERT INTO public.activity_series_skips (series_id, series_index)
    VALUES (OLD.series_id, OLD.series_index) ON CONFLICT DO NOTHING;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER t_activities_series_skip AFTER DELETE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.activities_record_series_skip();

-- Regra de repetição -> datas num intervalo (nunca para além do pedido).
CREATE OR REPLACE FUNCTION public.series_occurrences(_series_id uuid, _from date, _to date)
 RETURNS TABLE(idx integer, occ_start timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE s record; sd date; tod time; n integer; d date; step integer; hi date;
BEGIN
  SELECT * INTO s FROM public.activity_series WHERE id = _series_id;
  IF s IS NULL THEN RETURN; END IF;
  sd := (s.first_start AT TIME ZONE 'Europe/Lisbon')::date;
  tod := (s.first_start AT TIME ZONE 'Europe/Lisbon')::time;
  hi := CASE WHEN s.until_date IS NULL THEN _to ELSE least(_to, s.until_date) END;
  IF hi < greatest(_from, sd) THEN RETURN; END IF;
  IF s.weekdays IS NOT NULL AND cardinality(s.weekdays) > 0 THEN
    RETURN QUERY
      SELECT (g::date - sd)::integer, ((g::date + tod)::timestamp AT TIME ZONE 'Europe/Lisbon')
        FROM generate_series(greatest(_from, sd), hi, interval '1 day') g
       WHERE extract(isodow FROM g)::smallint = ANY (s.weekdays);
    RETURN;
  END IF;
  step := CASE s.frequency WHEN 'daily' THEN 1 WHEN 'weekly' THEN 7 WHEN 'monthly' THEN 31 ELSE 366 END;
  n := greatest(0, ((greatest(_from, sd) - sd) / step) - 1);
  LOOP
    d := (public.series_shift(s.first_start, s.frequency, n) AT TIME ZONE 'Europe/Lisbon')::date;
    EXIT WHEN d > hi;
    IF d >= greatest(_from, sd) THEN
      idx := n; occ_start := public.series_shift(s.first_start, s.frequency, n); RETURN NEXT;
    END IF;
    n := n + 1;
  END LOOP;
END $$;

-- Cria as datas em falta de uma série num intervalo. Idempotente.
CREATE OR REPLACE FUNCTION public.materialize_series(_series_id uuid, _from date, _to date)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE s record; o record; w record; pick record; dur interval; t text; nt text; occ_e timestamptz; made integer := 0; ins integer;
BEGIN
  SELECT * INTO s FROM public.activity_series WHERE id = _series_id;
  IF s IS NULL OR NOT s.active THEN RETURN 0; END IF;
  SELECT coalesce(c.title, s.title), coalesce(c.notes, s.notes) INTO t, nt
    FROM (SELECT 1) one LEFT JOIN public.activity_series_confidential_content c ON c.series_id = s.id;
  dur := s.first_end - s.first_start;
  FOR o IN SELECT * FROM public.series_occurrences(_series_id, _from, _to) q
            WHERE NOT EXISTS (SELECT 1 FROM public.activities a WHERE a.series_id = _series_id AND a.series_index = q.idx)
              AND NOT EXISTS (SELECT 1 FROM public.activity_series_skips k WHERE k.series_id = _series_id AND k.series_index = q.idx)
  LOOP
    occ_e := o.occ_start + dur;
    SELECT * INTO w FROM public.occupation_window(s.origin_city_id, s.city_id, o.occ_start, occ_e, coalesce(s.round_trip, true));
    SELECT * INTO pick FROM public.pick_driver_by_priority(s.administrator_id, w.occ_start, w.occ_end, NULL, NULL);
    INSERT INTO public.activities (title,type,event_kind,event_kind_key,tag_id,driver_id,city_id,origin_city_id,round_trip,start_datetime,end_datetime,notes,status,assistant_id,administrator_id,assignment_status,assignment_attempts,assigned_at,series_id,series_index,created_by,updated_by)
    VALUES (t, s.type, 'administration', s.event_kind_key, s.tag_id, pick.driver_id, s.city_id, s.origin_city_id, coalesce(s.round_trip, true),
            o.occ_start, occ_e, nt, 'confirmed', s.assistant_id, s.administrator_id,
            CASE WHEN pick.driver_id IS NULL THEN 'pending_manual'::public.assignment_status ELSE 'automatic' END,
            pick.attempts, CASE WHEN pick.driver_id IS NULL THEN NULL ELSE now() END,
            s.id, o.idx, s.created_by, s.created_by)
    ON CONFLICT (series_id, series_index) WHERE series_id IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS ins = ROW_COUNT; made := made + ins;
  END LOOP;
  RETURN made;
END $$;

-- Pedido pelo calendário/análises antes de ler um período: só esse período.
CREATE OR REPLACE FUNCTION public.ensure_series_range(_from date, _to date)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE f date; t date; s record; n integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  f := greatest(_from, current_date);
  t := least(_to, f + 400);
  IF t < f THEN RETURN 0; END IF;
  FOR s IN SELECT id FROM public.activity_series
            WHERE active AND (first_start AT TIME ZONE 'Europe/Lisbon')::date <= t
              AND (until_date IS NULL OR until_date >= f)
  LOOP
    n := n + public.materialize_series(s.id, f, t);
  END LOOP;
  RETURN n;
END $$;

-- Criação: guarda a regra; séries sem fim só criam as próximas 6 semanas.
CREATE OR REPLACE FUNCTION public.create_service_series(_administrator_id uuid, _title text, _type activity_type, _city_id uuid, _start timestamptz, _end timestamptz, _notes text, _freq recurrence_freq, _until date, _origin_city_id uuid, _tag_id uuid, _round_trip boolean, _event_kind_key text, _weekdays smallint[])
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_series uuid; sd date; made integer; n_occ integer; rt boolean; wd smallint[];
BEGIN
  rt := coalesce(_round_trip, true);
  PERFORM public.require_active_service_tag(_tag_id);
  IF _administrator_id IS NULL THEN RAISE EXCEPTION 'Indique o Administrador'; END IF;
  IF NOT (public.can_edit_activities() OR public.serves_administrator(_administrator_id)) THEN RAISE EXCEPTION 'Não tem permissão para criar serviços para este Administrador'; END IF;
  IF btrim(coalesce(_title,''))='' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _origin_city_id IS NULL THEN RAISE EXCEPTION 'Selecione a origem do serviço.'; END IF;
  IF _city_id IS NULL THEN RAISE EXCEPTION 'Selecione o destino do serviço.'; END IF;
  IF _end<=_start THEN RAISE EXCEPTION 'O fim do serviço tem de ser posterior ao início'; END IF;
  sd := (_start AT TIME ZONE 'Europe/Lisbon')::date;
  IF _until IS NOT NULL AND _until < sd THEN RAISE EXCEPTION 'A data de fim da repetição tem de ser posterior ao primeiro serviço'; END IF;
  wd := CASE WHEN _weekdays IS NULL OR cardinality(_weekdays)=0 THEN NULL ELSE _weekdays END;
  IF wd IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(wd) x WHERE x < 1 OR x > 7) THEN RAISE EXCEPTION 'Dias da semana inválidos'; END IF;

  INSERT INTO public.activity_series (administrator_id,assistant_id,title,type,tag_id,city_id,origin_city_id,round_trip,notes,first_start,first_end,frequency,weekdays,until_date,event_kind_key,created_by)
  VALUES (_administrator_id,public.my_assistant_id(),btrim(_title),coalesce(_type,'trip'),_tag_id,_city_id,_origin_city_id,rt,nullif(_notes,''),_start,_end,
          CASE WHEN wd IS NOT NULL THEN 'weekly'::public.recurrence_freq ELSE _freq END,wd,_until,_event_kind_key,auth.uid())
  RETURNING id INTO v_series;

  IF _until IS NOT NULL THEN
    SELECT count(*) INTO n_occ FROM public.series_occurrences(v_series, sd, _until);
    IF n_occ > 120 THEN RAISE EXCEPTION 'A repetição selecionada ultrapassa o limite máximo de 120 ocorrências. Reduza o período de repetição.'; END IF;
    IF n_occ = 0 THEN RAISE EXCEPTION 'A repetição selecionada não tem nenhuma data.'; END IF;
    made := public.materialize_series(v_series, sd, _until);
  ELSE
    made := public.materialize_series(v_series, sd, greatest(sd, current_date) + 42);
  END IF;

  PERFORM public.audit('service_series_created','activity_series',v_series,NULL,jsonb_build_object('title',btrim(_title),'tag_id',_tag_id,'frequency',_freq,'weekdays',wd,'until',_until,'open_ended',_until IS NULL,'occurrences_created',made,'round_trip',rt));
  RETURN v_series;
END $$;

CREATE OR REPLACE FUNCTION public.create_service_series(_administrator_id uuid, _title text, _type activity_type, _city_id uuid, _start timestamptz, _end timestamptz, _notes text, _freq recurrence_freq, _until date, _origin_city_id uuid, _tag_id uuid, _round_trip boolean, _event_kind_key text)
 RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.create_service_series(_administrator_id,_title,_type,_city_id,_start,_end,_notes,_freq,_until,_origin_city_id,_tag_id,_round_trip,_event_kind_key,NULL::smallint[]) $$;

CREATE OR REPLACE FUNCTION public.create_service_series(_administrator_id uuid, _title text, _type activity_type, _city_id uuid, _start timestamptz, _end timestamptz, _notes text, _freq recurrence_freq, _until date, _origin_city_id uuid, _tag_id uuid, _round_trip boolean)
 RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.create_service_series(_administrator_id,_title,_type,_city_id,_start,_end,_notes,_freq,_until,_origin_city_id,_tag_id,_round_trip,NULL::text,NULL::smallint[]) $$;

-- Edição "este e seguintes"/"toda a série": atualiza a própria regra.
ALTER FUNCTION public.update_service_series(uuid, text, text, activity_type, uuid, time, integer, text, uuid, uuid, boolean) RENAME TO update_service_series_rows;

CREATE OR REPLACE FUNCTION public.update_service_series(_id uuid, _scope text, _title text, _type activity_type, _city_id uuid, _start_time time, _duration_minutes integer, _notes text, _origin_city_id uuid, _tag_id uuid, _round_trip boolean)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE a record; s record; d date; n integer;
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = _id;
  IF a IS NULL OR a.series_id IS NULL THEN RETURN public.update_service_series_rows(_id,_scope,_title,_type,_city_id,_start_time,_duration_minutes,_notes,_origin_city_id,_tag_id,_round_trip); END IF;
  IF NOT (public.can_edit_activities() OR public.serves_administrator(a.administrator_id)) THEN RAISE EXCEPTION 'Não tem permissão para alterar este serviço'; END IF;
  d := (a.start_datetime AT TIME ZONE 'Europe/Lisbon')::date;
  -- Datas anteriores ainda por criar mantêm a regra antiga.
  IF _scope = 'future' AND d - 1 >= current_date THEN PERFORM public.materialize_series(a.series_id, current_date, d - 1); END IF;
  n := public.update_service_series_rows(_id,_scope,_title,_type,_city_id,_start_time,_duration_minutes,_notes,_origin_city_id,_tag_id,_round_trip);
  SELECT * INTO s FROM public.activity_series WHERE id = a.series_id;
  UPDATE public.activity_series
     SET origin_city_id = _origin_city_id,
         first_start = (((first_start AT TIME ZONE 'Europe/Lisbon')::date + _start_time)::timestamp AT TIME ZONE 'Europe/Lisbon'),
         first_end = (((first_start AT TIME ZONE 'Europe/Lisbon')::date + _start_time)::timestamp AT TIME ZONE 'Europe/Lisbon') + make_interval(mins => _duration_minutes)
   WHERE id = a.series_id;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.update_service_series(uuid, text, text, activity_type, uuid, time, integer, text, uuid, uuid, boolean) TO authenticated;

-- Conflitos com séries: garantir as datas do mês antes de criar um serviço.
CREATE OR REPLACE FUNCTION public.create_service_auto(_administrator_id uuid, _title text, _type activity_type, _city_id uuid, _start timestamptz, _end timestamptz, _notes text, _origin_city_id uuid, _tag_id uuid, _round_trip boolean, _event_kind_key text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid; d date;
BEGIN
  d := (_start AT TIME ZONE 'Europe/Lisbon')::date;
  PERFORM public.ensure_series_range(date_trunc('month', d)::date, (date_trunc('month', d) + interval '1 month - 1 day')::date);
  v_id := public.create_service_auto(_administrator_id, _title, _type, _city_id, _start, _end, _notes, _origin_city_id, _tag_id, _round_trip);
  IF _event_kind_key IS NOT NULL THEN
    PERFORM set_config('app.assistant_rpc', 'on', true);
    UPDATE public.activities SET event_kind_key = _event_kind_key WHERE id = v_id;
    PERFORM set_config('app.assistant_rpc', 'off', true);
  END IF;
  RETURN v_id;
END $$;

-- Substituído por ensure_series_range.
CREATE OR REPLACE FUNCTION public.extend_open_series()
 RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT 0 $$;
COMMENT ON FUNCTION public.extend_open_series() IS 'DEPRECATED: replaced by ensure_series_range';
COMMENT ON FUNCTION public.series_horizon() IS 'DEPRECATED: no fixed horizon; see ensure_series_range';

REVOKE ALL ON FUNCTION public.series_occurrences(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.materialize_series(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_series_range(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_service_series_rows(uuid, text, text, activity_type, uuid, time, integer, text, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.series_occurrences(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_series_range(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_service_series(uuid, text, activity_type, uuid, timestamptz, timestamptz, text, recurrence_freq, date, uuid, uuid, boolean, text, smallint[]) TO authenticated;
REVOKE ALL ON FUNCTION public.create_service_series(uuid, text, activity_type, uuid, timestamptz, timestamptz, text, recurrence_freq, date, uuid, uuid, boolean, text, smallint[]) FROM anon;