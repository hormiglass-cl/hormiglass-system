-- 0028_calendario_contexto_reventa.sql
-- Diferenciación de calendarios (Producción/Logística vs Reventa/Logística), fechas con hora de término y 5 estados.

ALTER TABLE public.eventos_produccion_logistica
  ADD COLUMN IF NOT EXISTS contexto TEXT NOT NULL DEFAULT 'produccion_logistica'
    CHECK (contexto IN ('produccion_logistica', 'reventa_logistica')),
  ADD COLUMN IF NOT EXISTS fecha_inicio TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_fin TIMESTAMPTZ;

-- Backfill fecha_inicio y fecha_fin desde fecha_evento y hora_evento si existen
UPDATE public.eventos_produccion_logistica
   SET fecha_inicio = (fecha_evento::timestamptz + COALESCE(hora_evento::time, '08:00')::interval),
       fecha_fin    = (fecha_evento::timestamptz + COALESCE(hora_evento::time, '08:00')::interval + interval '1 hour')
 WHERE fecha_inicio IS NULL;

-- Asignar default now() si todavía hay nulos
UPDATE public.eventos_produccion_logistica
   SET fecha_inicio = NOW(),
       fecha_fin = NOW() + interval '1 hour'
 WHERE fecha_inicio IS NULL;

ALTER TABLE public.eventos_produccion_logistica
  ALTER COLUMN fecha_inicio SET NOT NULL,
  ALTER COLUMN fecha_fin SET NOT NULL;

-- Reemplazar tipo_evento por las 4 categorías requeridas
ALTER TABLE public.eventos_produccion_logistica DROP CONSTRAINT IF EXISTS eventos_produccion_logistica_tipo_evento_check;
UPDATE public.eventos_produccion_logistica SET tipo_evento = 'obra' WHERE tipo_evento = 'instalacion';
UPDATE public.eventos_produccion_logistica SET tipo_evento = 'produccion' WHERE tipo_evento = 'fabricacion';
ALTER TABLE public.eventos_produccion_logistica
  ADD CONSTRAINT eventos_produccion_logistica_tipo_evento_check
  CHECK (tipo_evento IN ('obra', 'produccion', 'reventa', 'logistica'));

-- Reemplazar estado por los 5 valores requeridos
ALTER TABLE public.eventos_produccion_logistica DROP CONSTRAINT IF EXISTS eventos_produccion_logistica_estado_check;
UPDATE public.eventos_produccion_logistica SET estado = 'por_hacer' WHERE estado IN ('programado', 'pendiente', 'cola_produccion');
UPDATE public.eventos_produccion_logistica SET estado = 'en_curso' WHERE estado IN ('en_proceso', 'fabricacion', 'instalacion', 'coordinacion');
UPDATE public.eventos_produccion_logistica SET estado = 'completado' WHERE estado IN ('finalizado', 'entregado', 'despachado', 'listo_instalacion');
UPDATE public.eventos_produccion_logistica SET estado = 'no_realizado' WHERE estado = 'cancelado';
ALTER TABLE public.eventos_produccion_logistica
  ADD CONSTRAINT eventos_produccion_logistica_estado_check
  CHECK (estado IN ('por_hacer', 'en_curso', 'reprogramado', 'completado', 'no_realizado'));
ALTER TABLE public.eventos_produccion_logistica ALTER COLUMN estado SET DEFAULT 'por_hacer';

-- Permitir el nuevo contexto en responsables_calendarios
ALTER TABLE public.responsables_calendarios DROP CONSTRAINT IF EXISTS responsables_calendarios_calendarios_check;
ALTER TABLE public.responsables_calendarios
  ADD CONSTRAINT responsables_calendarios_calendarios_check
  CHECK (calendarios <@ ARRAY['visitas_terreno', 'produccion_logistica', 'reventa_logistica']::TEXT[]);

-- Agregar columna para reventa en personal_terreno
ALTER TABLE public.personal_terreno
  ADD COLUMN IF NOT EXISTS calendario_reventa_logistica BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_eventos_prod_log_contexto_fecha
  ON public.eventos_produccion_logistica (contexto, fecha_inicio);
