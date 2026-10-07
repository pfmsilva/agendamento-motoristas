CREATE OR REPLACE FUNCTION public.update_service_auto(_id uuid, _title text, _type activity_type, _city_id uuid, _start timestamptz, _end timestamptz, _notes text, _expected_updated_at timestamptz, _origin_city_id uuid, _tag_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE a record; w record; pick record; new_status public.assignment_status;
BEGIN
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
REVOKE ALL ON FUNCTION public.update_service_auto(uuid,text,activity_type,uuid,timestamptz,timestamptz,text,timestamptz,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_service_auto(uuid,text,activity_type,uuid,timestamptz,timestamptz,text,timestamptz,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_service_series(_id uuid, _scope text, _title text, _type activity_type, _city_id uuid, _start_time time without time zone, _duration_minutes integer, _notes text, _origin_city_id uuid, _tag_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE a record; r record; occ_s timestamptz; occ_e timestamptz; w record; pick record; n integer:=0; new_status public.assignment_status;
BEGIN
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
REVOKE ALL ON FUNCTION public.update_service_series(uuid,text,text,activity_type,uuid,time,integer,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_service_series(uuid,text,text,activity_type,uuid,time,integer,text,uuid,uuid) TO authenticated;