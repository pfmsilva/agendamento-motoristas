-- 1. Reasons that require Gestor/Proprietário approval (currently "Outros").
ALTER TABLE public.travel_adjust_reasons
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false;

UPDATE public.travel_adjust_reasons
   SET requires_approval = true
 WHERE lower(btrim(label)) = 'outros';

-- 2. Pending occupation adjustment stored on the activity.
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS adjustment_justification text,
  ADD COLUMN IF NOT EXISTS adjustment_approval_status text,
  ADD COLUMN IF NOT EXISTS adjustment_proposed_start timestamptz,
  ADD COLUMN IF NOT EXISTS adjustment_proposed_end timestamptz,
  ADD COLUMN IF NOT EXISTS adjustment_requested_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS adjustment_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS adjustment_decided_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS adjustment_decided_at timestamptz;

-- 3. Adjustment RPC now accepts a justification and routes "Outros" to approval.
DROP FUNCTION IF EXISTS public.adjust_activity_occupation(uuid, timestamptz, timestamptz, uuid, text);

CREATE FUNCTION public.adjust_activity_occupation(
  _id uuid,
  _start timestamptz,
  _end timestamptz,
  _reason_id uuid,
  _scope text DEFAULT 'one',
  _justification text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  a record; r record; n integer := 0;
  d_start interval; d_end interval; s timestamptz; e timestamptz;
  v_source text; v_now timestamptz := now(); v_uid uuid := auth.uid();
  v_requires_approval boolean := false; v_reason_label text; v_author text;
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = _id FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Este serviço já não existe.'; END IF;

  IF NOT (public.can_edit_activities()
          OR public.serves_administrator(a.administrator_id)
          OR (a.driver_id IS NOT NULL AND a.driver_id = public.my_driver_id())) THEN
    RAISE EXCEPTION 'Não tem permissão para alterar eventos.';
  END IF;

  IF _scope NOT IN ('one', 'future') THEN RAISE EXCEPTION 'Âmbito inválido'; END IF;

  IF _start IS NOT NULL OR _end IS NOT NULL THEN
    IF _start IS NULL OR _end IS NULL THEN
      RAISE EXCEPTION 'Indique o início e o fim da ocupação.';
    END IF;
    IF _end <= _start THEN RAISE EXCEPTION 'O fim da ocupação tem de ser posterior ao início.'; END IF;
    SELECT requires_approval, label INTO v_requires_approval, v_reason_label
      FROM public.travel_adjust_reasons WHERE id = _reason_id AND active;
    IF v_reason_label IS NULL THEN
      RAISE EXCEPTION 'Selecione o motivo do ajuste da deslocação.';
    END IF;
    IF v_requires_approval AND coalesce(btrim(_justification), '') = '' THEN
      RAISE EXCEPTION 'Indique a justificação do ajuste.';
    END IF;
  END IF;

  v_source := CASE WHEN public.can_manage_driver_schedule(a.driver_id) THEN 'gestor' ELSE 'motorista' END;

  PERFORM set_config('app.assistant_rpc', 'on', true);

  -- 3a. Reason requiring approval: nothing is applied until a Gestor/Proprietário decides.
  IF v_requires_approval AND _start IS NOT NULL THEN
    UPDATE public.activities
       SET adjustment_proposed_start = _start,
           adjustment_proposed_end = _end,
           adjustment_justification = btrim(_justification),
           adjustment_reason_id = _reason_id,
           adjustment_approval_status = 'pending',
           adjustment_requested_by = v_uid,
           adjustment_requested_at = v_now,
           adjustment_decided_by = NULL,
           adjustment_decided_at = NULL,
           updated_by = v_uid
     WHERE id = _id;

    SELECT name INTO v_author FROM public.profiles WHERE id = v_uid;
    FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role::text IN ('owner','manager') LOOP
      PERFORM public.notify(r.user_id, 'Ajuste de ocupação aguarda aprovação',
        coalesce(a.title, 'Serviço') || ' · ' ||
        to_char(_start AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') || ' – ' ||
        to_char(_end AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') ||
        ' · pedido por ' || coalesce(v_author, 'utilizador') ||
        E'\nJustificação: ' || btrim(_justification),
        'adjustment_approval', 'activity', _id);
    END LOOP;

    PERFORM public.audit('activity_adjustment_requested', 'activity', _id,
      jsonb_build_object('occupation_start', coalesce(a.driver_adjusted_start, a.calculated_occupation_start, a.start_datetime),
                         'occupation_end', coalesce(a.driver_adjusted_end, a.calculated_occupation_end, a.end_datetime)),
      jsonb_build_object('proposed_start', _start, 'proposed_end', _end,
                         'reason', v_reason_label, 'justification', btrim(_justification),
                         'requested_by', v_uid, 'requested_at', v_now));

    PERFORM set_config('app.assistant_rpc', 'off', true);
    RETURN 0;
  END IF;

  UPDATE public.activities
     SET driver_adjusted_start = _start,
         driver_adjusted_end = _end,
         adjustment_reason_id = CASE WHEN _start IS NULL AND _end IS NULL THEN NULL ELSE _reason_id END,
         adjustment_source = CASE WHEN _start IS NULL AND _end IS NULL THEN NULL ELSE v_source END,
         adjusted_by = CASE WHEN _start IS NULL AND _end IS NULL THEN NULL ELSE v_uid END,
         adjusted_at = CASE WHEN _start IS NULL AND _end IS NULL THEN NULL ELSE v_now END,
         adjustment_justification = NULL,
         adjustment_approval_status = NULL,
         adjustment_proposed_start = NULL,
         adjustment_proposed_end = NULL,
         adjustment_requested_by = NULL,
         adjustment_requested_at = NULL,
         adjustment_decided_by = NULL,
         adjustment_decided_at = NULL,
         updated_by = v_uid
   WHERE id = _id;
  n := 1;

  IF _scope = 'future' AND a.series_id IS NOT NULL AND _start IS NOT NULL THEN
    d_start := _start - coalesce(a.calculated_occupation_start, a.start_datetime);
    d_end := _end - coalesce(a.calculated_occupation_end, a.end_datetime);
    FOR r IN
      SELECT * FROM public.activities
       WHERE series_id = a.series_id AND id <> a.id
         AND status <> 'cancelled'
         AND start_datetime > a.start_datetime
    LOOP
      s := coalesce(r.calculated_occupation_start, r.start_datetime) + d_start;
      e := coalesce(r.calculated_occupation_end, r.end_datetime) + d_end;
      IF e > s THEN
        UPDATE public.activities
           SET driver_adjusted_start = s,
               driver_adjusted_end = e,
               adjustment_reason_id = _reason_id,
               adjustment_source = v_source,
               adjusted_by = v_uid,
               adjusted_at = v_now,
               updated_by = v_uid
         WHERE id = r.id;
        n := n + 1;
      END IF;
    END LOOP;
  ELSIF _scope = 'future' AND a.series_id IS NOT NULL AND _start IS NULL THEN
    FOR r IN
      SELECT * FROM public.activities
       WHERE series_id = a.series_id AND id <> a.id
         AND status <> 'cancelled'
         AND start_datetime > a.start_datetime
    LOOP
      UPDATE public.activities
         SET driver_adjusted_start = NULL,
             driver_adjusted_end = NULL,
             adjustment_reason_id = NULL,
             adjustment_source = NULL,
             adjusted_by = NULL,
             adjusted_at = NULL,
             updated_by = v_uid
       WHERE id = r.id;
      n := n + 1;
    END LOOP;
  END IF;

  PERFORM set_config('app.assistant_rpc', 'off', true);
  RETURN n;
END; $function$;

GRANT EXECUTE ON FUNCTION public.adjust_activity_occupation(uuid, timestamptz, timestamptz, uuid, text, text) TO authenticated;

-- 4. Decision on a pending occupation adjustment (Gestor OR Proprietário; one decision is enough).
CREATE OR REPLACE FUNCTION public.decide_occupation_adjustment(_id uuid, _approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE a record; v_now timestamptz := now();
BEGIN
  IF NOT (public.is_owner() OR public.is_manager()) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar ajustes de ocupação';
  END IF;
  SELECT * INTO a FROM public.activities WHERE id = _id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Evento inexistente'; END IF;
  IF a.adjustment_approval_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Este ajuste já foi decidido';
  END IF;

  PERFORM set_config('app.assistant_rpc', 'on', true);
  IF _approve THEN
    UPDATE public.activities
       SET driver_adjusted_start = a.adjustment_proposed_start,
           driver_adjusted_end = a.adjustment_proposed_end,
           adjustment_source = 'gestor',
           adjusted_by = a.adjustment_requested_by,
           adjusted_at = a.adjustment_requested_at,
           adjustment_approval_status = 'approved',
           adjustment_decided_by = auth.uid(),
           adjustment_decided_at = v_now,
           updated_by = auth.uid()
     WHERE id = _id;
  ELSE
    UPDATE public.activities
       SET adjustment_approval_status = 'rejected',
           adjustment_decided_by = auth.uid(),
           adjustment_decided_at = v_now,
           adjustment_reason_id = CASE WHEN a.driver_adjusted_start IS NULL THEN NULL ELSE a.adjustment_reason_id END,
           updated_by = auth.uid()
     WHERE id = _id;
  END IF;
  PERFORM set_config('app.assistant_rpc', 'off', true);

  UPDATE public.notifications
     SET read = true
   WHERE entity_type = 'activity' AND entity_id = _id AND kind = 'adjustment_approval';

  PERFORM public.notify(a.adjustment_requested_by,
    CASE WHEN _approve THEN 'Ajuste de ocupação aprovado' ELSE 'Ajuste de ocupação rejeitado' END,
    coalesce(a.title, 'Serviço') ||
      CASE WHEN _approve THEN ': o ajuste pedido foi aprovado.' ELSE ': o ajuste pedido foi rejeitado.' END,
    CASE WHEN _approve THEN 'info' ELSE 'warning' END, 'activity', _id);

  PERFORM public.audit(
    CASE WHEN _approve THEN 'activity_adjustment_approved' ELSE 'activity_adjustment_rejected' END,
    'activity', _id,
    jsonb_build_object('adjustment_approval_status', 'pending',
                       'occupation_start', coalesce(a.driver_adjusted_start, a.calculated_occupation_start, a.start_datetime),
                       'occupation_end', coalesce(a.driver_adjusted_end, a.calculated_occupation_end, a.end_datetime)),
    jsonb_build_object('adjustment_approval_status', CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
                       'proposed_start', a.adjustment_proposed_start,
                       'proposed_end', a.adjustment_proposed_end,
                       'justification', a.adjustment_justification,
                       'decided_by', auth.uid(), 'decided_at', v_now));
END; $function$;

GRANT EXECUTE ON FUNCTION public.decide_occupation_adjustment(uuid, boolean) TO authenticated;

-- 5. Driver absence notification: informational only, with explicit start/end.
CREATE OR REPLACE FUNCTION public.timeoff_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare u record; d_name text; act text; msg text; body text;
begin
  select name into d_name from public.drivers where id = new.driver_id;
  if tg_op = 'INSERT' then
    act := 'timeoff_requested'; msg := 'Férias / Ausência registada';
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

  if tg_op = 'INSERT' then
    body := coalesce(d_name, 'Motorista') || ' registou Férias / Ausência.' ||
      E'\nInício: ' || to_char(new.start_date, 'DD/MM/YYYY') ||
      E'\nFim: ' || to_char(new.end_date, 'DD/MM/YYYY') ||
      E'\nNão é necessária aprovação.';
  else
    body := coalesce(d_name, 'Motorista') || ': ' || to_char(new.start_date,'DD/MM/YYYY') ||
      ' a ' || to_char(new.end_date,'DD/MM/YYYY');
  end if;

  for u in select * from public.driver_audience(new.driver_id) loop
    if u.user_id is distinct from auth.uid() then
      perform public.notify(u.user_id, msg, body, 'time_off', 'time_off', new.id);
    end if;
  end loop;
  return new;
end; $function$;