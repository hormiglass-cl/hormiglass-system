-- La base también fija perdida_at y perdida_por al insertar una oportunidad,
-- para que el cliente nunca elija la fecha ni el autor de una pérdida.

CREATE OR REPLACE FUNCTION public.registrar_oportunidad_perdida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.perdida_motivo IS NULL THEN
    -- Abierta o reabierta: se limpian todos los datos de la pérdida.
    NEW.perdida_at := NULL;
    NEW.perdida_detalle := NULL;
    NEW.perdida_por := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.perdida_motivo IS NULL THEN
    -- Marcar como perdida: fecha y autor los define la base.
    NEW.perdida_at := now();
    NEW.perdida_por := (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid() LIMIT 1);
  ELSE
    -- Editar el motivo de una oportunidad ya perdida conserva fecha y autor.
    NEW.perdida_at := OLD.perdida_at;
    NEW.perdida_por := OLD.perdida_por;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registrar_oportunidad_perdida ON public.oportunidades;
CREATE TRIGGER registrar_oportunidad_perdida
  BEFORE INSERT OR UPDATE OF perdida_motivo, perdida_detalle, perdida_at, perdida_por ON public.oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.registrar_oportunidad_perdida();
