-- 0003: Funciones helper para RLS por rol.
--
-- Reemplaza get_current_user_role(), que hoy:
--   (a) no tiene search_path fijo (function_search_path_mutable, WARN del linter),
--   (b) es invocable por anon/authenticated vía RPC (WARN del linter),
--   (c) falla ABIERTO a 'admin' cuando no encuentra usuario,
--   (d) tiene un bug de precedencia: `auth_id = auth.uid() OR id = auth.uid() AND activo = true`
--       evalúa como `auth_id = auth.uid() OR (id = auth.uid() AND activo)`, así que el
--       chequeo de `activo` NO aplica a la rama por auth_id.
-- No se usa en ninguna política hoy (confirmado), así que reemplazarla es seguro.
--
-- ⚠️ Aplicar junto con o después de 0002 (auth_link) y solo cuando ya haya al
-- menos un usuario con auth_id vinculado — antes de eso, current_usuario_id()
-- devolverá NULL para todos, lo cual es el comportamiento correcto (fail closed).

CREATE OR REPLACE FUNCTION public.current_usuario_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT id FROM public.usuarios WHERE auth_id = auth.uid() AND activo = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_rol()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT rol FROM public.usuarios WHERE auth_id = auth.uid() AND activo = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((SELECT true FROM public.usuarios WHERE auth_id = auth.uid() AND activo = true LIMIT 1), false);
$$;

-- admin pasa siempre, sin tener que listarlo en cada llamada.
CREATE OR REPLACE FUNCTION public.has_role(VARIADIC roles text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT public.current_rol() = ANY(roles) OR public.current_rol() = 'admin';
$$;

GRANT EXECUTE ON FUNCTION public.current_usuario_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_rol() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(text[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.current_usuario_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_rol() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_active_user() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(text[]) FROM anon, public;

-- get_current_user_role() queda revocada de anon/authenticated (deja de ser
-- invocable vía RPC) pero no se dropea todavía por si algo externo la referencia.
REVOKE EXECUTE ON FUNCTION public.get_current_user_role() FROM anon, authenticated, public;
