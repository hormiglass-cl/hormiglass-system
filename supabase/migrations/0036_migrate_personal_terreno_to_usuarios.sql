-- ==============================================================================
-- Migración 0036: Migración y Eliminación de personal_terreno a public.usuarios
-- ==============================================================================

-- 1. Agregar columnas de configuración de calendarios a public.usuarios
ALTER TABLE public.usuarios 
  ADD COLUMN IF NOT EXISTS calendario_visitas BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS calendario_produccion BOOLEAN DEFAULT true;

-- 2. Eliminar las FKs que apuntan a personal_terreno ANTES del update
ALTER TABLE public.visitas_terreno DROP CONSTRAINT IF EXISTS visitas_terreno_tecnico_id_fkey;
ALTER TABLE public.eventos_produccion_logistica DROP CONSTRAINT IF EXISTS eventos_produccion_logistica_responsable_id_fkey;
ALTER TABLE public.oportunidades DROP CONSTRAINT IF EXISTS oportunidades_tecnico_id_fkey;
ALTER TABLE public.produccion_diaria DROP CONSTRAINT IF EXISTS produccion_diaria_responsable_id_fkey;
ALTER TABLE public.proyectos_planificacion DROP CONSTRAINT IF EXISTS proyectos_planificacion_cuadrilla_id_fkey;
ALTER TABLE public.proyectos_planificacion DROP CONSTRAINT IF EXISTS proyectos_planificacion_encargado_fabricacion_id_fkey;

-- 3. Migrar IDs de personal_terreno a los IDs correspondientes en public.usuarios
UPDATE public.visitas_terreno v
SET tecnico_id = u.id
FROM public.personal_terreno pt
JOIN public.usuarios u ON lower(trim(pt.nombre)) = lower(trim(u.nombre))
WHERE v.tecnico_id = pt.id;

UPDATE public.eventos_produccion_logistica e
SET responsable_id = u.id
FROM public.personal_terreno pt
JOIN public.usuarios u ON lower(trim(pt.nombre)) = lower(trim(u.nombre))
WHERE e.responsable_id = pt.id;

UPDATE public.oportunidades o
SET tecnico_id = u.id
FROM public.personal_terreno pt
JOIN public.usuarios u ON lower(trim(pt.nombre)) = lower(trim(u.nombre))
WHERE o.tecnico_id = pt.id;

UPDATE public.produccion_diaria pd
SET responsable_id = u.id
FROM public.personal_terreno pt
JOIN public.usuarios u ON lower(trim(pt.nombre)) = lower(trim(u.nombre))
WHERE pd.responsable_id = pt.id;

UPDATE public.proyectos_planificacion pp
SET cuadrilla_id = u.id
FROM public.personal_terreno pt
JOIN public.usuarios u ON lower(trim(pt.nombre)) = lower(trim(u.nombre))
WHERE pp.cuadrilla_id = pt.id;

UPDATE public.proyectos_planificacion pp
SET encargado_fabricacion_id = u.id
FROM public.personal_terreno pt
JOIN public.usuarios u ON lower(trim(pt.nombre)) = lower(trim(u.nombre))
WHERE pp.encargado_fabricacion_id = pt.id;

-- 4. Limpiar cualquier ID residual que no exista en usuarios
UPDATE public.visitas_terreno SET tecnico_id = NULL WHERE tecnico_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = tecnico_id);
UPDATE public.eventos_produccion_logistica SET responsable_id = NULL WHERE responsable_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = responsable_id);
UPDATE public.oportunidades SET tecnico_id = NULL WHERE tecnico_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = tecnico_id);
UPDATE public.produccion_diaria SET responsable_id = NULL WHERE responsable_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = responsable_id);
UPDATE public.proyectos_planificacion SET cuadrilla_id = NULL WHERE cuadrilla_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = cuadrilla_id);
UPDATE public.proyectos_planificacion SET encargado_fabricacion_id = NULL WHERE encargado_fabricacion_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = encargado_fabricacion_id);

-- 5. Crear las nuevas FKs apuntando a public.usuarios
ALTER TABLE public.visitas_terreno ADD CONSTRAINT visitas_terreno_tecnico_id_fkey FOREIGN KEY (tecnico_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;
ALTER TABLE public.eventos_produccion_logistica ADD CONSTRAINT eventos_produccion_logistica_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;
ALTER TABLE public.oportunidades ADD CONSTRAINT oportunidades_tecnico_id_fkey FOREIGN KEY (tecnico_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;
ALTER TABLE public.produccion_diaria ADD CONSTRAINT produccion_diaria_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;
ALTER TABLE public.proyectos_planificacion ADD CONSTRAINT proyectos_planificacion_cuadrilla_id_fkey FOREIGN KEY (cuadrilla_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;
ALTER TABLE public.proyectos_planificacion ADD CONSTRAINT proyectos_planificacion_encargado_fabricacion_id_fkey FOREIGN KEY (encargado_fabricacion_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

-- 6. Eliminar la tabla obsoleta personal_terreno
DROP TABLE IF EXISTS public.personal_terreno CASCADE;
