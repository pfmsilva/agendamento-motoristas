-- 1. Administradores
CREATE TABLE public.administrators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.administrators TO authenticated;
GRANT ALL ON public.administrators TO service_role;
ALTER TABLE public.administrators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "administrators read" ON public.administrators FOR SELECT TO authenticated USING (true);
CREATE POLICY "administrators write" ON public.administrators FOR ALL TO authenticated
  USING (public.is_admin_view()) WITH CHECK (public.is_admin_view());
CREATE TRIGGER t_administrators_updated BEFORE UPDATE ON public.administrators
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_audit_administrators AFTER INSERT OR UPDATE OR DELETE ON public.administrators
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes('administrator');

-- 2. Hierarquia de motoristas por Administrador
CREATE TABLE public.administrator_driver_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  administrator_id uuid NOT NULL REFERENCES public.administrators(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  priority integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (administrator_id, driver_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.administrator_driver_priorities TO authenticated;
GRANT ALL ON public.administrator_driver_priorities TO service_role;
ALTER TABLE public.administrator_driver_priorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin priorities read" ON public.administrator_driver_priorities FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin priorities write" ON public.administrator_driver_priorities FOR ALL TO authenticated
  USING (public.is_admin_view()) WITH CHECK (public.is_admin_view());
CREATE TRIGGER t_admin_priorities_updated BEFORE UPDATE ON public.administrator_driver_priorities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Ligação assistente -> administrador
CREATE TYPE public.admin_link_type AS ENUM ('primary', 'delegated');
CREATE TABLE public.assistant_administrators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id uuid NOT NULL REFERENCES public.assistants(id) ON DELETE CASCADE,
  administrator_id uuid NOT NULL REFERENCES public.administrators(id) ON DELETE CASCADE,
  relationship_type public.admin_link_type NOT NULL DEFAULT 'primary',
  start_date date,
  end_date date,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assistant_id, administrator_id)
);
CREATE UNIQUE INDEX assistant_one_primary ON public.assistant_administrators (assistant_id)
  WHERE relationship_type = 'primary' AND active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_administrators TO authenticated;
GRANT ALL ON public.assistant_administrators TO service_role;
ALTER TABLE public.assistant_administrators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assistant admins read" ON public.assistant_administrators FOR SELECT TO authenticated USING (true);
CREATE POLICY "assistant admins write" ON public.assistant_administrators FOR ALL TO authenticated
  USING (public.is_admin_view()) WITH CHECK (public.is_admin_view());
CREATE TRIGGER t_assistant_admins_updated BEFORE UPDATE ON public.assistant_administrators
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_audit_assistant_admins AFTER INSERT OR UPDATE OR DELETE ON public.assistant_administrators
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes('assistant_administrator');

-- 4. Serviços passam a guardar o Administrador
ALTER TABLE public.activities ADD COLUMN administrator_id uuid REFERENCES public.administrators(id);

-- 5. Migração de dados
INSERT INTO public.administrators (user_id, name, active)
SELECT p.id, coalesce(nullif(p.name, ''), p.email), true
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.id AND r.role::text = 'administrator';

INSERT INTO public.administrators (name, active)
SELECT 'Administração - ' || s.name, s.active
  FROM public.assistants s
 WHERE EXISTS (SELECT 1 FROM public.assistant_driver_assignments a WHERE a.assistant_id = s.id);

INSERT INTO public.administrator_driver_priorities (administrator_id, driver_id, priority, active)
SELECT ad.id, a.driver_id, a.priority, a.active
  FROM public.assistants s
  JOIN public.administrators ad ON ad.name = 'Administração - ' || s.name
  JOIN public.assistant_driver_assignments a ON a.assistant_id = s.id;

INSERT INTO public.assistant_administrators (assistant_id, administrator_id, relationship_type)
SELECT s.id, ad.id, 'primary'
  FROM public.assistants s
  JOIN public.administrators ad ON ad.name = 'Administração - ' || s.name;

ALTER TABLE public.activities DISABLE TRIGGER USER;
UPDATE public.activities a
   SET administrator_id = l.administrator_id
  FROM public.assistant_administrators l
 WHERE l.assistant_id = a.assistant_id AND l.relationship_type = 'primary';
ALTER TABLE public.activities ENABLE TRIGGER USER;

-- 6. Funções
CREATE OR REPLACE FUNCTION public.my_administrator_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select id from public.administrators where user_id = auth.uid() and active limit 1
$$;

