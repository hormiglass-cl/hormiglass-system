-- Uniformar secciones administrativas entre las tres empresas.

ALTER TABLE public.recordatorios
  DROP CONSTRAINT IF EXISTS recordatorios_empresa_seccion_check;

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
      'administracion_documentos',
      'obras_faenas'
    )
  )
  NOT VALID;

ALTER TABLE public.recordatorios
  VALIDATE CONSTRAINT recordatorios_empresa_seccion_check;

ALTER TABLE public.administracion_documentos
  DROP CONSTRAINT IF EXISTS administracion_documentos_empresa_seccion_check;

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
      'administracion_documentos',
      'obras_faenas'
    )
  )
  NOT VALID;

ALTER TABLE public.administracion_documentos
  VALIDATE CONSTRAINT administracion_documentos_empresa_seccion_check;
