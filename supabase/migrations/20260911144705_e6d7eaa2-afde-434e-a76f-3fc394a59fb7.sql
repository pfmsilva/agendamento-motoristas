CREATE OR REPLACE FUNCTION public.require_active_service_tag(_tag_id uuid)
RETURNS public.event_tags
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tag public.event_tags%ROWTYPE;
BEGIN
  SELECT * INTO v_tag FROM public.event_tags WHERE id = _tag_id;
  IF v_tag.id IS NULL OR NOT v_tag.active OR v_tag.system_key IN ('garage', 'vacation') THEN
    RAISE EXCEPTION 'Selecione uma TAG de serviço ativa.';
  END IF;
  RETURN v_tag;
END;
$$;
REVOKE ALL ON FUNCTION public.require_active_service_tag(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_service_auto(_administrator_id uuid, _title text, _type activity_type, _city_id uuid, _start timestamptz, _end timestamptz, _notes text, _origin_city_id uuid, _tag_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE s_id uuid; w record; pick record; v_id uuid;
BEGIN
  PERFORM public.require_active_service_tag(_tag_id);
  s_id := public.my_assistant_id();
  IF NOT public.serves_administrator(_administrator_id) THEN RAISE EXCEPTION 'Não tem permissão para criar serviços para este Administrador'; END IF;
  IF btrim(coalesce(_title, '')) = '' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _origin_city_id IS NULL THEN RAISE EXCEPTION 'Selecione a origem do serviço.'; END IF;
  IF _city_id IS NULL THEN RAISE EXCEPTION 'Selecione o destino do serviço.'; END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'O fim do serviço tem de ser posterior ao início'; END IF;
  SELECT * INTO w FROM public.occupation_window(_city_id, _start, _end);
  SELECT * INTO pick FROM public.pick_driver_by_priority(_administrator_id, w.occ_start, w.occ_end, NULL, NULL);
  INSERT INTO public.activities (title, type, tag_id, driver_id, city_id, origin_city_id, start_datetime, end_datetime, notes, status, assistant_id, administrator_id, assignment_status, assignment_attempts, assigned_at, created_by, updated_by)
  VALUES (btrim(_title), coalesce(_type, 'trip'), _tag_id, pick.driver_id, _city_id, _origin_city_id, _start, _end, nullif(_notes, ''), 'confirmed', s_id, _administrator_id, CASE WHEN pick.driver_id IS NULL THEN 'pending_manual'::public.assignment_status ELSE 'automatic' END, pick.attempts, CASE WHEN pick.driver_id IS NULL THEN NULL ELSE now() END, auth.uid(), auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_service_auto(_id uuid, _title text, _type activity_type, _city_id uuid, _start timestamptz, _end timestamptz, _notes text, _expected_updated_at timestamptz, _origin_city_id uuid, _tag_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE a record; w record; pick record; new_status public.assignment_status;
BEGIN
  PERFORM public.require_active_service_tag(_tag_id);
  SELECT * INTO a FROM public.activities WHERE id = _id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe - foi eliminado por outro utilizador.'; END IF;
  IF NOT public.serves_administrator(a.administrator_id) THEN RAISE EXCEPTION 'Não tem permissão para alterar este serviço'; END IF;
  IF _expected_updated_at IS NOT NULL AND a.updated_at <> _expected_updated_at THEN RAISE EXCEPTION 'Este registo foi alterado por outro utilizador entretanto. Atualize a página para ver a versão mais recente e repita a alteração.'; END IF;
  IF btrim(coalesce(_title, '')) = '' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _origin_city_id IS NULL THEN RAISE EXCEPTION 'Selecione a origem do serviço.'; END IF;
  IF _city_id IS NULL THEN RAISE EXCEPTION 'Selecione o destino do serviço.'; END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'O fim do serviço tem de ser posterior ao início'; END IF;
  SELECT * INTO w FROM public.occupation_window(_city_id, _start, _end);
  SELECT * INTO pick FROM public.pick_driver_by_priority(a.administrator_id, w.occ_start, w.occ_end, a.id, a.driver_id);
  IF pick.driver_id IS NULL THEN new_status := 'pending_manual'; ELSIF pick.driver_id = a.driver_id THEN new_status := CASE WHEN a.assignment_status = 'pending_manual' THEN 'automatic' ELSE a.assignment_status END; ELSE new_status := 'automatic'; END IF;
  PERFORM set_config('app.assistant_rpc', 'on', true);
  UPDATE public.activities SET title=btrim(_title), type=coalesce(_type,a.type), tag_id=_tag_id, city_id=_city_id, origin_city_id=_origin_city_id, start_datetime=_start, end_datetime=_end, notes=nullif(_notes,''), driver_id=pick.driver_id, assignment_status=new_status, assignment_attempts=pick.attempts, assigned_at=CASE WHEN pick.driver_id IS NULL THEN NULL WHEN pick.driver_id=a.driver_id THEN a.assigned_at ELSE now() END, driver_adjusted_start=CASE WHEN pick.driver_id=a.driver_id THEN a.driver_adjusted_start END, driver_adjusted_end=CASE WHEN pick.driver_id=a.driver_id THEN a.driver_adjusted_end END, adjustment_reason_id=CASE WHEN pick.driver_id=a.driver_id THEN a.adjustment_reason_id END, updated_by=auth.uid() WHERE id=_id;
  PERFORM set_config('app.assistant_rpc', 'off', true);
END; $$;

CREATE OR REPLACE FUNCTION public.create_service_series(_administrator_id uuid, _title text, _type activity_type, _city_id uuid, _start timestamptz, _end timestamptz, _notes text, _freq recurrence_freq, _until date, _origin_city_id uuid, _tag_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE s_id uuid; v_series uuid; i integer:=0; occ_s timestamptz; occ_e timestamptz; w record; pick record; dur interval; made integer:=0; n_occ integer:=0;
BEGIN
  PERFORM public.require_active_service_tag(_tag_id);
  IF _administrator_id IS NULL THEN RAISE EXCEPTION 'Indique o Administrador'; END IF;
  IF NOT (public.can_edit_activities() OR public.serves_administrator(_administrator_id)) THEN RAISE EXCEPTION 'Não tem permissão para criar serviços para este Administrador'; END IF;
  IF btrim(coalesce(_title,''))='' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _origin_city_id IS NULL THEN RAISE EXCEPTION 'Selecione a origem do serviço.'; END IF;
  IF _city_id IS NULL THEN RAISE EXCEPTION 'Selecione o destino do serviço.'; END IF;
  IF _end<=_start THEN RAISE EXCEPTION 'O fim do serviço tem de ser posterior ao início'; END IF;
  IF _until IS NULL THEN RAISE EXCEPTION 'Indique a data de fim da repetição'; END IF;
  IF _until<(_start AT TIME ZONE 'Europe/Lisbon')::date THEN RAISE EXCEPTION 'A data de fim da repetição tem de ser posterior ao primeiro serviço'; END IF;
  LOOP EXIT WHEN (public.series_shift(_start,_freq,n_occ) AT TIME ZONE 'Europe/Lisbon')::date>_until; n_occ:=n_occ+1; IF n_occ>120 THEN RAISE EXCEPTION 'A repetição selecionada ultrapassa o limite máximo de 120 ocorrências. Reduza o período de repetição.'; END IF; END LOOP;
  s_id:=public.my_assistant_id(); dur:=_end-_start;
  INSERT INTO public.activity_series (administrator_id,assistant_id,title,type,tag_id,city_id,notes,first_start,first_end,frequency,until_date,created_by) VALUES (_administrator_id,s_id,btrim(_title),coalesce(_type,'trip'),_tag_id,_city_id,nullif(_notes,''),_start,_end,_freq,_until,auth.uid()) RETURNING id INTO v_series;
  LOOP occ_s:=public.series_shift(_start,_freq,i); EXIT WHEN (occ_s AT TIME ZONE 'Europe/Lisbon')::date>_until OR made>=120; occ_e:=occ_s+dur;
    SELECT * INTO w FROM public.occupation_window(_city_id,occ_s,occ_e); SELECT * INTO pick FROM public.pick_driver_by_priority(_administrator_id,w.occ_start,w.occ_end,NULL,NULL);
    INSERT INTO public.activities (title,type,event_kind,tag_id,driver_id,city_id,origin_city_id,start_datetime,end_datetime,notes,status,assistant_id,administrator_id,assignment_status,assignment_attempts,assigned_at,series_id,series_index,created_by,updated_by) VALUES (btrim(_title),coalesce(_type,'trip'),'administration',_tag_id,pick.driver_id,_city_id,_origin_city_id,occ_s,occ_e,nullif(_notes,''),'confirmed',s_id,_administrator_id,CASE WHEN pick.driver_id IS NULL THEN 'pending_manual'::public.assignment_status ELSE 'automatic' END,pick.attempts,CASE WHEN pick.driver_id IS NULL THEN NULL ELSE now() END,v_series,i,auth.uid(),auth.uid()); made:=made+1; i:=i+1;
  END LOOP;
  PERFORM public.audit('service_series_created','activity_series',v_series,NULL,jsonb_build_object('title',btrim(_title),'tag_id',_tag_id,'frequency',_freq,'until',_until,'occurrences',made)); RETURN v_series;
END; $$;

CREATE OR REPLACE FUNCTION public.update_service_series(_id uuid, _scope text, _title text, _type activity_type, _city_id uuid, _start_time time without time zone, _duration_minutes integer, _notes text, _origin_city_id uuid, _tag_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE a record; r record; occ_s timestamptz; occ_e timestamptz; w record; pick record; n integer:=0; new_status public.assignment_status;
BEGIN
  PERFORM public.require_active_service_tag(_tag_id);
  SELECT * INTO a FROM public.activities WHERE id=_id;
  IF a IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe.'; END IF;
  IF a.series_id IS NULL THEN RAISE EXCEPTION 'Este serviço não pertence a uma série.'; END IF;
  IF NOT (public.can_edit_activities() OR public.serves_administrator(a.administrator_id)) THEN RAISE EXCEPTION 'Não tem permissão para alterar este serviço'; END IF;
  IF _scope NOT IN ('future','all') THEN RAISE EXCEPTION 'Âmbito inválido'; END IF;
  IF btrim(coalesce(_title,''))='' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _origin_city_id IS NULL THEN RAISE EXCEPTION 'Selecione a origem do serviço.'; END IF;
  IF _city_id IS NULL THEN RAISE EXCEPTION 'Selecione o destino do serviço.'; END IF;
  IF coalesce(_duration_minutes,0)<=0 THEN RAISE EXCEPTION 'Indique a duração do serviço'; END IF;
  UPDATE public.activity_series SET title=btrim(_title),type=coalesce(_type,type),tag_id=_tag_id,city_id=_city_id,notes=nullif(_notes,'') WHERE id=a.series_id;
  FOR r IN SELECT * FROM public.activities WHERE series_id=a.series_id AND status<>'cancelled' AND (_scope='all' OR start_datetime>=a.start_datetime) ORDER BY start_datetime LOOP
    occ_s:=((r.start_datetime AT TIME ZONE 'Europe/Lisbon')::date+_start_time) AT TIME ZONE 'Europe/Lisbon'; occ_e:=occ_s+make_interval(mins=>_duration_minutes);
    SELECT * INTO w FROM public.occupation_window(_city_id,occ_s,occ_e); SELECT * INTO pick FROM public.pick_driver_by_priority(r.administrator_id,w.occ_start,w.occ_end,r.id,r.driver_id);
    IF pick.driver_id IS NULL THEN new_status:='pending_manual'; ELSIF pick.driver_id=r.driver_id THEN new_status:=CASE WHEN r.assignment_status='pending_manual' THEN 'automatic' ELSE r.assignment_status END; ELSE new_status:='automatic'; END IF;
    PERFORM set_config('app.assistant_rpc','on',true);
    UPDATE public.activities SET title=btrim(_title),type=coalesce(_type,r.type),tag_id=_tag_id,city_id=_city_id,origin_city_id=_origin_city_id,start_datetime=occ_s,end_datetime=occ_e,notes=nullif(_notes,''),driver_id=pick.driver_id,assignment_status=new_status,assignment_attempts=pick.attempts,assigned_at=CASE WHEN pick.driver_id IS NULL THEN NULL WHEN pick.driver_id=r.driver_id THEN r.assigned_at ELSE now() END,driver_adjusted_start=CASE WHEN pick.driver_id=r.driver_id THEN r.driver_adjusted_start END,driver_adjusted_end=CASE WHEN pick.driver_id=r.driver_id THEN r.driver_adjusted_end END,adjustment_reason_id=CASE WHEN pick.driver_id=r.driver_id THEN r.adjustment_reason_id END,updated_by=auth.uid() WHERE id=r.id;
    PERFORM set_config('app.assistant_rpc','off',true); n:=n+1;
  END LOOP;
  PERFORM public.audit('service_series_updated','activity_series',a.series_id,NULL,jsonb_build_object('scope',_scope,'tag_id',_tag_id,'occurrences',n)); RETURN n;
END; $$;

CREATE OR REPLACE FUNCTION public.create_driver_service(_administrator_id uuid, _title text, _type activity_type, _start timestamptz, _end timestamptz, _notes text, _city_id uuid, _origin_city_id uuid, _tag_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_driver uuid; v_id uuid;
BEGIN
  PERFORM public.require_active_service_tag(_tag_id);
  v_driver:=public.my_driver_id();
  IF v_driver IS NULL THEN RAISE EXCEPTION 'Apenas motoristas podem criar eventos na sua agenda'; END IF;
  IF NOT public.driver_can_create_events(v_driver) THEN RAISE EXCEPTION 'Não tem permissão para criar serviços.'; END IF;
  IF _administrator_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.administrators WHERE id=_administrator_id AND active) THEN RAISE EXCEPTION 'Administrador inválido'; END IF;
  IF btrim(coalesce(_title,''))='' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _origin_city_id IS NULL THEN RAISE EXCEPTION 'Selecione a origem do serviço.'; END IF;
  IF _city_id IS NULL THEN RAISE EXCEPTION 'Selecione o destino do serviço.'; END IF;
  IF _end<=_start THEN RAISE EXCEPTION 'O fim tem de ser posterior ao início'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_driver::text));
  INSERT INTO public.activities (title,type,event_kind,tag_id,driver_id,administrator_id,city_id,origin_city_id,start_datetime,end_datetime,notes,status,assignment_status,assigned_at,override_conflict,created_by,updated_by) VALUES (btrim(_title),coalesce(_type,'other'),'administration',_tag_id,v_driver,_administrator_id,_city_id,_origin_city_id,_start,_end,nullif(btrim(coalesce(_notes,'')),''),'confirmed','manual',now(),false,auth.uid(),auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;