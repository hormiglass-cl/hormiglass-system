-- 0002: Vínculo auth.users ↔ public.usuarios.
--
-- Seguro de aplicar ahora: el backfill es un no-op mientras auth.users esté
-- vacía, y el trigger solo actúa sobre altas futuras. Los pasos 3 y 4
-- (UNIQUE + NOT NULL en auth_id) están comentados a propósito: NOT NULL
-- fallaría hoy mismo porque las 3 filas actuales tienen auth_id = NULL.
-- Ejecutarlos recién cuando la Fase 2 (invitar a los 3 usuarios) esté
-- confirmada al 100% — ver verificación al final de este archivo.

-- 1. Backfill idempotente: vincula por email cuando ya exista la cuenta de Auth.
CREATE OR REPLACE FUNCTION public.backfill_usuarios_auth_id()
RETURNS void AS $$
BEGIN
    UPDATE public.usuarios u
    SET auth_id = a.id
    FROM auth.users a
    WHERE lower(a.email) = lower(u.email) AND u.auth_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. Trigger: cuando se cree una cuenta de Auth (invitación aceptada, o
--    cualquier alta futura), vincula automáticamente o crea un perfil nuevo
--    con rol/activo seguros por defecto (fail closed: activo=false hasta que
--    un admin lo habilite).
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.usuarios
    SET auth_id = NEW.id
    WHERE lower(email) = lower(NEW.email) AND auth_id IS NULL;

    IF NOT FOUND THEN
        INSERT INTO public.usuarios (auth_id, nombre, email, rol, activo)
        VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email), NEW.email, 'ventas', false);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Ejecutar el backfill ahora (no-op hasta que existan cuentas de Auth).
SELECT public.backfill_usuarios_auth_id();

-- ============================================================
-- PASO PENDIENTE — ejecutar manualmente solo cuando:
--   SELECT count(*) FROM public.usuarios WHERE auth_id IS NULL;  -- = 0
--   SELECT count(*) FROM auth.users a
--     LEFT JOIN public.usuarios u ON u.auth_id = a.id
--     WHERE u.id IS NULL;                                        -- = 0
-- ============================================================
-- ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_auth_id_key UNIQUE (auth_id);
-- ALTER TABLE public.usuarios ALTER COLUMN auth_id SET NOT NULL;
-- CREATE INDEX IF NOT EXISTS idx_usuarios_auth_id ON public.usuarios(auth_id);
