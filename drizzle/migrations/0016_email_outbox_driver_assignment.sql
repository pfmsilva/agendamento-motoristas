-- Fila de notificações por email, independente de fornecedor.
CREATE TABLE public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template text NOT NULL,
  recipient_email text NOT NULL,
  recipient_user_id uuid,
  subject text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  entity_type text,
  entity_id uuid,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX email_outbox_pending_idx ON public.email_outbox (created_at) WHERE status = 'pending';

GRANT SELECT, UPDATE ON public.email_outbox TO authenticated;
GRANT ALL ON public.email_outbox TO service_role;

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestao le a fila de email"
ON public.email_outbox FOR SELECT TO authenticated
USING (public.is_owner() OR public.is_manager());

CREATE POLICY "Gestao marca a fila de email"
ON public.email_outbox FOR UPDATE TO authenticated
USING (public.is_owner() OR public.is_manager())
WITH CHECK (public.is_owner() OR public.is_manager());

-- Deteta a atribuição de motorista e enfileira o email, sem duplicados:
-- só quando passa a existir motorista ou quando o motorista muda.
CREATE OR REPLACE FUNCTION public.queue_driver_assignment_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_user uuid;
  v_name text;
  v_when text;
BEGIN
  IF new.driver_id IS NULL THEN
    RETURN new;
  END IF;
  IF tg_op = 'UPDATE' AND old.driver_id IS NOT DISTINCT FROM new.driver_id THEN
    RETURN new;
  END IF;
  IF new.status = 'cancelled' OR coalesce(new.approval_status, '') = 'rejected' THEN
    RETURN new;
  END IF;

  SELECT d.user_id, p.email, d.name
    INTO v_user, v_email, v_name
  FROM public.drivers d
  LEFT JOIN public.profiles p ON p.id = d.user_id
  WHERE d.id = new.driver_id;

  IF v_email IS NULL THEN
    RETURN new;
  END IF;

  v_when := to_char(new.start_datetime AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI');

  INSERT INTO public.email_outbox (
    template, recipient_email, recipient_user_id, subject, body, payload, entity_type, entity_id
  ) VALUES (
    'new_service_assigned',
    v_email,
    v_user,
    'Novo serviço atribuído',
    'Foi-lhe atribuído um novo serviço. Consulte a aplicação Gestão de Frota para ver os respetivos detalhes.' ||
      E'\n\nData e hora: ' || v_when || '.',
    jsonb_build_object(
      'driver_id', new.driver_id,
      'driver_name', v_name,
      'activity_id', new.id,
      'start_datetime', new.start_datetime,
      'end_datetime', new.end_datetime
    ),
    'activity',
    new.id
  );

  RETURN new;
END;
$$;

CREATE TRIGGER t_activities_email_assignment
AFTER INSERT OR UPDATE OF driver_id ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.queue_driver_assignment_email();