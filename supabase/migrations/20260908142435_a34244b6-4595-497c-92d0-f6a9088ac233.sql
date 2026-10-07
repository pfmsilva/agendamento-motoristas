-- 1. Novo perfil
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'administrator';

CREATE OR REPLACE FUNCTION public.is_administrator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role::text = 'administrator')
$$;

-- Quem pode editar serviços diretamente (escolha manual de motorista)
CREATE OR REPLACE FUNCTION public.can_edit_activities()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select public.is_manager() or public.is_owner() or public.is_administrator()
$$;

-- 2. Listas de prioridade (reaproveita assistant_driver_assignments)
ALTER TABLE public.assistant_driver_assignments ADD COLUMN IF NOT EXISTS priority integer;

WITH ranked AS (
  SELECT a.id, row_number() OVER (PARTITION BY a.assistant_id ORDER BY a.created_at, d.name, a.id) AS rn
  FROM public.assistant_driver_assignments a JOIN public.drivers d ON d.id = a.driver_id
)
UPDATE public.assistant_driver_assignments x SET priority = ranked.rn, active = true FROM ranked WHERE ranked.id = x.id;

ALTER TABLE public.assistant_driver_assignments ALTER COLUMN priority SET NOT NULL;
ALTER TABLE public.assistant_driver_assignments
  ADD CONSTRAINT assistant_driver_assignments_assistant_priority_key UNIQUE (assistant_id, priority) DEFERRABLE INITIALLY DEFERRED;

DROP POLICY IF EXISTS "assignments owner write" ON public.assistant_driver_assignments;
DROP POLICY IF EXISTS "assignments read" ON public.assistant_driver_assignments;
CREATE POLICY "priorities read" ON public.assistant_driver_assignments FOR SELECT TO authenticated
  USING (public.is_admin_view() OR public.is_administrator() OR assistant_id = public.my_assistant_id());
CREATE POLICY "priorities write" ON public.assistant_driver_assignments FOR ALL TO authenticated
  USING (public.is_admin_view()) WITH CHECK (public.is_admin_view());

CREATE OR REPLACE FUNCTION public.set_assistant_priorities(_assistant_id uuid, _driver_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE i integer;
BEGIN
  IF NOT public.is_admin_view() THEN
    RAISE EXCEPTION 'Só o Proprietário ou o Gestor podem alterar listas de prioridade';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(_driver_ids) x) <> coalesce(array_length(_driver_ids, 1), 0) THEN
    RAISE EXCEPTION 'A lista contém motoristas repetidos';
  END IF;
  DELETE FROM public.assistant_driver_assignments
   WHERE assistant_id = _assistant_id AND NOT (driver_id = ANY (coalesce(_driver_ids, '{}')));
  FOR i IN 1 .. coalesce(array_length(_driver_ids, 1), 0) LOOP
    INSERT INTO public.assistant_driver_assignments (assistant_id, driver_id, priority, active)
    VALUES (_assistant_id, _driver_ids[i], i, true)
    ON CONFLICT (assistant_id, driver_id) DO UPDATE SET priority = EXCLUDED.priority, active = true;
  END LOOP;
  PERFORM public.audit('priorities_updated', 'assistant', _assistant_id, NULL,
    jsonb_build_object('driver_ids', to_jsonb(_driver_ids)));
END; $$;

-- 3. Serviços
CREATE TYPE public.assignment_status AS ENUM ('automatic', 'manual', 'pending_manual');

ALTER TABLE public.activities ALTER COLUMN driver_id DROP NOT NULL;
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS assistant_id uuid REFERENCES public.assistants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_status public.assignment_status NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS assignment_attempts jsonb,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

ALTER TABLE public.activities DISABLE TRIGGER USER;
UPDATE public.activities a SET assistant_id = s.id
  FROM public.assistants s WHERE s.user_id = a.created_by AND a.assistant_id IS NULL;
UPDATE public.activities SET assigned_at = created_at WHERE assigned_at IS NULL AND driver_id IS NOT NULL;
ALTER TABLE public.activities ENABLE TRIGGER USER;

