-- Agrega el tipo 'seguimiento' (recordatorio comercial) a las actividades de oportunidad

ALTER TABLE public.actividades_op DROP CONSTRAINT IF EXISTS actividades_op_tipo_check;
ALTER TABLE public.actividades_op
  ADD CONSTRAINT actividades_op_tipo_check
  CHECK (tipo IN ('comentario', 'actualizacion', 'abono', 'reclamo', 'seguimiento'));

COMMENT ON TABLE public.actividades_op IS 'Registro de bitácora y chat interno de oportunidades. Tipos soportados: comentario, actualizacion, abono, reclamo, seguimiento';
