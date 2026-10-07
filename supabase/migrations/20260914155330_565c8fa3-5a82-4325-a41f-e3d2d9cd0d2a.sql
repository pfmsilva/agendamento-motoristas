ALTER TABLE public.activity_series ALTER COLUMN until_date DROP NOT NULL;
ALTER TABLE public.activity_series ADD COLUMN IF NOT EXISTS materialized_until date;

UPDATE public.activity_series SET materialized_until = until_date WHERE materialized_until IS NULL;

-- Horizonte único de materialização das séries sem data de fim.
CREATE OR REPLACE FUNCTION public.series_horizon()
 RETURNS date LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$ select (current_date + interval '12 months')::date $function$;

CREATE OR REPLACE FUNCTION public.create_service_series(_administrator_id uuid, _title text, _type activity_type, _city_id uuid, _start timestamp with time zone, _end timestamp with time zone, _notes text, _freq recurrence_freq, _until date, _origin_city_id uuid, _tag_id uuid, _round_trip boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s_id uuid; v_series uuid; i integer:=0; occ_s timestamptz; occ_e timestamptz; w record; pick record; dur interval; made integer:=0; n_occ integer:=0; rt boolean; eff_until date; open_ended boolean;
BEGIN
  rt := coalesce(_round_trip, true);
  PERFORM public.require_active_service_tag(_tag_id);
  IF _administrator_id IS NULL THEN RAISE EXCEPTION 'Indique o Administrador'; END IF;
  IF NOT (public.can_edit_activities() OR public.serves_administrator(_administrator_id)) THEN RAISE EXCEPTION 'Não tem permissão para criar serviços para este Administrador'; END IF;
  IF btrim(coalesce(_title,''))='' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _origin_city_id IS NULL THEN RAISE EXCEPTION 'Selecione a origem do serviço.'; END IF;
  IF _city_id IS NULL THEN RAISE EXCEPTION 'Selecione o destino do serviço.'; END IF;
  IF _end<=_start THEN RAISE EXCEPTION 'O fim do serviço tem de ser posterior ao início'; END IF;

  open_ended := _until IS NULL;
  IF open_ended THEN
    -- Repetição sem fim: materializa apenas o horizonte, prolongado depois automaticamente.
    eff_until := greatest(public.series_horizon(), (_start AT TIME ZONE 'Europe/Lisbon')::date);
  ELSE
    IF _until<(_start AT TIME ZONE 'Europe/Lisbon')::date THEN RAISE EXCEPTION 'A data de fim da repetição tem de ser posterior ao primeiro serviço'; END IF;
    eff_until := _until;
    LOOP EXIT WHEN (public.series_shift(_start,_freq,n_occ) AT TIME ZONE 'Europe/Lisbon')::date>_until; n_occ:=n_occ+1; IF n_occ>120 THEN RAISE EXCEPTION 'A repetição selecionada ultrapassa o limite máximo de 120 ocorrências. Reduza o período de repetição.'; END IF; END LOOP;
  END IF;

  s_id:=public.my_assistant_id(); dur:=_end-_start;
  INSERT INTO public.activity_series (administrator_id,assistant_id,title,type,tag_id,city_id,round_trip,notes,first_start,first_end,frequency,until_date,created_by) VALUES (_administrator_id,s_id,btrim(_title),coalesce(_type,'trip'),_tag_id,_city_id,rt,nullif(_notes,''),_start,_end,_freq,_until,auth.uid()) RETURNING id INTO v_series;

  LOOP occ_s:=public.series_shift(_start,_freq,i); EXIT WHEN (occ_s AT TIME ZONE 'Europe/Lisbon')::date>eff_until OR made>=120; occ_e:=occ_s+dur;
    SELECT * INTO w FROM public.occupation_window(_city_id,occ_s,occ_e,rt); SELECT * INTO pick FROM public.pick_driver_by_priority(_administrator_id,w.occ_start,w.occ_end,NULL,NULL);
    INSERT INTO public.activities (title,type,event_kind,tag_id,driver_id,city_id,origin_city_id,round_trip,start_datetime,end_datetime,notes,status,assistant_id,administrator_id,assignment_status,assignment_attempts,assigned_at,series_id,series_index,created_by,updated_by) VALUES (btrim(_title),coalesce(_type,'trip'),'administration',_tag_id,pick.driver_id,_city_id,_origin_city_id,rt,occ_s,occ_e,nullif(_notes,''),'confirmed',s_id,_administrator_id,CASE WHEN pick.driver_id IS NULL THEN 'pending_manual'::public.assignment_status ELSE 'automatic' END,pick.attempts,CASE WHEN pick.driver_id IS NULL THEN NULL ELSE now() END,v_series,i,auth.uid(),auth.uid()); made:=made+1; i:=i+1;
  END LOOP;

  UPDATE public.activity_series SET materialized_until = CASE WHEN made>0 THEN (public.series_shift(_start,_freq,i-1) AT TIME ZONE 'Europe/Lisbon')::date ELSE (_start AT TIME ZONE 'Europe/Lisbon')::date END WHERE id=v_series;

  PERFORM public.audit('service_series_created','activity_series',v_series,NULL,jsonb_build_object('title',btrim(_title),'tag_id',_tag_id,'frequency',_freq,'until',_until,'open_ended',open_ended,'occurrences',made,'round_trip',rt)); RETURN v_series;
END; $function$;

-- Prolonga as séries sem data de fim até ao horizonte, sem criar eventos ilimitados.
CREATE OR REPLACE FUNCTION public.extend_open_series()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s record; last_a record; horizon date; i integer; guard integer; dur interval;
        occ_s timestamptz; occ_e timestamptz; w record; pick record; n integer:=0; last_date date;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  horizon := public.series_horizon();

  FOR s IN SELECT * FROM public.activity_series
            WHERE active AND until_date IS NULL
              AND (materialized_until IS NULL OR materialized_until < horizon)
  LOOP
    SELECT a.*, coalesce(c.title, a.title) AS real_title, coalesce(c.notes, a.notes) AS real_notes
      INTO last_a
      FROM public.activities a
      LEFT JOIN public.activity_confidential_content c ON c.activity_id = a.id
     WHERE a.series_id = s.id
     ORDER BY a.series_index DESC NULLS LAST
     LIMIT 1;
    CONTINUE WHEN last_a IS NULL;

    dur := s.first_end - s.first_start;
    i := coalesce(last_a.series_index, 0) + 1;
    guard := 0;
    last_date := s.materialized_until;

    LOOP
      occ_s := public.series_shift(s.first_start, s.frequency, i);
      EXIT WHEN (occ_s AT TIME ZONE 'Europe/Lisbon')::date > horizon OR guard >= 120;
      occ_e := occ_s + dur;

      SELECT * INTO w FROM public.occupation_window(s.city_id, occ_s, occ_e, coalesce(s.round_trip, true));
      SELECT * INTO pick FROM public.pick_driver_by_priority(s.administrator_id, w.occ_start, w.occ_end, NULL, NULL);

      INSERT INTO public.activities (title,type,event_kind,tag_id,driver_id,city_id,origin_city_id,round_trip,start_datetime,end_datetime,notes,status,assistant_id,administrator_id,assignment_status,assignment_attempts,assigned_at,series_id,series_index,created_by,updated_by)
      VALUES (last_a.real_title, last_a.type, 'administration', last_a.tag_id, pick.driver_id, s.city_id, last_a.origin_city_id,
              coalesce(s.round_trip, true), occ_s, occ_e, last_a.real_notes, 'confirmed', s.assistant_id, s.administrator_id,
              CASE WHEN pick.driver_id IS NULL THEN 'pending_manual'::public.assignment_status ELSE 'automatic' END,
              pick.attempts, CASE WHEN pick.driver_id IS NULL THEN NULL ELSE now() END,
              s.id, i, s.created_by, s.created_by);

      last_date := (occ_s AT TIME ZONE 'Europe/Lisbon')::date;
      n := n + 1; i := i + 1; guard := guard + 1;
    END LOOP;

    UPDATE public.activity_series SET materialized_until = greatest(coalesce(last_date, horizon), horizon) WHERE id = s.id;
  END LOOP;

  IF n > 0 THEN
    PERFORM public.audit('service_series_extended', 'activity_series', NULL, NULL, jsonb_build_object('occurrences', n, 'horizon', horizon));
  END IF;
  RETURN n;
END; $function$;

-- Cancelar "este e os seguintes" termina também a repetição sem fim definido.
CREATE OR REPLACE FUNCTION public.cancel_service_series(_id uuid, _scope text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a record; r record; n integer := 0;
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = _id;
  IF a IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe.'; END IF;
  IF a.series_id IS NULL THEN RAISE EXCEPTION 'Este serviço não pertence a uma série.'; END IF;
  IF NOT (public.can_edit_activities() OR public.serves_administrator(a.administrator_id)) THEN
    RAISE EXCEPTION 'Não tem permissão para cancelar este serviço';
  END IF;
  IF _scope NOT IN ('future', 'all') THEN RAISE EXCEPTION 'Âmbito inválido'; END IF;

  PERFORM set_config('app.assistant_rpc', 'on', true);
  FOR r IN
    SELECT id FROM public.activities
     WHERE series_id = a.series_id AND status <> 'cancelled'
       AND (_scope = 'all' OR start_datetime >= a.start_datetime)
  LOOP
    UPDATE public.activities SET status = 'cancelled', updated_by = auth.uid() WHERE id = r.id;
    n := n + 1;
  END LOOP;
  PERFORM set_config('app.assistant_rpc', 'off', true);

  IF _scope = 'all' THEN
    UPDATE public.activity_series SET active = false WHERE id = a.series_id;
  ELSE
    -- Termina a repetição a partir desta ocorrência: nada de novo é gerado.
    UPDATE public.activity_series
       SET active = false,
           until_date = coalesce(until_date, ((a.start_datetime AT TIME ZONE 'Europe/Lisbon')::date - 1)),
           materialized_until = ((a.start_datetime AT TIME ZONE 'Europe/Lisbon')::date - 1)
     WHERE id = a.series_id;
  END IF;

  PERFORM public.audit('service_series_cancelled', 'activity_series', a.series_id, NULL,
    jsonb_build_object('scope', _scope, 'occurrences', n));
  RETURN n;
END; $function$;

REVOKE ALL ON FUNCTION public.extend_open_series() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.series_horizon() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extend_open_series() TO authenticated;
GRANT EXECUTE ON FUNCTION public.series_horizon() TO authenticated;