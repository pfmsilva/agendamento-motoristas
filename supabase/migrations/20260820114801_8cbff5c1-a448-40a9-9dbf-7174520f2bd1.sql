
-- ENUMS
create type public.app_role as enum ('manager','assistant','driver');
create type public.activity_type as enum ('trip','airport','meeting','event','service','availability','other');
create type public.activity_status as enum ('draft','confirmed','cancelled');
create type public.timeoff_type as enum ('holiday','sick','personal','other');
create type public.timeoff_status as enum ('pending','approved','rejected','cancelled');

-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create table public.assistants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.assistants to authenticated;
grant all on public.assistants to service_role;
alter table public.assistants enable row level security;

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  employee_code text,
  assistant_id uuid references public.assistants(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.drivers to authenticated;
grant all on public.drivers to service_role;
alter table public.drivers enable row level security;

create table public.assistant_driver_assignments (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references public.assistants(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (assistant_id, driver_id)
);
grant select, insert, update, delete on public.assistant_driver_assignments to authenticated;
grant all on public.assistant_driver_assignments to service_role;
alter table public.assistant_driver_assignments enable row level security;

-- HELPERS
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'manager')
$$;

create or replace function public.my_driver_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.drivers where user_id = auth.uid() limit 1
$$;

create or replace function public.my_assistant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.assistants where user_id = auth.uid() limit 1
$$;

create or replace function public.assistant_manages_driver(_driver_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assistant_driver_assignments a
    join public.assistants s on s.id = a.assistant_id
    where a.driver_id = _driver_id and s.user_id = auth.uid()
  )
$$;

create or replace function public.can_view_driver(_driver_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager()
     or public.assistant_manages_driver(_driver_id)
     or _driver_id = public.my_driver_id()
$$;

create or replace function public.can_manage_driver_schedule(_driver_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager() or public.assistant_manages_driver(_driver_id)
$$;

-- SETTINGS
create table public.app_settings (
  id boolean primary key default true check (id),
  assistants_can_approve_timeoff boolean not null default false,
  assistants_can_override_conflicts boolean not null default false,
  updated_at timestamptz not null default now()
);
grant select on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
grant insert, update on public.app_settings to authenticated;
alter table public.app_settings enable row level security;
insert into public.app_settings (id) values (true);

-- ACTIVITIES
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type activity_type not null default 'trip',
  driver_id uuid not null references public.drivers(id) on delete cascade,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  origin text,
  destination text,
  passenger text,
  notes text,
  status activity_status not null default 'confirmed',
  override_conflict boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.activities to authenticated;
grant all on public.activities to service_role;
alter table public.activities enable row level security;
create index on public.activities (driver_id, start_datetime);

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  type timeoff_type not null default 'holiday',
  reason text,
  notes text,
  status timeoff_status not null default 'pending',
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.time_off to authenticated;
grant all on public.time_off to service_role;
alter table public.time_off enable row level security;

create table public.unavailability (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  reason text,
  notes text,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.unavailability to authenticated;
grant all on public.unavailability to service_role;
alter table public.unavailability enable row level security;

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  kind text not null default 'info',
  entity_type text,
  entity_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;

-- POLICIES
create policy "profiles self or manager read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_manager());
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_manager()) with check (id = auth.uid() or public.is_manager());
create policy "profiles self insert" on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "roles self or manager read" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_manager());

create policy "assistants read" on public.assistants for select to authenticated
  using (public.is_manager() or user_id = auth.uid());
create policy "assistants manager write" on public.assistants for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy "drivers read" on public.drivers for select to authenticated
  using (public.can_view_driver(id));
create policy "drivers manager write" on public.drivers for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy "assignments read" on public.assistant_driver_assignments for select to authenticated
  using (public.is_manager() or assistant_id = public.my_assistant_id());
create policy "assignments manager write" on public.assistant_driver_assignments for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy "settings read" on public.app_settings for select to authenticated using (true);
create policy "settings manager write" on public.app_settings for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy "activities read" on public.activities for select to authenticated
  using (public.can_view_driver(driver_id));
create policy "activities write insert" on public.activities for insert to authenticated
  with check (public.can_manage_driver_schedule(driver_id));
create policy "activities write update" on public.activities for update to authenticated
  using (public.can_manage_driver_schedule(driver_id))
  with check (public.can_manage_driver_schedule(driver_id));

create policy "timeoff read" on public.time_off for select to authenticated
  using (public.can_view_driver(driver_id));
create policy "timeoff insert" on public.time_off for insert to authenticated
  with check (public.can_view_driver(driver_id));
create policy "timeoff update" on public.time_off for update to authenticated
  using (public.can_manage_driver_schedule(driver_id) or driver_id = public.my_driver_id())
  with check (public.can_manage_driver_schedule(driver_id) or driver_id = public.my_driver_id());

create policy "unavail read" on public.unavailability for select to authenticated
  using (public.can_view_driver(driver_id));
create policy "unavail insert" on public.unavailability for insert to authenticated
  with check (public.can_view_driver(driver_id));
create policy "unavail update" on public.unavailability for update to authenticated
  using (public.can_manage_driver_schedule(driver_id) or driver_id = public.my_driver_id())
  with check (public.can_manage_driver_schedule(driver_id) or driver_id = public.my_driver_id());

create policy "audit manager read" on public.audit_log for select to authenticated
  using (public.is_manager());

create policy "notifications own read" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "notifications own update" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- SIGNUP HOOK
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), new.email)
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- UPDATED_AT
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
create trigger t_activities_updated before update on public.activities for each row execute function public.touch_updated_at();
create trigger t_timeoff_updated before update on public.time_off for each row execute function public.touch_updated_at();
create trigger t_drivers_updated before update on public.drivers for each row execute function public.touch_updated_at();
create trigger t_assistants_updated before update on public.assistants for each row execute function public.touch_updated_at();
create trigger t_profiles_updated before update on public.profiles for each row execute function public.touch_updated_at();

