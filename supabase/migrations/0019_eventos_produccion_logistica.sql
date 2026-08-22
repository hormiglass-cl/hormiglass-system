CREATE TABLE IF NOT EXISTS public.eventos_produccion_logistica (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidad_id UUID NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  planificacion_id UUID REFERENCES public.proyectos_planificacion(id) ON DELETE SET NULL,
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN ('fabricacion', 'instalacion', 'logistica')),
  titulo TEXT NOT NULL,
  fecha_evento DATE NOT NULL,
  hora_evento TEXT,
  responsable_id UUID REFERENCES public.personal_terreno(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'programado' CHECK (estado IN ('programado', 'en_proceso', 'completado', 'cancelado')),
  observaciones TEXT,
  registrado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_eventos_produccion_logistica_updated_at ON public.eventos_produccion_logistica;
CREATE TRIGGER trg_eventos_produccion_logistica_updated_at
BEFORE UPDATE ON public.eventos_produccion_logistica
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_eventos_prod_log_op ON public.eventos_produccion_logistica (oportunidad_id);
CREATE INDEX IF NOT EXISTS idx_eventos_prod_log_fecha ON public.eventos_produccion_logistica (fecha_evento DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_prod_log_tipo_fecha ON public.eventos_produccion_logistica (tipo_evento, fecha_evento);
CREATE INDEX IF NOT EXISTS idx_eventos_prod_log_responsable ON public.eventos_produccion_logistica (responsable_id);

ALTER TABLE public.eventos_produccion_logistica ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "eventos_produccion_logistica_select" ON public.eventos_produccion_logistica;
DROP POLICY IF EXISTS "eventos_produccion_logistica_write" ON public.eventos_produccion_logistica;
DROP POLICY IF EXISTS "eventos_produccion_logistica_delete" ON public.eventos_produccion_logistica;

CREATE POLICY "eventos_produccion_logistica_select" ON public.eventos_produccion_logistica
  FOR SELECT TO authenticated USING (is_active_user());

CREATE POLICY "eventos_produccion_logistica_write" ON public.eventos_produccion_logistica
  FOR ALL TO authenticated
  USING (has_role('ventas', 'programacion', 'administracion', 'admin'))
  WITH CHECK (has_role('ventas', 'programacion', 'administracion', 'admin'));

CREATE POLICY "eventos_produccion_logistica_delete" ON public.eventos_produccion_logistica
  FOR DELETE TO authenticated USING (has_role('programacion', 'administracion', 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eventos_produccion_logistica TO authenticated;
