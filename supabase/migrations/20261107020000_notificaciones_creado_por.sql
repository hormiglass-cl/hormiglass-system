-- Quién generó cada aviso. Se completa solo al insertar (también desde funciones RPC),
-- usando el usuario autenticado; si no hay sesión (bot, tareas automáticas) queda como "Sistema".
ALTER TABLE public.notificaciones ADD COLUMN IF NOT EXISTS creado_por text;

CREATE OR REPLACE FUNCTION public.notificaciones_set_creado_por()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.creado_por IS NULL OR NEW.creado_por = '' THEN
    SELECT u.nombre INTO NEW.creado_por FROM public.usuarios u WHERE u.auth_id = auth.uid() LIMIT 1;
    NEW.creado_por := COALESCE(NEW.creado_por, 'Sistema');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificaciones_creado_por ON public.notificaciones;
CREATE TRIGGER trg_notificaciones_creado_por
  BEFORE INSERT ON public.notificaciones
  FOR EACH ROW EXECUTE FUNCTION public.notificaciones_set_creado_por();