-- CONFLICT DETECTION
create or replace function public.check_activity_conflicts()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_conflict record;
  v_allowed boolean;
  v_msg text;
begin
  if new.end_datetime <= new.start_datetime then
    raise exception 'End time must be after start time';
  end if;

  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;

  if new.status = 'cancelled' then return new; end if;

  select a.* into v_conflict from public.activities a
   where a.driver_id = new.driver_id
     and a.id <> new.id
     and a.status <> 'cancelled'
     and new.start_datetime < a.end_datetime
     and new.end_datetime > a.start_datetime
   limit 1;
  if found then
    v_msg := 'CONFLICT: driver already has "' || v_conflict.title || '" from ' ||
             to_char(v_conflict.start_datetime, 'YYYY-MM-DD HH24:MI') || ' to ' ||
             to_char(v_conflict.end_datetime, 'YYYY-MM-DD HH24:MI');
  end if;

  if v_msg is null then
    if exists (select 1 from public.time_off t
                where t.driver_id = new.driver_id and t.status = 'approved'
                  and new.start_datetime::date <= t.end_date and new.end_datetime::date >= t.start_date) then
      v_msg := 'CONFLICT: driver is on approved time off during this period';
    end if;
  end if;

  if v_msg is null then
    if exists (select 1 from public.unavailability u
                where u.driver_id = new.driver_id and u.status = 'active'
                  and new.start_datetime < u.end_datetime and new.end_datetime > u.start_datetime) then
      v_msg := 'CONFLICT: driver marked unavailable during this period';
    end if;
  end if;

  if v_msg is not null then
    v_allowed := new.override_conflict and (
      public.is_manager() or
      (public.assistant_manages_driver(new.driver_id)
        and (select assistants_can_override_conflicts from public.app_settings limit 1))
    );
    if not v_allowed then
      raise exception '%', v_msg;
    end if;
  end if;

  return new;
end; $$;
create trigger t_activities_conflicts before insert or update on public.activities
  for each row execute function public.check_activity_conflicts();

