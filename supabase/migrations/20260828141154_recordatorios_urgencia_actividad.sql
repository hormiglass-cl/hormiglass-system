-- 0042: Clasificacion de urgencia e historial de actividad para tasks administrativas.

ALTER TABLE public.recordatorios
  ADD COLUMN IF NOT EXISTS urgencia TEXT NOT NULL DEFAULT 'media';

ALTER TABLE public.recordatorios
  DROP CONSTRAINT IF EXISTS recordatorios_urgencia_check;

ALTER TABLE public.recordatorios
  ADD CONSTRAINT recordatorios_urgencia_check
  CHECK (urgencia IN ('baja', 'media', 'alta', 'critica'))
  NOT VALID;

UPDATE public.recordatorios
SET urgencia = 'media'
WHERE urgencia IS NULL
  OR urgencia NOT IN ('baja', 'media', 'alta', 'critica');

ALTER TABLE public.recordatorios
  VALIDATE CONSTRAINT recordatorios_urgencia_check;

CREATE INDEX IF NOT EXISTS idx_recordatorios_empresa_urgencia_estado_fecha
  ON public.recordatorios (empresa, urgencia, estado, fecha_vencimiento)
  WHERE activo = true;

CREATE TABLE IF NOT EXISTS public.recordatorio_actividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recordatorio_id UUID NOT NULL REFERENCES public.recordatorios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'comentario'
    CHECK (tipo IN ('comentario', 'creacion', 'estado_cambiado', 'urgencia_cambiada', 'actualizacion')),
  contenido TEXT NOT NULL,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  usuario_nombre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recordatorio_actividades_recordatorio_fecha
  ON public.recordatorio_actividades (recordatorio_id, created_at DESC);

ALTER TABLE public.recordatorio_actividades ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.recordatorio_actividades FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.recordatorio_actividades TO authenticated;

DROP POLICY IF EXISTS "recordatorio_actividades_select" ON public.recordatorio_actividades;
DROP POLICY IF EXISTS "recordatorio_actividades_insert" ON public.recordatorio_actividades;
DROP POLICY IF EXISTS "recordatorio_actividades_delete" ON public.recordatorio_actividades;

CREATE POLICY "recordatorio_actividades_select" ON public.recordatorio_actividades
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recordatorios r
      WHERE r.id = recordatorio_actividades.recordatorio_id
        AND (r.asignado_a_id = public.current_usuario_id() OR public.has_role('admin'))
    )
  );

CREATE POLICY "recordatorio_actividades_insert" ON public.recordatorio_actividades
  FOR INSERT TO authenticated
  WITH CHECK (
    (usuario_id IS NULL OR usuario_id = public.current_usuario_id() OR public.has_role('admin'))
    AND EXISTS (
      SELECT 1
      FROM public.recordatorios r
      WHERE r.id = recordatorio_actividades.recordatorio_id
        AND (r.asignado_a_id = public.current_usuario_id() OR public.has_role('admin'))
    )
  );

CREATE POLICY "recordatorio_actividades_delete" ON public.recordatorio_actividades
  FOR DELETE TO authenticated
  USING (public.has_role('admin'));

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.recordatorio_actividades;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

COMMENT ON COLUMN public.recordatorios.urgencia IS 'Clasificacion operativa de urgencia para tasks y recordatorios.';
COMMENT ON TABLE public.recordatorio_actividades IS 'Historial y comentarios de tasks administrativas.';
