CREATE OR REPLACE FUNCTION public.unavailability_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.end_datetime <= new.start_datetime then
    raise exception 'A hora de fim tem de ser posterior à de início';
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.activities_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare u record; d_name text; act text;
begin
  select name into d_name from public.drivers where id = new.driver_id;
  if tg_op = 'INSERT' then act := 'activity_created';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then act := 'activity_cancelled';
  elsif new.driver_id <> old.driver_id then act := 'activity_driver_changed';
  else act := 'activity_updated';
  end if;

  perform public.audit(act, 'activity', new.id, case when tg_op='UPDATE' then to_jsonb(old) else null end, to_jsonb(new));

  for u in select * from public.driver_audience(new.driver_id) loop
    perform public.notify(u.user_id, case act
      when 'activity_created' then 'Novo serviço atribuído'
      when 'activity_cancelled' then 'Serviço cancelado'
      when 'activity_driver_changed' then 'Serviço com motorista alterado'
      else 'Serviço atualizado' end,
      new.title || ' — ' || d_name || ' — ' || to_char(new.start_datetime,'DD/MM/YYYY HH24:MI'),
      'activity', 'activity', new.id);
  end loop;

  if tg_op = 'UPDATE' and new.driver_id <> old.driver_id then
    for u in select * from public.driver_audience(old.driver_id) loop
      perform public.notify(u.user_id, 'Serviço transferido para outro motorista', new.title, 'activity', 'activity', new.id);
    end loop;
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.timeoff_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare u record; d_name text; act text; msg text;
begin
  select name into d_name from public.drivers where id = new.driver_id;
  if tg_op = 'INSERT' then
    act := 'timeoff_requested'; msg := 'Ausência registada';
  elsif new.status <> old.status then
    act := 'timeoff_' || new.status;
    msg := case new.status
      when 'approved' then 'Ausência aprovada'
      when 'rejected' then 'Ausência rejeitada'
      when 'cancelled' then 'Ausência cancelada'
      else 'Ausência atualizada' end;
  else
    act := 'timeoff_updated'; msg := 'Ausência atualizada';
  end if;
  perform public.audit(act, 'time_off', new.id, case when tg_op='UPDATE' then to_jsonb(old) else null end, to_jsonb(new));
  for u in select * from public.driver_audience(new.driver_id) loop
    perform public.notify(u.user_id, msg,
      d_name || ': ' || to_char(new.start_date,'DD/MM/YYYY') || ' a ' || to_char(new.end_date,'DD/MM/YYYY'),
      'time_off', 'time_off', new.id);
  end loop;
  return new;
end; $function$;