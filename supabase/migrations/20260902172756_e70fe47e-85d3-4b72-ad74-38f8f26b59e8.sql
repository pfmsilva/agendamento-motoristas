-- Role assignment becomes owner-only
DROP POLICY IF EXISTS "roles manager insert" ON public.user_roles;
DROP POLICY IF EXISTS "roles manager update" ON public.user_roles;
DROP POLICY IF EXISTS "roles manager delete" ON public.user_roles;

CREATE POLICY "roles owner insert" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.is_owner());
CREATE POLICY "roles owner update" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY "roles owner delete" ON public.user_roles
  FOR DELETE TO authenticated USING (public.is_owner());

-- Profile administration becomes owner-only (self-update stays)
DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
CREATE POLICY "profiles self or owner update" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((id = auth.uid()) OR public.is_owner())
  WITH CHECK ((id = auth.uid()) OR public.is_owner());

-- Never allow removing the last owner
CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF old.role::text = 'owner'
     AND (TG_OP = 'DELETE' OR new.role::text <> 'owner')
     AND (SELECT count(*) FROM public.user_roles WHERE role::text = 'owner') <= 1 THEN
    RAISE EXCEPTION 'Não é possível remover o último proprietário da aplicação';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN old ELSE new END;
END; $$;

DROP TRIGGER IF EXISTS t_protect_last_owner ON public.user_roles;
CREATE TRIGGER t_protect_last_owner
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();

-- Notify owners about new accounts pending a role
CREATE OR REPLACE FUNCTION public.notify_owners_pending_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE o record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = new.id) THEN
    RETURN new;
  END IF;
  FOR o IN SELECT user_id FROM public.user_roles WHERE role::text = 'owner' LOOP
    PERFORM public.notify(o.user_id, 'Nova conta pendente de perfil',
      coalesce(nullif(new.name, ''), new.email) || ' criou uma conta e aguarda atribuição de perfil.',
      'info', 'profile', new.id);
  END LOOP;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS t_notify_owners_pending_profile ON public.profiles;
CREATE TRIGGER t_notify_owners_pending_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_owners_pending_profile();
