-- 0011: Registro de producción diaria por oportunidad y producto (ajuste 11.2)

CREATE TABLE IF NOT EXISTS public.produccion_diaria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidad_id UUID NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  cotizacion_id UUID REFERENCES public.cotizaciones(id),
  cotizacion_item_id UUID REFERENCES public.cotizacion_items(id) ON DELETE SET NULL,
  producto TEXT NOT NULL,
  cantidad_producida NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cantidad_producida >= 0),
  fecha_produccion DATE NOT NULL DEFAULT CURRENT_DATE,
  responsable_id UUID REFERENCES public.personal_terreno(id),
  observaciones TEXT,
  registrado_por UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_produccion_diaria_updated_at ON public.produccion_diaria;
CREATE TRIGGER trg_produccion_diaria_updated_at
BEFORE UPDATE ON public.produccion_diaria
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_produccion_diaria_oportunidad ON public.produccion_diaria (oportunidad_id);
CREATE INDEX IF NOT EXISTS idx_produccion_diaria_fecha       ON public.produccion_diaria (fecha_produccion DESC);
CREATE INDEX IF NOT EXISTS idx_produccion_diaria_op_prod     ON public.produccion_diaria (oportunidad_id, producto);

ALTER TABLE public.produccion_diaria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "produccion_diaria_select" ON public.produccion_diaria;
DROP POLICY IF EXISTS "produccion_diaria_write"  ON public.produccion_diaria;
DROP POLICY IF EXISTS "produccion_diaria_delete" ON public.produccion_diaria;

CREATE POLICY "produccion_diaria_select" ON public.produccion_diaria
  FOR SELECT TO authenticated USING (is_active_user());

CREATE POLICY "produccion_diaria_write" ON public.produccion_diaria
  FOR ALL TO authenticated
  USING (has_role('admin', 'administracion', 'programacion'))
  WITH CHECK (has_role('admin', 'administracion', 'programacion'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.produccion_diaria TO authenticated;
