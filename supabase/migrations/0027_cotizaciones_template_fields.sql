-- 0027_cotizaciones_template_fields.sql
-- Agrega campos para alinear la tabla cotizaciones con la plantilla oficial (cotizacion-ejemplo.pdf)

ALTER TABLE public.cotizaciones 
  ADD COLUMN IF NOT EXISTS referencia_cliente TEXT,
  ADD COLUMN IF NOT EXISTS fecha_validez DATE,
  ADD COLUMN IF NOT EXISTS comentario_publico TEXT;

-- Asegurar valor por defecto para iva_porcentaje si no está definido
ALTER TABLE public.cotizaciones 
  ALTER COLUMN iva_porcentaje SET DEFAULT 19.00;

-- Asegurar columna descuento_porcentaje en cotizacion_items
ALTER TABLE public.cotizacion_items 
  ADD COLUMN IF NOT EXISTS descuento_porcentaje NUMERIC(5, 2) DEFAULT 0;

COMMENT ON COLUMN public.cotizaciones.referencia_cliente IS 'Referencia interna o código del cliente para la cotización (Ref. cliente)';
COMMENT ON COLUMN public.cotizaciones.fecha_validez IS 'Fecha límite de validez de la oferta (Validar fecha de término)';
COMMENT ON COLUMN public.cotizaciones.comentario_publico IS 'Comentario u observación pública visible en el encabezado del documento';
