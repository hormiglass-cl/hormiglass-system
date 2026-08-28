-- Clasificacion de tasks administrativas por seccion fija de empresa.

ALTER TABLE public.recordatorios
  ADD COLUMN IF NOT EXISTS seccion TEXT NOT NULL DEFAULT 'pendientes_generales';

ALTER TABLE public.recordatorios
  DROP CONSTRAINT IF EXISTS recordatorios_empresa_seccion_check;

ALTER TABLE public.recordatorios
  ADD CONSTRAINT recordatorios_empresa_seccion_check
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

ALTER TABLE public.recordatorios
  VALIDATE CONSTRAINT recordatorios_empresa_seccion_check;

CREATE INDEX IF NOT EXISTS idx_recordatorios_empresa_seccion_estado_fecha
  ON public.recordatorios (empresa, seccion, estado, fecha_vencimiento)
  WHERE activo = true;

COMMENT ON COLUMN public.recordatorios.seccion IS 'Seccion administrativa fija por empresa para clasificar tasks y recordatorios.';