CREATE OR REPLACE FUNCTION public.assistant_serves_administrator(_assistant_id uuid, _administrator_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists (
    select 1 from public.assistant_administrators l
     where l.assistant_id = _assistant_id
       and l.administrator_id = _administrator_id
       and l.active
       and (l.start_date is null or l.start_date <= (now() at time zone 'Europe/Lisbon')::date)
       and (l.end_date is null or l.end_date >= (now() at time zone 'Europe/Lisbon')::date)
  )
$$;

CREATE OR REPLACE FUNCTION public.serves_administrator(_administrator_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select _administrator_id is not null
     and (_administrator_id = public.my_administrator_id()
          or public.assistant_serves_administrator(public.my_assistant_id(), _administrator_id))
$$;

CREATE OR REPLACE FUNCTION public.set_administrator_priorities(_administrator_id uuid, _driver_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE i integer;
BEGIN
  IF NOT public.is_admin_view() THEN
    RAISE EXCEPTION 'Só o Proprietário ou o Gestor podem alterar hierarquias de motoristas';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(_driver_ids) x) <> coalesce(array_length(_driver_ids, 1), 0) THEN
    RAISE EXCEPTION 'A lista contém motoristas repetidos';
  END IF;
  DELETE FROM public.administrator_driver_priorities
   WHERE administrator_id = _administrator_id AND NOT (driver_id = ANY (coalesce(_driver_ids, '{}')));
  FOR i IN 1 .. coalesce(array_length(_driver_ids, 1), 0) LOOP
    INSERT INTO public.administrator_driver_priorities (administrator_id, driver_id, priority, active)
    VALUES (_administrator_id, _driver_ids[i], i, true)
    ON CONFLICT (administrator_id, driver_id) DO UPDATE SET priority = EXCLUDED.priority, active = true;
  END LOOP;
  PERFORM public.audit('administrator_priorities_updated', 'administrator', _administrator_id, NULL,
    jsonb_build_object('driver_ids', to_jsonb(_driver_ids)));
END; $$;

DROP FUNCTION IF EXISTS public.pick_driver_by_priority(uuid, timestamptz, timestamptz, uuid, uuid);
CREATE OR REPLACE FUNCTION public.pick_driver_by_priority(_administrator_id uuid, _occ_start timestamptz, _occ_end timestamptz, _ignore_activity uuid, _prefer uuid, OUT driver_id uuid, OUT attempts jsonb)
RETURNS record LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; msg text;
BEGIN
  attempts := '[]'::jsonb;
  driver_id := NULL;
  FOR c IN
    SELECT d.id, d.name, p.priority
      FROM (
        SELECT a.driver_id, a.priority FROM public.administrator_driver_priorities a
         WHERE a.administrator_id = _administrator_id AND a.active
        UNION ALL
        SELECT _prefer, 0 WHERE _prefer IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.administrator_driver_priorities a
                           WHERE a.administrator_id = _administrator_id AND a.driver_id = _prefer)
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

DROP FUNCTION IF EXISTS public.set_assistant_priorities(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.create_service_auto(text, activity_type, uuid, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS public.update_service_auto(uuid, text, activity_type, uuid, timestamptz, timestamptz, text, timestamptz);

CREATE OR REPLACE FUNCTION public.create_service_auto(_administrator_id uuid, _title text, _type activity_type, _city_id uuid, _start timestamptz, _end timestamptz, _notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s_id uuid; w record; pick record; v_id uuid; base_name text; city_name text; city_base boolean;
BEGIN
  s_id := public.my_assistant_id();
  IF NOT public.serves_administrator(_administrator_id) THEN
    RAISE EXCEPTION 'Não tem permissão para criar serviços para este Administrador';
  END IF;
  IF btrim(coalesce(_title, '')) = '' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'O fim do serviço tem de ser posterior ao início'; END IF;

  SELECT name INTO base_name FROM public.cities WHERE is_base LIMIT 1;
  IF _city_id IS NOT NULL THEN SELECT name, is_base INTO city_name, city_base FROM public.cities WHERE id = _city_id; END IF;

  SELECT * INTO w FROM public.occupation_window(_city_id, _start, _end);
  SELECT * INTO pick FROM public.pick_driver_by_priority(_administrator_id, w.occ_start, w.occ_end, NULL, NULL);

  INSERT INTO public.activities (title, type, driver_id, city_id, start_datetime, end_datetime, origin, destination, notes,
                                 status, assistant_id, administrator_id, assignment_status, assignment_attempts, assigned_at, created_by, updated_by)
  VALUES (btrim(_title), coalesce(_type, 'trip'), pick.driver_id, _city_id, _start, _end, base_name,
          CASE WHEN city_name IS NOT NULL AND NOT coalesce(city_base, false) THEN city_name END, nullif(_notes, ''),
          'confirmed', s_id, _administrator_id,
          CASE WHEN pick.driver_id IS NULL THEN 'pending_manual'::public.assignment_status ELSE 'automatic' END,
          pick.attempts, CASE WHEN pick.driver_id IS NULL THEN NULL ELSE now() END, auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_service_auto(_id uuid, _title text, _type activity_type, _city_id uuid, _start timestamptz, _end timestamptz, _notes text, _expected_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record; w record; pick record; base_name text; city_name text; city_base boolean; new_status public.assignment_status;
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = _id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe - foi eliminado por outro utilizador.'; END IF;
  IF NOT public.serves_administrator(a.administrator_id) THEN
    RAISE EXCEPTION 'Não tem permissão para alterar este serviço';
  END IF;
  IF _expected_updated_at IS NOT NULL AND a.updated_at <> _expected_updated_at THEN
    RAISE EXCEPTION 'Este registo foi alterado por outro utilizador entretanto. Atualize a página para ver a versão mais recente e repita a alteração.';
  END IF;
  IF btrim(coalesce(_title, '')) = '' THEN RAISE EXCEPTION 'Indique o título do serviço'; END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'O fim do serviço tem de ser posterior ao início'; END IF;

  SELECT name INTO base_name FROM public.cities WHERE is_base LIMIT 1;
  IF _city_id IS NOT NULL THEN SELECT name, is_base INTO city_name, city_base FROM public.cities WHERE id = _city_id; END IF;

  SELECT * INTO w FROM public.occupation_window(_city_id, _start, _end);
  SELECT * INTO pick FROM public.pick_driver_by_priority(a.administrator_id, w.occ_start, w.occ_end, a.id, a.driver_id);

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
DECLARE a record;
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = _id;
  IF a IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe.'; END IF;
  IF NOT public.serves_administrator(a.administrator_id) THEN
    RAISE EXCEPTION 'Não tem permissão para cancelar este serviço';
  END IF;
  PERFORM set_config('app.assistant_rpc', 'on', true);
  UPDATE public.activities SET status = 'cancelled', updated_by = auth.uid() WHERE id = _id;
  PERFORM set_config('app.assistant_rpc', 'off', true);
END; $$;

CREATE OR REPLACE FUNCTION public.notify_pending_assignment(_activity_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record; s_name text; ad_name text; r record; body text; reason text;
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = _activity_id;
  IF a IS NULL THEN RETURN; END IF;
  SELECT name INTO s_name FROM public.assistants WHERE id = a.assistant_id;
  SELECT name INTO ad_name FROM public.administrators WHERE id = a.administrator_id;
  IF a.assignment_attempts IS NULL OR jsonb_array_length(a.assignment_attempts) = 0 THEN
    reason := 'a hierarquia deste Administrador não tem motoristas';
  ELSE
    reason := 'nenhum motorista da hierarquia estava disponível';
  END IF;
  body := 'Serviço: ' || a.title || E'\n' ||
          'Data: ' || to_char(a.start_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY') ||
          ' às ' || to_char(a.start_datetime AT TIME ZONE 'Europe/Lisbon', 'HH24:MI') || E'\n' ||
          'Administrador: ' || coalesce(ad_name, '-') || E'\n' ||
          'Assistente: ' || coalesce(s_name, '-') || E'\n' ||
          'Motivo: ' || reason || '.';
  FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role::text IN ('owner', 'manager') LOOP
    PERFORM public.notify(r.user_id, 'Atribuição manual necessária', body, 'assignment_pending', 'activity', a.id);
  END LOOP;
END; $$;

-- 7. Leitura de serviços
CREATE OR REPLACE FUNCTION public.can_view_activity(_administrator_id uuid, _assistant_id uuid, _driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select public.can_edit_activities()
      or (_driver_id is not null and _driver_id = public.my_driver_id())
      or (_assistant_id is not null and _assistant_id = public.my_assistant_id())
      or public.serves_administrator(_administrator_id)
$$;

DROP POLICY IF EXISTS "activities read" ON public.activities;
CREATE POLICY "activities read" ON public.activities FOR SELECT TO authenticated
  USING (public.can_view_activity(administrator_id, assistant_id, driver_id));

REVOKE ALL ON FUNCTION public.my_administrator_id() FROM public, anon;
REVOKE ALL ON FUNCTION public.assistant_serves_administrator(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.serves_administrator(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.can_view_activity(uuid, uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.set_administrator_priorities(uuid, uuid[]) FROM public, anon;
REVOKE ALL ON FUNCTION public.pick_driver_by_priority(uuid, timestamptz, timestamptz, uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.create_service_auto(uuid, text, activity_type, uuid, timestamptz, timestamptz, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.update_service_auto(uuid, text, activity_type, uuid, timestamptz, timestamptz, text, timestamptz) FROM public, anon;
REVOKE ALL ON FUNCTION public.cancel_service_auto(uuid) FROM public, anon;