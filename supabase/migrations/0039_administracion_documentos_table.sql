-- 0039: Metadata de documentos administrativos por empresa y categoría.
-- Los binarios viven en el bucket privado `administracion`.

CREATE TABLE IF NOT EXISTS public.administracion_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa TEXT NOT NULL
    CHECK (empresa IN ('comercial', 'transportes', 'inmobiliaria')),
  categoria TEXT NOT NULL
    CHECK (categoria IN ('general', 'prevencion_riesgo', 'legal')),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  bucket_id TEXT NOT NULL DEFAULT 'administracion',
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  subido_por_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  subido_por_nombre TEXT,
  eliminado BOOLEAN NOT NULL DEFAULT false,
  eliminado_en TIMESTAMPTZ,
  eliminado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS administracion_documentos_storage_path_key
  ON public.administracion_documentos (bucket_id, storage_path);

CREATE INDEX IF NOT EXISTS idx_administracion_documentos_empresa_categoria
  ON public.administracion_documentos (empresa, categoria, created_at DESC)
  WHERE eliminado = false;

DROP TRIGGER IF EXISTS trg_administracion_documentos_updated_at ON public.administracion_documentos;
CREATE TRIGGER trg_administracion_documentos_updated_at
  BEFORE UPDATE ON public.administracion_documentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.administracion_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "administracion_documentos_select" ON public.administracion_documentos;
DROP POLICY IF EXISTS "administracion_documentos_insert" ON public.administracion_documentos;
DROP POLICY IF EXISTS "administracion_documentos_update" ON public.administracion_documentos;
DROP POLICY IF EXISTS "administracion_documentos_delete" ON public.administracion_documentos;

CREATE POLICY "administracion_documentos_select" ON public.administracion_documentos
  FOR SELECT TO authenticated USING (public.has_role('admin'));

CREATE POLICY "administracion_documentos_insert" ON public.administracion_documentos
  FOR INSERT TO authenticated WITH CHECK (public.has_role('admin'));

CREATE POLICY "administracion_documentos_update" ON public.administracion_documentos
  FOR UPDATE TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

CREATE POLICY "administracion_documentos_delete" ON public.administracion_documentos
  FOR DELETE TO authenticated USING (public.has_role('admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.administracion_documentos TO authenticated;

COMMENT ON TABLE public.administracion_documentos IS 'Metadata de documentos de administración por empresa. Los archivos se almacenan en el bucket privado administracion.';
COMMENT ON COLUMN public.administracion_documentos.storage_path IS 'Ruta del objeto en Supabase Storage dentro del bucket administracion.';
