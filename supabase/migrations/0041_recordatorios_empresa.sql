-- 0041: Asociar recordatorios a una empresa del grupo y sumar estado operativo.

ALTER TABLE public.recordatorios
  ADD COLUMN IF NOT EXISTS empresa TEXT NOT NULL DEFAULT 'inmobiliaria'
  CHECK (empresa IN ('comercial', 'transportes', 'inmobiliaria'));

ALTER TABLE public.recordatorios
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'por_hacer';

ALTER TABLE public.recordatorios
  DROP CONSTRAINT IF EXISTS recordatorios_estado_check;

ALTER TABLE public.recordatorios
  ADD CONSTRAINT recordatorios_estado_check
  CHECK (estado IN ('por_hacer', 'en_curso', 'requiere_actualizacion', 'completada'))
  NOT VALID;

UPDATE public.recordatorios
SET estado = 'completada'
WHERE completado = true
  AND estado <> 'completada';

ALTER TABLE public.recordatorios
  VALIDATE CONSTRAINT recordatorios_estado_check;

CREATE INDEX IF NOT EXISTS idx_recordatorios_empresa_asignado_estado_fecha
  ON public.recordatorios (empresa, asignado_a_id, activo, completado, fecha_vencimiento);

CREATE INDEX IF NOT EXISTS idx_recordatorios_empresa_estado_fecha
  ON public.recordatorios (empresa, estado, fecha_vencimiento)
  WHERE activo = true;
