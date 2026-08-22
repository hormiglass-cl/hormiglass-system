-- ==============================================================================
-- Migración 0035: Sincronización Automática Bidireccional Usuarios <-> Trabajadores (RR.HH.)
-- ==============================================================================

-- 1. Sincronizar todos los usuarios existentes en public.usuarios que no tengan ficha en trabajadores
INSERT INTO public.trabajadores (
  id,
  usuario_id,
  nombre,
  rut,
  email,
  cargo,
  area,
  tipo_contrato,
  sueldo_base,
  estado_disponibilidad,
  activo,
  fecha_ingreso,
  comuna,
  region
)
SELECT 
  gen_random_uuid(),
  u.id,
  u.nombre,
  '11.111.111-1',
  u.email,
  CASE 
    WHEN u.rol = 'admin' THEN 'Gerente General & Ventas'
    WHEN u.rol = 'mano_obra' THEN 'Operario / Mano de Obra'
    ELSE 'Ejecutivo Comercial & Ventas'
  END,
  CASE 
    WHEN u.rol = 'mano_obra' THEN 'Operaciones & Terreno'
    ELSE 'Comercial & Ventas'
  END,
  'Indefinido',
  950000,
  'disponible',
  u.activo,
  CURRENT_DATE,
  'San Bernardo',
  'Metropolitana de Santiago'
FROM public.usuarios u
WHERE NOT EXISTS (
  SELECT 1 FROM public.trabajadores t WHERE t.usuario_id = u.id OR lower(t.email) = lower(u.email)
);

-- Asegurar que cualquier trabajador existente con email coincidente tenga usuario_id asignado
UPDATE public.trabajadores t
SET usuario_id = u.id
FROM public.usuarios u
WHERE (lower(t.email) = lower(u.email) OR lower(t.nombre) = lower(u.nombre))
  AND t.usuario_id IS NULL;

-- 2. Función Trigger: Sincronizar automáticamente de public.usuarios a public.trabajadores
CREATE OR REPLACE FUNCTION public.handle_sync_usuario_to_trabajador()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Si no existe trabajador con ese usuario_id o email, crearlo
    IF NOT EXISTS (SELECT 1 FROM public.trabajadores WHERE usuario_id = NEW.id OR lower(email) = lower(NEW.email)) THEN
      INSERT INTO public.trabajadores (
        usuario_id,
        nombre,
        rut,
        email,
        cargo,
        area,
        tipo_contrato,
        sueldo_base,
        estado_disponibilidad,
        activo,
        fecha_ingreso,
        comuna,
        region
      ) VALUES (
        NEW.id,
        NEW.nombre,
        '11.111.111-1',
        NEW.email,
        CASE 
          WHEN NEW.rol = 'admin' THEN 'Gerente General & Ventas'
          WHEN NEW.rol = 'mano_obra' THEN 'Operario / Mano de Obra'
          ELSE 'Ejecutivo Comercial & Ventas'
        END,
        CASE 
          WHEN NEW.rol = 'mano_obra' THEN 'Operaciones & Terreno'
          ELSE 'Comercial & Ventas'
        END,
        'Indefinido',
        950000,
        'disponible',
        NEW.activo,
        CURRENT_DATE,
        'San Bernardo',
        'Metropolitana de Santiago'
      );
    ELSE
      -- Si ya existía por email, asegurar el usuario_id y estado activo
      UPDATE public.trabajadores
      SET usuario_id = NEW.id,
          nombre = NEW.nombre,
          activo = NEW.activo,
          updated_at = now()
      WHERE usuario_id = NEW.id OR lower(email) = lower(NEW.email);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.trabajadores
    SET nombre = NEW.nombre,
        email = NEW.email,
        activo = NEW.activo,
        updated_at = now()
    WHERE usuario_id = NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    -- Desactivar o eliminar el trabajador asociado
    UPDATE public.trabajadores
    SET activo = false,
        updated_at = now()
    WHERE usuario_id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Crear el Trigger en public.usuarios
DROP TRIGGER IF EXISTS trg_sync_usuario_to_trabajador ON public.usuarios;
CREATE TRIGGER trg_sync_usuario_to_trabajador
AFTER INSERT OR UPDATE OR DELETE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.handle_sync_usuario_to_trabajador();
