-- ============================================================================
-- Migración: 20261106010000_unificar_personal_y_usuarios.sql
-- Fase 4: Unificación de Gestión de Personas (/rrhh + /configuracion)
--         y Limpieza de Tablas de Personal
-- ============================================================================
-- 1. Ajusta handle_sync_usuario_to_trabajador() para NO sobrescribir cargo,
--    área, RUT ni sueldo_base personalizados cuando ya existe ficha en RR.HH.
--    o cuando se actualiza el usuario en public.usuarios.
-- 2. Deduplica fichas provisorias (PROV-...) si existe ficha laboral real
--    para el mismo usuario_id o email.
-- 3. Migra referencias residuales de public.responsables_calendarios hacia
--    public.usuarios(id) y elimina la tabla legada responsables_calendarios.
-- ============================================================================

-- 1. Deduplicar fichas con RUT provisorio ('PROV-%' o '11.111.111-1') cuando ya
--    existe otra ficha real para el mismo usuario_id o correo electrónico
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      t_prov.id AS prov_id,
      t_real.id AS real_id,
      COALESCE(t_real.usuario_id, t_prov.usuario_id) AS merged_usuario_id
    FROM public.trabajadores t_prov
    JOIN public.trabajadores t_real
      ON t_real.id <> t_prov.id
     AND (
       (t_prov.usuario_id IS NOT NULL AND t_real.usuario_id = t_prov.usuario_id)
       OR (t_prov.email IS NOT NULL AND t_real.email IS NOT NULL AND lower(trim(t_real.email)) = lower(trim(t_prov.email)))
     )
    WHERE (t_prov.rut LIKE 'PROV-%' OR t_prov.rut = '11.111.111-1')
      AND t_real.rut NOT LIKE 'PROV-%'
      AND t_real.rut <> '11.111.111-1'
  LOOP
    -- Reasignar registros hijos eventuales antes de borrar el duplicado provisorio
    UPDATE public.trabajador_documentos SET trabajador_id = r.real_id WHERE trabajador_id = r.prov_id;
    UPDATE public.trabajador_permisos_ausencias SET trabajador_id = r.real_id WHERE trabajador_id = r.prov_id;
    UPDATE public.trabajador_liquidaciones_sueldos SET trabajador_id = r.real_id WHERE trabajador_id = r.prov_id;
    UPDATE public.trabajador_notas SET trabajador_id = r.real_id WHERE trabajador_id = r.prov_id;
    UPDATE public.trabajador_asistencia SET trabajador_id = r.real_id WHERE trabajador_id = r.prov_id;

    DELETE FROM public.trabajadores WHERE id = r.prov_id;

    UPDATE public.trabajadores
    SET usuario_id = r.merged_usuario_id,
        updated_at = now()
    WHERE id = r.real_id AND usuario_id IS DISTINCT FROM r.merged_usuario_id;
  END LOOP;
END $$;

-- 2. Actualizar trigger handle_sync_usuario_to_trabajador() para preservar
--    RUT, cargo, área y sueldo reales de RR.HH.
CREATE OR REPLACE FUNCTION public.handle_sync_usuario_to_trabajador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_default_cargo text;
  v_default_area text;
