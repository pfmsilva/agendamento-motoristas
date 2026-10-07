-- 1. Tipos de evento que exigem aprovação (ex.: "Outros")
ALTER TABLE public.event_kind_tags
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false;

-- 2. Aprovação e justificação nos eventos
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS justification text,
  ADD COLUMN IF NOT EXISTS approval_status text,
  ADD COLUMN IF NOT EXISTS approval_decided_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approval_decided_at timestamptz;

CREATE INDEX IF NOT EXISTS activities_approval_status_idx
  ON public.activities (approval_status) WHERE approval_status IS NOT NULL;

-- 3. Estado inicial: tipos com aprovação nascem pendentes
CREATE OR REPLACE FUNCTION public.activities_approval_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.event_kind_tags
     WHERE kind = new.event_kind_key AND requires_approval
  ) THEN
    new.approval_status := coalesce(new.approval_status, 'pending');
  END IF;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS t_activities_a1_approval ON public.activities;
CREATE TRIGGER t_activities_a1_approval
  BEFORE INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.activities_approval_guard();

-- 4. Notificação única a Gestor e Proprietário quando fica pendente
CREATE OR REPLACE FUNCTION public.notify_pending_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; v_author text;
BEGIN
  IF new.approval_status IS DISTINCT FROM 'pending' THEN RETURN new; END IF;
  SELECT name INTO v_author FROM public.profiles WHERE id = new.created_by;
  FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role::text IN ('owner','manager') LOOP
    PERFORM public.notify(r.user_id, 'Evento à espera de aprovação',
      coalesce(new.title, 'Evento') || ' · ' ||
      to_char(new.start_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') ||
      ' · criado por ' || coalesce(v_author, 'utilizador'),
      'approval', 'activity', new.id);
  END LOOP;
  PERFORM public.audit('activity_approval_requested', 'activity', new.id, NULL,
    jsonb_build_object('event_kind_key', new.event_kind_key, 'justification', new.justification));
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS t_activities_approval_notify ON public.activities;
CREATE TRIGGER t_activities_approval_notify
  AFTER INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.notify_pending_approval();

-- 5. Justificação submetida pelo autor logo após a criação
CREATE OR REPLACE FUNCTION public.set_event_justification(_id uuid, _justification text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_creator uuid;
BEGIN
  SELECT created_by INTO v_creator FROM public.activities WHERE id = _id;
  IF v_creator IS NULL AND NOT EXISTS (SELECT 1 FROM public.activities WHERE id = _id) THEN
    RAISE EXCEPTION 'Evento inexistente';
  END IF;
  IF NOT (v_creator = auth.uid() OR public.is_owner() OR public.is_manager()) THEN
    RAISE EXCEPTION 'Sem permissão para justificar este evento';
  END IF;
  IF coalesce(btrim(_justification), '') = '' THEN
    RAISE EXCEPTION 'Indique a justificação';
  END IF;
  PERFORM set_config('app.assistant_rpc', 'on', true);
  UPDATE public.activities SET justification = btrim(_justification) WHERE id = _id;
  PERFORM set_config('app.assistant_rpc', 'off', true);
  PERFORM public.audit('activity_justification_submitted', 'activity', _id, NULL,
    jsonb_build_object('justification', btrim(_justification)));
END; $$;

-- 6. Decisão: basta o Gestor OU o Proprietário
CREATE OR REPLACE FUNCTION public.decide_event_approval(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE a record; v_role app_role;
BEGIN
  IF NOT (public.is_owner() OR public.is_manager()) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar eventos';
  END IF;
  SELECT * INTO a FROM public.activities WHERE id = _id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Evento inexistente'; END IF;
  IF a.approval_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Este evento já foi decidido';
  END IF;
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;

  PERFORM set_config('app.assistant_rpc', 'on', true);
  PERFORM set_config('app.system_reassign', 'on', true);
  IF _approve THEN
    UPDATE public.activities
       SET approval_status = 'approved',
           approval_decided_by = auth.uid(),
           approval_decided_at = now()
     WHERE id = _id;
  ELSE
    UPDATE public.activities
       SET approval_status = 'rejected',
           approval_decided_by = auth.uid(),
           approval_decided_at = now(),
           status = 'cancelled',
           cancelled_by = auth.uid(),
           cancelled_by_role = v_role,
           cancelled_at = now(),
           cancel_reason = coalesce(nullif(btrim(_note), ''), 'Pedido de evento rejeitado')
     WHERE id = _id;
  END IF;
  PERFORM set_config('app.system_reassign', 'off', true);
  PERFORM set_config('app.assistant_rpc', 'off', true);

  UPDATE public.notifications
     SET read = true
   WHERE entity_type = 'activity' AND entity_id = _id AND kind = 'approval';

  PERFORM public.notify(a.created_by,
    CASE WHEN _approve THEN 'Evento aprovado' ELSE 'Evento rejeitado' END,
    coalesce(a.title, 'Evento') || CASE WHEN _approve THEN ' foi aprovado.' ELSE ' foi rejeitado.' END
      || coalesce(' Motivo: ' || nullif(btrim(_note), ''), ''),
    CASE WHEN _approve THEN 'info' ELSE 'warning' END, 'activity', _id);

  PERFORM public.audit(
    CASE WHEN _approve THEN 'activity_approval_approved' ELSE 'activity_approval_rejected' END,
    'activity', _id,
    jsonb_build_object('approval_status', 'pending'),
    jsonb_build_object('approval_status', CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
                       'decided_by', auth.uid(), 'decided_at', now(), 'note', _note));
END; $$;

GRANT EXECUTE ON FUNCTION public.set_event_justification(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_event_approval(uuid, boolean, text) TO authenticated;

-- 7. Motoristas podem propor novos locais; notificação com autor e data/hora
CREATE OR REPLACE FUNCTION public.create_city_pending(_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text := btrim(_name);
  v_id uuid;
  v_author text;
  r record;
BEGIN
  IF v_name = '' OR v_name IS NULL THEN
    RAISE EXCEPTION 'Indique o nome da cidade';
  END IF;

  IF NOT (public.is_owner() OR public.is_manager()
          OR public.my_assistant_id() IS NOT NULL
          OR public.my_driver_id() IS NOT NULL) THEN
    RAISE EXCEPTION 'Sem permissão para criar destinos';
  END IF;

  SELECT id INTO v_id FROM public.cities
   WHERE lower(btrim(name)) = lower(v_name)
   ORDER BY active DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.cities SET active = true WHERE id = v_id AND NOT active;
    RETURN v_id;
  END IF;

  INSERT INTO public.cities (name, travel_minutes, outbound_minutes, return_minutes, active, travel_configured)
  VALUES (v_name, 0, 0, 0, true, false)
  RETURNING id INTO v_id;

  SELECT name INTO v_author FROM public.profiles WHERE id = auth.uid();

  FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role::text IN ('owner', 'manager') LOOP
    PERFORM public.notify(r.user_id, 'Novo local adicionado',
      'O local "' || v_name || '" foi adicionado por ' || coalesce(v_author, 'utilizador') ||
      ' em ' || to_char(now() AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') ||
      ' e precisa de tempo de deslocação configurado.',
      'warning', 'city', v_id);
  END LOOP;

  PERFORM public.audit('city_created_pending', 'city', v_id, NULL,
    jsonb_build_object('name', v_name, 'created_by', auth.uid()));
  RETURN v_id;
END; $$;