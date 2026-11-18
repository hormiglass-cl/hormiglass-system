-- Only an admin may change an opportunity's assigned seller (asignado_a).
-- The UPDATE policy lets every active user edit opportunities, so the rule lives in a trigger.
-- It stops direct table writes from signed-in non-admins (PostgREST runs them as the
-- "authenticated" role). Trusted server paths keep assigning sellers: the service role (the
-- WhatsApp receiver runs as it) and SECURITY DEFINER functions run as another role, and lead
-- intake only inserts, which this UPDATE trigger does not cover.
BEGIN;
CREATE FUNCTION public.proteger_vendedor_asignado() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.asignado_a IS DISTINCT FROM OLD.asignado_a
     AND current_user IN ('authenticated', 'anon')
     AND public.current_rol() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'solo_admin_reasigna'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Solo un administrador puede cambiar el vendedor asignado.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.proteger_vendedor_asignado() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER proteger_vendedor_asignado
  BEFORE UPDATE OF asignado_a ON public.oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.proteger_vendedor_asignado();
COMMIT;