-- TIME OFF GUARDS + AUDIT + NOTIFICATIONS
create or replace function public.notify(_user uuid, _title text, _body text, _kind text, _etype text, _eid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _user is null then return; end if;
  insert into public.notifications (user_id, title, body, kind, entity_type, entity_id)
  values (_user, _title, _body, _kind, _etype, _eid);
end; $$;

create or replace function public.audit(_action text, _etype text, _eid uuid, _old jsonb, _new jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (user_id, action, entity_type, entity_id, old_value, new_value)
  values (auth.uid(), _action, _etype, _eid, _old, _new);
end; $$;

create or replace function public.driver_audience(_driver_id uuid)
returns table (user_id uuid) language sql stable security definer set search_path = public as $$
  select d.user_id from public.drivers d where d.id = _driver_id and d.user_id is not null
  union
  select s.user_id from public.assistant_driver_assignments a
    join public.assistants s on s.id = a.assistant_id
   where a.driver_id = _driver_id and s.user_id is not null
  union
  select r.user_id from public.user_roles r where r.role = 'manager'
$$;

create or replace function public.activities_after()
returns trigger language plpgsql security definer set search_path = public as $$
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
      when 'activity_created' then 'New activity assigned'
      when 'activity_cancelled' then 'Activity cancelled'
      when 'activity_driver_changed' then 'Activity driver changed'
      else 'Activity updated' end,
      new.title || ' - ' || d_name || ' - ' || to_char(new.start_datetime,'YYYY-MM-DD HH24:MI'),
      'activity', 'activity', new.id);
  end loop;

  if tg_op = 'UPDATE' and new.driver_id <> old.driver_id then
    for u in select * from public.driver_audience(old.driver_id) loop
      perform public.notify(u.user_id, 'Activity moved to another driver', new.title, 'activity', 'activity', new.id);
    end loop;
  end if;
  return new;
end; $$;
create trigger t_activities_after after insert or update on public.activities
  for each row execute function public.activities_after();

create or replace function public.timeoff_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare can_approve boolean;
begin
  if tg_op = 'INSERT' then
    new.requested_by := coalesce(new.requested_by, auth.uid());
    if not public.is_manager() then new.status := 'pending'; end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    can_approve := public.is_manager() or (
      public.assistant_manages_driver(new.driver_id)
      and (select assistants_can_approve_timeoff from public.app_settings limit 1));
    if new.status in ('approved','rejected') and not can_approve then
      raise exception 'Not allowed to approve or reject time off requests';
    end if;
    if new.status = 'cancelled' and not (can_approve or new.driver_id = public.my_driver_id()) then
      raise exception 'Not allowed to cancel this request';
    end if;
    if new.status in ('approved','rejected') then new.approved_by := auth.uid(); end if;
  end if;
  return new;
end; $$;
create trigger t_timeoff_guard before insert or update on public.time_off
  for each row execute function public.timeoff_guard();

create or replace function public.timeoff_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare u record; d_name text; act text; msg text;
begin
  select name into d_name from public.drivers where id = new.driver_id;
  if tg_op = 'INSERT' then act := 'timeoff_requested'; msg := 'Holiday requested';
  elsif new.status <> old.status then act := 'timeoff_' || new.status; msg := 'Holiday ' || new.status;
  else act := 'timeoff_updated'; msg := 'Holiday request updated';
  end if;
  perform public.audit(act, 'time_off', new.id, case when tg_op='UPDATE' then to_jsonb(old) else null end, to_jsonb(new));
  for u in select * from public.driver_audience(new.driver_id) loop
    perform public.notify(u.user_id, msg, d_name || ': ' || new.start_date || ' to ' || new.end_date,
      'time_off', 'time_off', new.id);
  end loop;
  return new;
end; $$;
create trigger t_timeoff_after after insert or update on public.time_off
  for each row execute function public.timeoff_after();

create or replace function public.unavailability_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.end_datetime <= new.start_datetime then raise exception 'End time must be after start time'; end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end; $$;
create trigger t_unavail_before before insert on public.unavailability
  for each row execute function public.unavailability_before();
