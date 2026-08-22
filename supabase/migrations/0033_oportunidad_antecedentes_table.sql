-- 0033: Antecedentes de oportunidad con historial en Supabase.
-- Los archivos viven en Supabase Storage (bucket documentos) y la metadata
-- auditable vive en public.oportunidad_antecedentes.

CREATE TABLE IF NOT EXISTS public.oportunidad_antecedentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidad_id UUID NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'otro'
    CHECK (tipo IN ('contrato', 'anexo', 'documento_empresa', 'documento_trabajador', 'otro')),
  bucket_id TEXT NOT NULL DEFAULT 'documentos',
  storage_path TEXT NOT NULL,
  public_url TEXT,
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

CREATE UNIQUE INDEX IF NOT EXISTS oportunidad_antecedentes_storage_path_key
  ON public.oportunidad_antecedentes (bucket_id, storage_path);

CREATE INDEX IF NOT EXISTS idx_oportunidad_antecedentes_oportunidad
  ON public.oportunidad_antecedentes (oportunidad_id, eliminado, created_at DESC);

INSERT INTO public.oportunidad_antecedentes (
  oportunidad_id,
  nombre,
  tipo,
  bucket_id,
  storage_path,
  public_url,
  subido_por_nombre,
  created_at
)
SELECT
  o.id,
  COALESCE(doc.value->>'nombre', 'Antecedente migrado'),
  CASE
    WHEN doc.value->>'tipo' IN ('contrato', 'anexo', 'documento_empresa', 'documento_trabajador', 'otro')
      THEN doc.value->>'tipo'
    ELSE 'otro'
  END,
  'documentos',
  COALESCE(
    NULLIF(doc.value->>'storage_path', ''),
    'legacy-antecedentes/' || o.id::text || '/' || COALESCE(NULLIF(doc.value->>'id', ''), md5(doc.value::text))
  ),
  NULLIF(doc.value->>'url', ''),
  COALESCE(NULLIF(doc.value->>'subido_por', ''), 'Migración'),
  CASE
    WHEN (doc.value->>'fecha_iso') ~ '^\d{4}-\d{2}-\d{2}'
      THEN (doc.value->>'fecha_iso')::timestamptz
    ELSE NOW()
  END
FROM public.oportunidades o
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(o.antecedentes) = 'array' THEN o.antecedentes
    ELSE '[]'::jsonb
  END
) AS doc(value)
ON CONFLICT (bucket_id, storage_path) DO NOTHING;

DROP TRIGGER IF EXISTS trg_oportunidad_antecedentes_updated_at ON public.oportunidad_antecedentes;
CREATE TRIGGER trg_oportunidad_antecedentes_updated_at
  BEFORE UPDATE ON public.oportunidad_antecedentes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.oportunidad_antecedentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oportunidad_antecedentes_select" ON public.oportunidad_antecedentes;
DROP POLICY IF EXISTS "oportunidad_antecedentes_insert" ON public.oportunidad_antecedentes;
DROP POLICY IF EXISTS "oportunidad_antecedentes_update" ON public.oportunidad_antecedentes;
DROP POLICY IF EXISTS "oportunidad_antecedentes_delete" ON public.oportunidad_antecedentes;

CREATE POLICY "oportunidad_antecedentes_select" ON public.oportunidad_antecedentes
  FOR SELECT TO authenticated USING (is_active_user());

CREATE POLICY "oportunidad_antecedentes_insert" ON public.oportunidad_antecedentes
  FOR INSERT TO authenticated WITH CHECK (has_role('user'));

CREATE POLICY "oportunidad_antecedentes_update" ON public.oportunidad_antecedentes
  FOR UPDATE TO authenticated
  USING (has_role('user'))
  WITH CHECK (has_role('user'));

CREATE POLICY "oportunidad_antecedentes_delete" ON public.oportunidad_antecedentes
  FOR DELETE TO authenticated USING (has_role('admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oportunidad_antecedentes TO authenticated;

COMMENT ON TABLE public.oportunidad_antecedentes IS 'Metadata e historial de antecedentes/documentos subidos por oportunidad. El binario se almacena en Supabase Storage.';
COMMENT ON COLUMN public.oportunidad_antecedentes.storage_path IS 'Ruta del objeto en Supabase Storage dentro del bucket indicado.';
