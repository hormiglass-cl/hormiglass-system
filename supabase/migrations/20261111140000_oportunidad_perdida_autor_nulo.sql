-- El autor de una pérdida puede quedar en NULL (por ejemplo, al borrar el usuario con
-- ON DELETE SET NULL), pero nunca puede reemplazarse por otro usuario.

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
    -- Ya perdida: se conserva la fecha; el autor solo puede conservarse o quedar vacío.
    NEW.perdida_at := OLD.perdida_at;
    NEW.perdida_por := CASE WHEN NEW.perdida_por IS NULL THEN NULL ELSE OLD.perdida_por END;
  END IF;
  RETURN NEW;
END;
$$;