CREATE INDEX IF NOT EXISTS activities_assistant_id_idx ON public.activities (assistant_id);
CREATE INDEX IF NOT EXISTS activities_pending_idx ON public.activities (assignment_status) WHERE assignment_status = 'pending_manual';

-- 4. Disponibilidade (fonte única para trigger e atribuição automática)
CREATE OR REPLACE FUNCTION public.driver_is_available(_driver_id uuid, _start timestamptz, _end timestamptz, _ignore_activity uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t_type text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = _driver_id AND active) THEN
    RETURN 'motorista inativo';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.activities a
     WHERE a.driver_id = _driver_id
       AND (_ignore_activity IS NULL OR a.id <> _ignore_activity)
       AND a.status <> 'cancelled'
       AND coalesce(a.driver_adjusted_start, a.calculated_occupation_start, a.start_datetime) < _end
       AND coalesce(a.driver_adjusted_end, a.calculated_occupation_end, a.end_datetime) > _start
  ) THEN
    RETURN 'já tem um serviço neste período';
  END IF;
  SELECT t.type::text INTO t_type FROM public.time_off t
   WHERE t.driver_id = _driver_id AND t.status = 'approved'
     AND (_start AT TIME ZONE 'Europe/Lisbon')::date <= t.end_date
     AND (_end AT TIME ZONE 'Europe/Lisbon')::date >= t.start_date
   LIMIT 1;
  IF t_type IS NOT NULL THEN
    RETURN CASE WHEN t_type = 'holiday' THEN 'está de férias neste período' ELSE 'tem ausência registada neste período' END;
  END IF;
  IF EXISTS (SELECT 1 FROM public.unavailability u
              WHERE u.driver_id = _driver_id AND u.status = 'active'
                AND _start < u.end_datetime AND _end > u.start_datetime) THEN
    RETURN 'está indisponível neste período';
  END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.check_activity_conflicts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  eff_start timestamptz; eff_end timestamptz; v_msg text; v_allowed boolean;
BEGIN
  IF coalesce(current_setting('app.recalc_travel', true), '') = 'on' THEN
    RETURN new;
  END IF;
  IF new.driver_id IS NULL OR new.status = 'cancelled' THEN
    RETURN new;
  END IF;
  eff_start := coalesce(new.driver_adjusted_start, new.calculated_occupation_start, new.start_datetime);
  eff_end := coalesce(new.driver_adjusted_end, new.calculated_occupation_end, new.end_datetime);
  v_msg := public.driver_is_available(new.driver_id, eff_start, eff_end, new.id);
  IF v_msg IS NOT NULL THEN
    v_msg := 'CONFLITO: o motorista ' || v_msg;
    v_allowed := new.override_conflict AND public.can_edit_activities();
    IF NOT v_allowed THEN
      RAISE EXCEPTION '%', v_msg;
    END IF;
    PERFORM public.audit('activity_conflict_overridden', 'activity', new.id, NULL, jsonb_build_object('reason', v_msg));
  END IF;
  RETURN new;
END; $$;

-- 5. Guardas e notificações
CREATE OR REPLACE FUNCTION public.activities_driver_adjust_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.can_edit_activities() THEN
    RETURN new;
  END IF;
  -- Assistente requerente: alterações passam pelas funções update_service_auto / cancel_service_auto
  IF coalesce(current_setting('app.assistant_rpc', true), '') = 'on' THEN
    RETURN new;
  END IF;
  IF new.driver_id IS DISTINCT FROM old.driver_id OR new.driver_id IS DISTINCT FROM public.my_driver_id() THEN
    RAISE EXCEPTION 'Não tem permissão para alterar esta atividade';
  END IF;
  IF new.title IS DISTINCT FROM old.title OR new.type IS DISTINCT FROM old.type
     OR new.start_datetime IS DISTINCT FROM old.start_datetime OR new.end_datetime IS DISTINCT FROM old.end_datetime
     OR new.city_id IS DISTINCT FROM old.city_id OR new.origin IS DISTINCT FROM old.origin
     OR new.destination IS DISTINCT FROM old.destination OR new.passenger IS DISTINCT FROM old.passenger
     OR new.status IS DISTINCT FROM old.status OR new.notes IS DISTINCT FROM old.notes
     OR new.assignment_status IS DISTINCT FROM old.assignment_status THEN
    RAISE EXCEPTION 'O motorista só pode ajustar o seu período de ocupação';
  END IF;
  PERFORM public.audit('activity_occupation_adjusted', 'activity', new.id,
    jsonb_build_object('driver_adjusted_start', old.driver_adjusted_start, 'driver_adjusted_end', old.driver_adjusted_end),
    jsonb_build_object('driver_adjusted_start', new.driver_adjusted_start, 'driver_adjusted_end', new.driver_adjusted_end));
  RETURN new;
