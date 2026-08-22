-- 0015: Keep new Auth profiles aligned with current app roles (admin/user)

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.usuarios
    SET auth_id = NEW.id
    WHERE lower(email) = lower(NEW.email) AND auth_id IS NULL;

    IF NOT FOUND THEN
        INSERT INTO public.usuarios (auth_id, nombre, email, rol, activo)
        VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email), NEW.email, 'user', false);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
