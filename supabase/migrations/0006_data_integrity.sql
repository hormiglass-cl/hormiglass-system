-- 0006: Sincronización de borrado en cascada e integridad referencial de usuarios.

-- 1. Actualizar llaves foráneas a ON DELETE SET NULL / ON DELETE CASCADE
ALTER TABLE public.notas_actividad DROP CONSTRAINT IF EXISTS notas_actividad_usuario_id_fkey;
ALTER TABLE public.notas_actividad ADD CONSTRAINT notas_actividad_usuario_id_fkey
    FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.actividades_op DROP CONSTRAINT IF EXISTS actividades_op_usuario_id_fkey;
ALTER TABLE public.actividades_op ADD CONSTRAINT actividades_op_usuario_id_fkey
    FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.caja_movimientos DROP CONSTRAINT IF EXISTS caja_movimientos_usuario_id_fkey;
ALTER TABLE public.caja_movimientos ADD CONSTRAINT caja_movimientos_usuario_id_fkey
    FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_asignado_a_fkey;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_asignado_a_fkey
    FOREIGN KEY (asignado_a) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_created_by_fkey;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_usuario_id_fkey;
ALTER TABLE public.cotizaciones ADD CONSTRAINT cotizaciones_usuario_id_fkey
    FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.oportunidades DROP CONSTRAINT IF EXISTS oportunidades_asignado_a_fkey;
ALTER TABLE public.oportunidades ADD CONSTRAINT oportunidades_asignado_a_fkey
    FOREIGN KEY (asignado_a) REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_usuario_id_fkey;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_usuario_id_fkey
    FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;

-- 2. Función y Trigger de Borrado Atómico en Cascada (public.usuarios -> auth.users)
CREATE OR REPLACE FUNCTION public.handle_delete_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Desvincular explícitamente cualquier referencia en tablas dependientes
    UPDATE public.notas_actividad SET usuario_id = NULL WHERE usuario_id = OLD.id;
    UPDATE public.actividades_op SET usuario_id = NULL WHERE usuario_id = OLD.id;
    UPDATE public.caja_movimientos SET usuario_id = NULL WHERE usuario_id = OLD.id;
    UPDATE public.clientes SET asignado_a = NULL WHERE asignado_a = OLD.id;
    UPDATE public.clientes SET created_by = NULL WHERE created_by = OLD.id;
    UPDATE public.cotizaciones SET usuario_id = NULL WHERE usuario_id = OLD.id;
    UPDATE public.oportunidades SET asignado_a = NULL WHERE asignado_a = OLD.id;
    DELETE FROM public.notificaciones WHERE usuario_id = OLD.id;

    -- Eliminar registro correspondiente en auth.users si existe
    IF OLD.auth_id IS NOT NULL THEN
        DELETE FROM auth.users WHERE id = OLD.auth_id;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_public_user_deleted ON public.usuarios;
CREATE TRIGGER on_public_user_deleted
    BEFORE DELETE ON public.usuarios
    FOR EACH ROW EXECUTE FUNCTION public.handle_delete_user();
