-- 0029_antecedentes_oportunidad.sql
-- Documentación y antecedentes requeridos en la oportunidad de venta.

ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS requiere_antecedentes BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS antecedentes JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.oportunidades.requiere_antecedentes IS 'Indica si el cliente requiere documentación previa (contratos, anexos, trabajadores)';
COMMENT ON COLUMN public.oportunidades.antecedentes IS 'Lista de documentos antecedentes adjuntos (id, nombre, tipo, url, fecha_iso, subido_por)';