END; $$;

CREATE OR REPLACE FUNCTION public.driver_audience(_driver_id uuid)
RETURNS TABLE(user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select d.user_id from public.drivers d where d.id = _driver_id and d.user_id is not null
  union
  select r.user_id from public.user_roles r where r.role::text in ('manager', 'owner')
$$;

CREATE OR REPLACE FUNCTION public.notify_pending_assignment(_activity_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record; s_name text; r record; body text; reason text;
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = _activity_id;
  IF a IS NULL THEN RETURN; END IF;
  SELECT name INTO s_name FROM public.assistants WHERE id = a.assistant_id;
  IF a.assignment_attempts IS NULL OR jsonb_array_length(a.assignment_attempts) = 0 THEN
    reason := 'a assistente não tem motoristas na lista de prioridade';
  ELSE
    reason := 'nenhum motorista da lista de prioridade estava disponível';
  END IF;
  body := 'Serviço: ' || a.title || E'\n' ||
          'Data: ' || to_char(a.start_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') ||
          ' às ' || to_char(a.start_datetime AT TIME ZONE 'Europe/Lisbon', 'HH24:MI') || E'\n' ||
          'Assistente: ' || coalesce(s_name, '-') || E'\n' ||
          'Motivo: ' || reason || '.';
  FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role::text IN ('owner', 'manager') LOOP
    PERFORM public.notify(r.user_id, 'Atribuição manual necessária', body, 'assignment_pending', 'activity', a.id);
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.activities_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u record; d_name text; act text; driver_user uuid; old_driver_user uuid; a_user uuid; when_txt text; body text;
BEGIN
  IF new.driver_id IS NOT NULL THEN
    SELECT name, user_id INTO d_name, driver_user FROM public.drivers WHERE id = new.driver_id;
  END IF;
  IF tg_op = 'INSERT' THEN act := 'activity_created';
  ELSIF new.status = 'cancelled' AND old.status <> 'cancelled' THEN act := 'activity_cancelled';
  ELSIF new.driver_id IS DISTINCT FROM old.driver_id THEN act := 'activity_driver_changed';
  ELSE act := 'activity_updated';
  END IF;

  PERFORM public.audit(act, 'activity', new.id, CASE WHEN tg_op = 'UPDATE' THEN to_jsonb(old) ELSE NULL END, to_jsonb(new));

  IF coalesce(current_setting('app.recalc_travel', true), '') = 'on' THEN
    RETURN new;
  END IF;

  when_txt := to_char(new.start_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI');
  body := new.title || ' - ' || coalesce(d_name, 'Por atribuir') || ' - ' || when_txt;
  SELECT s.user_id INTO a_user FROM public.assistants s WHERE s.id = new.assistant_id;

  IF act IN ('activity_created', 'activity_driver_changed') THEN
    IF new.driver_id IS NOT NULL AND driver_user IS NOT NULL AND driver_user IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify(driver_user, 'Novo serviço atribuído', body, 'activity', 'activity', new.id);
    END IF;
    IF act = 'activity_driver_changed' AND new.driver_id IS NOT NULL AND a_user IS NOT NULL AND a_user IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify(a_user, 'Motorista atribuído ao seu serviço', body, 'activity', 'activity', new.id);
    END IF;
  ELSE
    FOR u IN
      SELECT user_id FROM public.driver_audience(new.driver_id)
      UNION SELECT a_user WHERE a_user IS NOT NULL
    LOOP
      IF u.user_id IS DISTINCT FROM auth.uid() THEN
        PERFORM public.notify(u.user_id,
          CASE act WHEN 'activity_cancelled' THEN 'Serviço cancelado' ELSE 'Serviço atualizado' END,
          body, 'activity', 'activity', new.id);
      END IF;
    END LOOP;
  END IF;

  IF tg_op = 'UPDATE' AND old.driver_id IS NOT NULL AND new.driver_id IS DISTINCT FROM old.driver_id THEN
    SELECT user_id INTO old_driver_user FROM public.drivers WHERE id = old.driver_id;
    IF old_driver_user IS NOT NULL AND old_driver_user IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify(old_driver_user, 'Serviço transferido para outro motorista', new.title || ' - ' || when_txt, 'activity', 'activity', new.id);
    END IF;
  END IF;

  IF new.status <> 'cancelled' AND new.assignment_status = 'pending_manual'
     AND (tg_op = 'INSERT' OR old.assignment_status <> 'pending_manual') THEN
    PERFORM public.notify_pending_assignment(new.id);
  END IF;
  RETURN new;
END; $$;

-- 6. Atribuição automática
CREATE OR REPLACE FUNCTION public.occupation_window(_city_id uuid, _start timestamptz, _end timestamptz, OUT occ_start timestamptz, OUT occ_end timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE tm integer := 0;
BEGIN
  IF _city_id IS NOT NULL THEN
    SELECT travel_minutes INTO tm FROM public.cities WHERE id = _city_id AND active;
  END IF;
  occ_start := _start - make_interval(mins => coalesce(tm, 0));
  occ_end := _end + make_interval(mins => coalesce(tm, 0));
END; $$;

CREATE OR REPLACE FUNCTION public.pick_driver_by_priority(_assistant_id uuid, _occ_start timestamptz, _occ_end timestamptz, _ignore_activity uuid, _prefer uuid,
  OUT driver_id uuid, OUT attempts jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; msg text;
BEGIN
  attempts := '[]'::jsonb;
  driver_id := NULL;
  FOR c IN
    SELECT d.id, d.name, p.priority
      FROM (
        SELECT a.driver_id, a.priority FROM public.assistant_driver_assignments a WHERE a.assistant_id = _assistant_id
        UNION ALL
        SELECT _prefer, 0 WHERE _prefer IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.assistant_driver_assignments a WHERE a.assistant_id = _assistant_id AND a.driver_id = _prefer)
      ) p
      JOIN public.drivers d ON d.id = p.driver_id
     ORDER BY CASE WHEN p.driver_id = _prefer THEN -1 ELSE p.priority END
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(c.id::text));
    msg := public.driver_is_available(c.id, _occ_start, _occ_end, _ignore_activity);
    IF msg IS NULL THEN
      driver_id := c.id;
      RETURN;
    END IF;
    attempts := attempts || jsonb_build_object('driver_id', c.id, 'name', c.name, 'priority', c.priority, 'reason', msg);
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.create_service_auto(_title text, _type public.activity_type, _city_id uuid, _start timestamptz, _end timestamptz, _notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s_id uuid; w record; pick record; v_id uuid; base_name text; city_name text; city_base boolean;
BEGIN
  s_id := public.my_assistant_id();
  IF s_id IS NULL THEN RAISE EXCEPTION 'Só assistentes podem pedir serviços por esta via'; END IF;
  IF btrim(coalesce(_title, '')) = '' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'O fim do serviço tem de ser posterior ao início'; END IF;

  SELECT name INTO base_name FROM public.cities WHERE is_base LIMIT 1;
  IF _city_id IS NOT NULL THEN SELECT name, is_base INTO city_name, city_base FROM public.cities WHERE id = _city_id; END IF;

  SELECT * INTO w FROM public.occupation_window(_city_id, _start, _end);
  SELECT * INTO pick FROM public.pick_driver_by_priority(s_id, w.occ_start, w.occ_end, NULL, NULL);

  INSERT INTO public.activities (title, type, driver_id, city_id, start_datetime, end_datetime, origin, destination, notes,
                                 status, assistant_id, assignment_status, assignment_attempts, assigned_at, created_by, updated_by)
  VALUES (btrim(_title), coalesce(_type, 'trip'), pick.driver_id, _city_id, _start, _end, base_name,
          CASE WHEN city_name IS NOT NULL AND NOT coalesce(city_base, false) THEN city_name END, nullif(_notes, ''),
          'confirmed', s_id,
          CASE WHEN pick.driver_id IS NULL THEN 'pending_manual'::public.assignment_status ELSE 'automatic' END,
          pick.attempts, CASE WHEN pick.driver_id IS NULL THEN NULL ELSE now() END, auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_service_auto(_id uuid, _title text, _type public.activity_type, _city_id uuid, _start timestamptz, _end timestamptz, _notes text, _expected_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s_id uuid; a record; w record; pick record; base_name text; city_name text; city_base boolean; new_status public.assignment_status;
BEGIN
  s_id := public.my_assistant_id();
  SELECT * INTO a FROM public.activities WHERE id = _id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe - foi eliminado por outro utilizador.'; END IF;
  IF s_id IS NULL OR a.assistant_id IS DISTINCT FROM s_id THEN RAISE EXCEPTION 'Não tem permissão para alterar este serviço'; END IF;
  IF _expected_updated_at IS NOT NULL AND a.updated_at <> _expected_updated_at THEN
    RAISE EXCEPTION 'Este registo foi alterado por outro utilizador entretanto. Atualize a página para ver a versão mais recente e repita a alteração.';
  END IF;
  IF btrim(coalesce(_title, '')) = '' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'O fim do serviço tem de ser posterior ao início'; END IF;

  SELECT name INTO base_name FROM public.cities WHERE is_base LIMIT 1;
  IF _city_id IS NOT NULL THEN SELECT name, is_base INTO city_name, city_base FROM public.cities WHERE id = _city_id; END IF;

  SELECT * INTO w FROM public.occupation_window(_city_id, _start, _end);
  SELECT * INTO pick FROM public.pick_driver_by_priority(a.assistant_id, w.occ_start, w.occ_end, a.id, a.driver_id);

  IF pick.driver_id IS NULL THEN new_status := 'pending_manual';
  ELSIF pick.driver_id = a.driver_id THEN new_status := CASE WHEN a.assignment_status = 'pending_manual' THEN 'automatic' ELSE a.assignment_status END;
  ELSE new_status := 'automatic';
  END IF;

  PERFORM set_config('app.assistant_rpc', 'on', true);
  UPDATE public.activities SET
    title = btrim(_title), type = coalesce(_type, a.type), city_id = _city_id, start_datetime = _start, end_datetime = _end,
    origin = base_name, destination = CASE WHEN city_name IS NOT NULL AND NOT coalesce(city_base, false) THEN city_name END,
    notes = nullif(_notes, ''), driver_id = pick.driver_id, assignment_status = new_status,
    assignment_attempts = pick.attempts,
    assigned_at = CASE WHEN pick.driver_id IS NULL THEN NULL WHEN pick.driver_id = a.driver_id THEN a.assigned_at ELSE now() END,
    driver_adjusted_start = CASE WHEN pick.driver_id = a.driver_id THEN a.driver_adjusted_start END,
    driver_adjusted_end = CASE WHEN pick.driver_id = a.driver_id THEN a.driver_adjusted_end END,
    updated_by = auth.uid()
  WHERE id = _id;
  PERFORM set_config('app.assistant_rpc', 'off', true);
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_service_auto(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s_id uuid; a_sid uuid;
BEGIN
  s_id := public.my_assistant_id();
  SELECT assistant_id INTO a_sid FROM public.activities WHERE id = _id;
  IF s_id IS NULL OR a_sid IS DISTINCT FROM s_id THEN RAISE EXCEPTION 'Não tem permissão para cancelar este serviço'; END IF;
  PERFORM set_config('app.assistant_rpc', 'on', true);
  UPDATE public.activities SET status = 'cancelled', updated_by = auth.uid() WHERE id = _id;
  PERFORM set_config('app.assistant_rpc', 'off', true);
END; $$;

CREATE OR REPLACE FUNCTION public.assign_service_driver(_id uuid, _driver_id uuid, _override boolean, _expected_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record;
BEGIN
  IF NOT public.can_edit_activities() THEN RAISE EXCEPTION 'Não tem permissão para atribuir motoristas'; END IF;
  IF _driver_id IS NULL THEN RAISE EXCEPTION 'Indique o motorista'; END IF;
  SELECT * INTO a FROM public.activities WHERE id = _id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe - foi eliminado por outro utilizador.'; END IF;
  IF _expected_updated_at IS NOT NULL AND a.updated_at <> _expected_updated_at THEN
    RAISE EXCEPTION 'Este registo foi alterado por outro utilizador entretanto. Atualize a página para ver a versão mais recente e repita a alteração.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(_driver_id::text));
  UPDATE public.activities SET driver_id = _driver_id, assignment_status = 'manual', assigned_at = now(),
    override_conflict = coalesce(_override, false),
    driver_adjusted_start = CASE WHEN _driver_id = a.driver_id THEN a.driver_adjusted_start END,
    driver_adjusted_end = CASE WHEN _driver_id = a.driver_id THEN a.driver_adjusted_end END,
    updated_by = auth.uid()
  WHERE id = _id;
END; $$;

-- 7. Acessos
DROP POLICY IF EXISTS "activities read" ON public.activities;
DROP POLICY IF EXISTS "activities write delete" ON public.activities;
DROP POLICY IF EXISTS "activities write insert" ON public.activities;
DROP POLICY IF EXISTS "activities write update" ON public.activities;
CREATE POLICY "activities read" ON public.activities FOR SELECT TO authenticated
  USING (public.can_edit_activities() OR assistant_id = public.my_assistant_id() OR driver_id = public.my_driver_id());
CREATE POLICY "activities write insert" ON public.activities FOR INSERT TO authenticated WITH CHECK (public.can_edit_activities());
CREATE POLICY "activities write update" ON public.activities FOR UPDATE TO authenticated USING (public.can_edit_activities()) WITH CHECK (public.can_edit_activities());
CREATE POLICY "activities write delete" ON public.activities FOR DELETE TO authenticated USING (public.is_admin_view());

DROP POLICY IF EXISTS "delegations delete" ON public.assistant_delegations;
DROP POLICY IF EXISTS "delegations insert" ON public.assistant_delegations;
DROP POLICY IF EXISTS "delegations read" ON public.assistant_delegations;
DROP POLICY IF EXISTS "delegations update" ON public.assistant_delegations;
CREATE POLICY "delegations owner history" ON public.assistant_delegations FOR SELECT TO authenticated USING (public.is_owner());

CREATE OR REPLACE FUNCTION public.can_view_driver(_driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select public.can_edit_activities() or _driver_id = public.my_driver_id()
$$;
CREATE OR REPLACE FUNCTION public.can_view_driver_details(_driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select public.can_edit_activities() or _driver_id = public.my_driver_id()
$$;
CREATE OR REPLACE FUNCTION public.can_manage_driver_schedule(_driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select public.is_manager() or public.is_owner()
$$;

DROP POLICY IF EXISTS "drivers read" ON public.drivers;
CREATE POLICY "drivers read" ON public.drivers FOR SELECT TO authenticated
  USING (public.can_view_driver(id) OR public.has_role(auth.uid(), 'assistant'));

DROP POLICY IF EXISTS "assistants read" ON public.assistants;
CREATE POLICY "assistants read" ON public.assistants FOR SELECT TO authenticated
  USING (public.is_admin_view() OR public.is_administrator() OR user_id = auth.uid());

DROP FUNCTION IF EXISTS public.delegated_activity_visible(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.assistant_manages_driver_full(uuid);
DROP FUNCTION IF EXISTS public.assistant_manages_driver(uuid);
DROP FUNCTION IF EXISTS public.assistant_delegated_driver(uuid, boolean);
DROP FUNCTION IF EXISTS public.assistant_assigned_driver(uuid);

GRANT EXECUTE ON FUNCTION public.set_assistant_priorities(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_service_auto(text, public.activity_type, uuid, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_service_auto(uuid, text, public.activity_type, uuid, timestamptz, timestamptz, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_service_auto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_service_driver(uuid, uuid, boolean, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_administrator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_activities() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.pick_driver_by_priority(uuid, timestamptz, timestamptz, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_pending_assignment(uuid) FROM PUBLIC, anon, authenticated;