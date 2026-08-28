-- Clasificacion de documentos administrativos por seccion fija de empresa.

ALTER TABLE public.administracion_documentos
  ADD COLUMN IF NOT EXISTS seccion TEXT NOT NULL DEFAULT 'administracion_documentos';

ALTER TABLE public.administracion_documentos
  DROP CONSTRAINT IF EXISTS administracion_documentos_empresa_seccion_check;

ALTER TABLE public.administracion_documentos
  ADD CONSTRAINT administracion_documentos_empresa_seccion_check
  CHECK (
    (
      empresa = 'inmobiliaria'
      AND seccion IN (
        'cuentas_por_cobrar',
        'sueldos_administrativos',
        'pendientes_generales',
        'contabilidad_impuestos',
        'finiquitos',
        'administracion_documentos',
        'obras_faenas'
      )
    )
    OR (
      empresa = 'comercial'
      AND seccion IN (
        'administracion_documentos',
        'pendientes_generales',
        'contabilidad_impuestos',
        'finiquitos'
      )
    )
    OR (
      empresa = 'transportes'
      AND seccion IN (
        'sueldos_administrativos',
        'pendientes_generales',
        'contabilidad_impuestos',
        'administracion_documentos',
        'finiquitos'
      )
    )
  )
  NOT VALID;

ALTER TABLE public.administracion_documentos
  VALIDATE CONSTRAINT administracion_documentos_empresa_seccion_check;

CREATE INDEX IF NOT EXISTS idx_administracion_documentos_empresa_seccion_categoria
  ON public.administracion_documentos (empresa, seccion, categoria, created_at DESC)
  WHERE eliminado = false;

COMMENT ON COLUMN public.administracion_documentos.seccion IS 'Seccion administrativa fija por empresa donde vive el documento.';
