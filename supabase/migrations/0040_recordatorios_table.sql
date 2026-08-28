-- 0040: Recordatorios personales asignables por admin.

CREATE TABLE IF NOT EXISTS public.recordatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  asignado_a_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  creado_por_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  fecha_vencimiento DATE NOT NULL,
  recurrencia TEXT NOT NULL DEFAULT 'ninguna'
    CHECK (recurrencia IN ('ninguna', 'diaria', 'semanal', 'mensual')),
  recurrencia_dia_mes SMALLINT CHECK (recurrencia_dia_mes BETWEEN 1 AND 31),
  recurrencia_dia_semana SMALLINT CHECK (recurrencia_dia_semana BETWEEN 0 AND 6),
  completado BOOLEAN NOT NULL DEFAULT false,
  completado_en TIMESTAMPTZ,
  ultimo_completado_en TIMESTAMPTZ,
  veces_completado INTEGER NOT NULL DEFAULT 0 CHECK (veces_completado >= 0),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recordatorios_recurrencia_mensual_dia_check
    CHECK (recurrencia <> 'mensual' OR recurrencia_dia_mes IS NOT NULL),
  CONSTRAINT recordatorios_recurrencia_semanal_dia_check
    CHECK (recurrencia <> 'semanal' OR recurrencia_dia_semana IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_recordatorios_asignado_estado_fecha
  ON public.recordatorios (asignado_a_id, activo, completado, fecha_vencimiento);

CREATE INDEX IF NOT EXISTS idx_recordatorios_pendientes_fecha
  ON public.recordatorios (fecha_vencimiento)
  WHERE activo = true AND completado = false;

CREATE INDEX IF NOT EXISTS idx_recordatorios_creado_por
  ON public.recordatorios (creado_por_id);

DROP TRIGGER IF EXISTS trg_recordatorios_updated_at ON public.recordatorios;
CREATE TRIGGER trg_recordatorios_updated_at
  BEFORE UPDATE ON public.recordatorios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.recordatorios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recordatorios_select" ON public.recordatorios;
DROP POLICY IF EXISTS "recordatorios_insert" ON public.recordatorios;
DROP POLICY IF EXISTS "recordatorios_update" ON public.recordatorios;
DROP POLICY IF EXISTS "recordatorios_delete" ON public.recordatorios;

CREATE POLICY "recordatorios_select" ON public.recordatorios
  FOR SELECT TO authenticated
  USING (asignado_a_id = public.current_usuario_id() OR public.has_role('admin'));

CREATE POLICY "recordatorios_insert" ON public.recordatorios
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role('admin'));

CREATE POLICY "recordatorios_update" ON public.recordatorios
  FOR UPDATE TO authenticated
  USING (asignado_a_id = public.current_usuario_id() OR public.has_role('admin'))
  WITH CHECK (asignado_a_id = public.current_usuario_id() OR public.has_role('admin'));

CREATE POLICY "recordatorios_delete" ON public.recordatorios
  FOR DELETE TO authenticated
  USING (public.has_role('admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recordatorios TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.recordatorios;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

COMMENT ON TABLE public.recordatorios IS 'Recordatorios y planificación personal asignada por administración.';
