CREATE OR REPLACE FUNCTION public.profiles_email_not_blank() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RAISE EXCEPTION 'O email é obrigatório.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_email_not_blank ON public.profiles;
CREATE TRIGGER profiles_email_not_blank BEFORE UPDATE OF email ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_email_not_blank();