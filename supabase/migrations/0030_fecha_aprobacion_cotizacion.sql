-- 0030_fecha_aprobacion_cotizacion.sql
-- Captura automática de fecha_aprobacion en cotizaciones para cálculo de días promedio de pago.

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS fecha_aprobacion TIMESTAMPTZ;

-- Backfill para cotizaciones ya aprobadas
UPDATE public.cotizaciones
   SET fecha_aprobacion = COALESCE(updated_at, created_at)
 WHERE estado = 'aprobada' AND fecha_aprobacion IS NULL;

CREATE OR REPLACE FUNCTION public.set_fecha_aprobacion()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.estado = 'aprobada' AND (OLD.estado IS DISTINCT FROM 'aprobada' OR NEW.fecha_aprobacion IS NULL) THEN
    NEW.fecha_aprobacion = NOW();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_fecha_aprobacion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cotizaciones_fecha_aprobacion ON public.cotizaciones;
CREATE TRIGGER trg_cotizaciones_fecha_aprobacion
BEFORE UPDATE ON public.cotizaciones
FOR EACH ROW EXECUTE FUNCTION public.set_fecha_aprobacion();
