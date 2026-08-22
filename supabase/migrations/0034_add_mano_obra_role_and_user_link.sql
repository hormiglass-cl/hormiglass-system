-- ==============================================================================
-- Migración 0034: Rol 'mano_obra' y Vinculación Estricta de Trabajadores a Usuarios
-- ==============================================================================

-- 1. Actualizar CHECK constraint en usuarios para permitir 'mano_obra'
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin', 'user', 'mano_obra'));

-- 2. Asegurar que trabajadores tenga FK e índice a usuarios
CREATE INDEX IF NOT EXISTS idx_trabajadores_usuario_id ON public.trabajadores(usuario_id);

-- 3. Vincular los trabajadores existentes con sus usuarios correspondientes por email o nombre
UPDATE public.trabajadores t
SET usuario_id = u.id
FROM public.usuarios u
WHERE t.usuario_id IS NULL AND (t.email = u.email OR lower(t.nombre) = lower(u.nombre));

-- 4. Actualizar RLS policies para asegurar acceso de 'mano_obra' a RR.HH. y Calendarios
-- trabajadores
DROP POLICY IF EXISTS "trabajadores_select" ON public.trabajadores;
CREATE POLICY "trabajadores_select" ON public.trabajadores FOR SELECT USING (public.is_active_user());

DROP POLICY IF EXISTS "trabajadores_insert" ON public.trabajadores;
CREATE POLICY "trabajadores_insert" ON public.trabajadores FOR INSERT WITH CHECK (public.has_role('admin', 'user'));

DROP POLICY IF EXISTS "trabajadores_update" ON public.trabajadores;
CREATE POLICY "trabajadores_update" ON public.trabajadores FOR UPDATE USING (public.is_active_user()) WITH CHECK (public.is_active_user());

DROP POLICY IF EXISTS "trabajadores_delete" ON public.trabajadores;
CREATE POLICY "trabajadores_delete" ON public.trabajadores FOR DELETE USING (public.has_role('admin', 'user'));

-- eventos_produccion_logistica y visitas_terreno: permitir SELECT a cualquier usuario activo (incluyendo mano_obra)
DROP POLICY IF EXISTS "eventos_prod_log_select" ON public.eventos_produccion_logistica;
CREATE POLICY "eventos_prod_log_select" ON public.eventos_produccion_logistica FOR SELECT USING (public.is_active_user());

DROP POLICY IF EXISTS "visitas_terreno_select" ON public.visitas_terreno;
CREATE POLICY "visitas_terreno_select" ON public.visitas_terreno FOR SELECT USING (public.is_active_user());
