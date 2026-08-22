-- Harden legacy helper functions flagged by Supabase advisors.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u_rol TEXT;
BEGIN
    SELECT rol
      INTO u_rol
      FROM public.usuarios
     WHERE auth_id = auth.uid()
       AND activo = true
     LIMIT 1;

    RETURN u_rol;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_current_user_role() FROM PUBLIC, anon, authenticated;
