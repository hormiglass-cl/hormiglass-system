-- Elevar Legal y Prevención de Riesgos a carpetas administrativas
-- y reemplazar la antigua seccion administracion_documentos por documentos.

ALTER TABLE public.recordatorios
  DROP CONSTRAINT IF EXISTS recordatorios_empresa_seccion_check;

ALTER TABLE public.administracion_documentos
  DROP CONSTRAINT IF EXISTS administracion_documentos_empresa_seccion_check;

UPDATE public.recordatorios
SET seccion = 'documentos'
WHERE seccion = 'administracion_documentos';

UPDATE public.administracion_documentos
SET seccion = CASE
  WHEN seccion = 'administracion_documentos' AND categoria = 'legal' THEN 'legal'
  WHEN seccion = 'administracion_documentos' AND categoria = 'prevencion_riesgo' THEN 'prevencion_riesgos'
  WHEN seccion = 'administracion_documentos' THEN 'documentos'
  ELSE seccion
END
WHERE seccion = 'administracion_documentos';

ALTER TABLE public.administracion_documentos
  ALTER COLUMN seccion SET DEFAULT 'documentos';

ALTER TABLE public.recordatorios
  ADD CONSTRAINT recordatorios_empresa_seccion_check
  CHECK (
    empresa IN ('comercial', 'transportes', 'inmobiliaria')
    AND seccion IN (
      'cuentas_por_cobrar',
      'sueldos_administrativos',
      'pendientes_generales',
      'contabilidad_impuestos',
      'finiquitos',
      'legal',
      'prevencion_riesgos',
      'documentos',
      'obras_faenas'
    )
  )
  NOT VALID;

ALTER TABLE public.recordatorios
  VALIDATE CONSTRAINT recordatorios_empresa_seccion_check;

ALTER TABLE public.administracion_documentos
  ADD CONSTRAINT administracion_documentos_empresa_seccion_check
  CHECK (
    empresa IN ('comercial', 'transportes', 'inmobiliaria')
    AND seccion IN (
      'cuentas_por_cobrar',
      'sueldos_administrativos',
      'pendientes_generales',
      'contabilidad_impuestos',
      'finiquitos',
      'legal',
      'prevencion_riesgos',
      'documentos',
      'obras_faenas'
    )
  )
  NOT VALID;

ALTER TABLE public.administracion_documentos
  VALIDATE CONSTRAINT administracion_documentos_empresa_seccion_check;
