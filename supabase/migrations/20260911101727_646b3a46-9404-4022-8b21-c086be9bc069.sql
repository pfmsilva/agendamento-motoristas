-- O sinalizador é local à transação; não é reposto porque a limpeza da chave
-- estrangeira (reassign_timeoff_id) ocorre depois do trigger, ao apagar as férias.
CREATE OR REPLACE FUNCTION public.timeoff_reassign_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF tg_op = 'DELETE' THEN
    PERFORM public.timeoff_apply_reassignment(old.id, old.driver_id, old.start_date, old.end_date, false);
    PERFORM set_config('app.system_reassign', 'on', true);
    RETURN old;
  END IF;
  PERFORM public.timeoff_apply_reassignment(new.id, new.driver_id, new.start_date, new.end_date, new.status = 'approved');
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS timeoff_reassign ON public.time_off;
CREATE TRIGGER timeoff_reassign
AFTER INSERT OR UPDATE OF start_date, end_date, status, driver_id ON public.time_off
FOR EACH ROW EXECUTE FUNCTION public.timeoff_reassign_trigger();

CREATE TRIGGER timeoff_reassign_delete
BEFORE DELETE ON public.time_off
FOR EACH ROW EXECUTE FUNCTION public.timeoff_reassign_trigger();