BEGIN
  v_default_cargo := CASE
    WHEN NEW.rol = 'admin' THEN 'Gerente General & Ventas'
    WHEN NEW.rol = 'mano_obra' THEN 'Operario / Mano de Obra'
    WHEN NEW.rol = 'finanzas' THEN 'Encargado de Finanzas & Caja'
    ELSE 'Ejecutivo Comercial & Ventas'
  END;

  v_default_area := CASE
    WHEN NEW.rol = 'mano_obra' THEN 'Operaciones & Terreno'
    WHEN NEW.rol = 'finanzas' THEN 'Finanzas & Administración'
    ELSE 'Comercial & Ventas'
  END;

  IF TG_OP = 'INSERT' THEN
    IF EXISTS (
      SELECT 1 FROM public.trabajadores
      WHERE usuario_id = NEW.id
         OR (NEW.email IS NOT NULL AND lower(trim(email)) = lower(trim(NEW.email)))
    ) THEN
      UPDATE public.trabajadores
      SET usuario_id = NEW.id,
          nombre = COALESCE(NULLIF(trim(NEW.nombre), ''), nombre),
          email = COALESCE(NULLIF(trim(NEW.email), ''), email),
          activo = COALESCE(NEW.activo, activo, true),
          cargo = COALESCE(NULLIF(trim(cargo), ''), v_default_cargo),
          area = COALESCE(NULLIF(trim(area), ''), v_default_area),
          updated_at = now()
      WHERE usuario_id = NEW.id
         OR (NEW.email IS NOT NULL AND lower(trim(email)) = lower(trim(NEW.email)));
    ELSE
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
        'PROV-' || UPPER(substr(replace(NEW.id::text, '-', ''), 1, 8)),
        NEW.email,
        v_default_cargo,
        v_default_area,
        'Indefinido',
        0,
        'disponible',
        COALESCE(NEW.activo, true),
        CURRENT_DATE,
        'San Bernardo',
        'Metropolitana de Santiago'
      );
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- En UPDATE sincronizamos nombre, email y estado activo, pero respetamos
    -- el cargo, área, RUT y sueldo_base configurados en la ficha de RR.HH.
    UPDATE public.trabajadores
    SET nombre = COALESCE(NULLIF(trim(NEW.nombre), ''), nombre),
        email = COALESCE(NULLIF(trim(NEW.email), ''), email),
        activo = COALESCE(NEW.activo, activo),
        cargo = COALESCE(NULLIF(trim(cargo), ''), v_default_cargo),
        area = COALESCE(NULLIF(trim(area), ''), v_default_area),
        updated_at = now()
    WHERE usuario_id = NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.trabajadores
    SET usuario_id = NULL,
        activo = false,
        updated_at = now()
    WHERE usuario_id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Migrar referencias residuales de responsables_calendarios hacia public.usuarios
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'responsables_calendarios'
  ) THEN
    -- Eliminar FKs antiguas que apunten a responsables_calendarios
    ALTER TABLE IF EXISTS public.visitas_terreno
      DROP CONSTRAINT IF EXISTS visitas_terreno_responsable_calendario_id_fkey;
    ALTER TABLE IF EXISTS public.eventos_produccion_logistica
      DROP CONSTRAINT IF EXISTS eventos_produccion_logistica_responsable_calendario_id_fkey;
    ALTER TABLE IF EXISTS public.produccion_diaria
      DROP CONSTRAINT IF EXISTS produccion_diaria_responsable_calendario_id_fkey;

    -- Mapear IDs de responsables_calendarios a usuarios por nombre
    UPDATE public.visitas_terreno v
    SET responsable_calendario_id = u.id,
        tecnico_id = COALESCE(v.tecnico_id, u.id)
    FROM public.responsables_calendarios rc
    JOIN public.usuarios u ON lower(trim(rc.nombre)) = lower(trim(u.nombre))
    WHERE v.responsable_calendario_id = rc.id;

    UPDATE public.eventos_produccion_logistica e
    SET responsable_calendario_id = u.id,
        responsable_id = COALESCE(e.responsable_id, u.id)
    FROM public.responsables_calendarios rc
    JOIN public.usuarios u ON lower(trim(rc.nombre)) = lower(trim(u.nombre))
    WHERE e.responsable_calendario_id = rc.id;

    UPDATE public.produccion_diaria pd
    SET responsable_calendario_id = u.id,
        responsable_id = COALESCE(pd.responsable_id, u.id)
    FROM public.responsables_calendarios rc
    JOIN public.usuarios u ON lower(trim(rc.nombre)) = lower(trim(u.nombre))
    WHERE pd.responsable_calendario_id = rc.id;

    -- Limpiar IDs huérfanos que no correspondan a public.usuarios
    UPDATE public.visitas_terreno
    SET responsable_calendario_id = NULL
    WHERE responsable_calendario_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = responsable_calendario_id);

    UPDATE public.eventos_produccion_logistica
    SET responsable_calendario_id = NULL
    WHERE responsable_calendario_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = responsable_calendario_id);

    UPDATE public.produccion_diaria
    SET responsable_calendario_id = NULL
    WHERE responsable_calendario_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = responsable_calendario_id);

    -- Apuntar FKs de responsable_calendario_id a public.usuarios(id)
    ALTER TABLE IF EXISTS public.visitas_terreno
      ADD CONSTRAINT visitas_terreno_responsable_calendario_id_fkey
      FOREIGN KEY (responsable_calendario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

    ALTER TABLE IF EXISTS public.eventos_produccion_logistica
      ADD CONSTRAINT eventos_produccion_logistica_responsable_calendario_id_fkey
      FOREIGN KEY (responsable_calendario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

    ALTER TABLE IF EXISTS public.produccion_diaria
      ADD CONSTRAINT produccion_diaria_responsable_calendario_id_fkey
      FOREIGN KEY (responsable_calendario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

    -- Eliminar tabla obsoleta responsables_calendarios
    DROP TABLE IF EXISTS public.responsables_calendarios CASCADE;
  END IF;
END $$;
