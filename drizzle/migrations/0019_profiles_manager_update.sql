-- Gestores passam a poder corrigir nome e email de contacto dos utilizadores.
DROP POLICY IF EXISTS "profiles self or owner update" ON public.profiles;
CREATE POLICY "profiles self or privileged update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid() OR public.is_owner() OR public.is_manager())
WITH CHECK (id = auth.uid() OR public.is_owner() OR public.is_manager());