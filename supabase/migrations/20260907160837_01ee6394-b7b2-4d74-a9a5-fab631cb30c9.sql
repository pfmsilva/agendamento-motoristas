CREATE OR REPLACE FUNCTION public.activities_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare u record; d_name text; act text; driver_user uuid; old_driver_user uuid;
begin
  select name into d_name from public.drivers where id = new.driver_id;
  if tg_op = 'INSERT' then act := 'activity_created';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then act := 'activity_cancelled';
  elsif new.driver_id <> old.driver_id then act := 'activity_driver_changed';
  else act := 'activity_updated';
  end if;

  perform public.audit(act, 'activity', new.id, case when tg_op='UPDATE' then to_jsonb(old) else null end, to_jsonb(new));

  select user_id into driver_user from public.drivers where id = new.driver_id;

  if act in ('activity_created', 'activity_driver_changed') then
    -- Criação/atribuição: notificar apenas o motorista atribuído (nunca o próprio autor).
    if driver_user is not null and driver_user is distinct from auth.uid() then
      perform public.notify(driver_user, 'Novo serviço atribuído',
        new.title || ' — ' || d_name || ' — ' || to_char(new.start_datetime,'DD/MM/YYYY HH24:MI'),
        'activity', 'activity', new.id);
    end if;
  else
    for u in select * from public.driver_audience(new.driver_id) loop
      if u.user_id is distinct from auth.uid() then
        perform public.notify(u.user_id, case act
          when 'activity_cancelled' then 'Serviço cancelado'
          else 'Serviço atualizado' end,
          new.title || ' — ' || d_name || ' — ' || to_char(new.start_datetime,'DD/MM/YYYY HH24:MI'),
          'activity', 'activity', new.id);
      end if;
    end loop;
  end if;

  if tg_op = 'UPDATE' and new.driver_id <> old.driver_id then
    select user_id into old_driver_user from public.drivers where id = old.driver_id;
    if old_driver_user is not null and old_driver_user is distinct from auth.uid() then
      perform public.notify(old_driver_user, 'Serviço transferido para outro motorista', new.title, 'activity', 'activity', new.id);
    end if;
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
    if u.user_id is distinct from auth.uid() then
      perform public.notify(u.user_id, msg,
        d_name || ': ' || to_char(new.start_date,'DD/MM/YYYY') || ' a ' || to_char(new.end_date,'DD/MM/YYYY'),
        'time_off', 'time_off', new.id);
    end if;
  end loop;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.delegations_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE u record; d_name text; act text;
BEGIN
  SELECT name INTO d_name FROM public.drivers WHERE id = new.driver_id;
  act := CASE WHEN tg_op = 'INSERT' THEN 'delegation_created' ELSE 'delegation_modified' END;
  PERFORM public.audit(act, 'delegation', new.id,
    CASE WHEN tg_op = 'UPDATE' THEN to_jsonb(old) ELSE NULL END, to_jsonb(new));

  SELECT s.user_id INTO u FROM public.assistants s WHERE s.id = new.delegate_assistant_id;
  IF u.user_id IS NOT NULL AND u.user_id IS DISTINCT FROM auth.uid() THEN
    PERFORM public.notify(u.user_id,
      CASE WHEN tg_op = 'INSERT' THEN 'Nova delegação temporária' ELSE 'Delegação atualizada' END,
      d_name || ': ' || to_char(new.start_datetime, 'DD/MM/YYYY HH24:MI') || ' a ' ||
      to_char(new.end_datetime, 'DD/MM/YYYY HH24:MI'),
      'delegation', 'delegation', new.id);
  END IF;
  RETURN new;
END; $function$;