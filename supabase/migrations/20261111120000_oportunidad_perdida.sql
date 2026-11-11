-- Oportunidades perdidas: cierre comercial sin venta, con motivo obligatorio.
-- estado_pipeline no cambia; al reabrir, la oportunidad vuelve a su etapa.
-- La base fija perdida_at y perdida_por; el cliente solo envía motivo y detalle.

ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS perdida_at timestamptz,
  ADD COLUMN IF NOT EXISTS perdida_motivo text,
  ADD COLUMN IF NOT EXISTS perdida_detalle text,
  ADD COLUMN IF NOT EXISTS perdida_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.oportunidades DROP CONSTRAINT IF EXISTS oportunidades_perdida_motivo_check;
ALTER TABLE public.oportunidades ADD CONSTRAINT oportunidades_perdida_motivo_check
  CHECK (perdida_motivo IS NULL OR perdida_motivo IN ('precio', 'competencia', 'sin_respuesta', 'proyecto_cancelado', 'otro'));

-- Perdida implica fecha y motivo; abierta implica los cuatro campos vacíos.
ALTER TABLE public.oportunidades DROP CONSTRAINT IF EXISTS oportunidades_perdida_consistente;
ALTER TABLE public.oportunidades ADD CONSTRAINT oportunidades_perdida_consistente
  CHECK (
    (perdida_at IS NULL AND perdida_motivo IS NULL AND perdida_detalle IS NULL AND perdida_por IS NULL)
    OR (perdida_at IS NOT NULL AND perdida_motivo IS NOT NULL
        AND (perdida_motivo <> 'otro' OR length(btrim(coalesce(perdida_detalle, ''))) > 0))
  );

-- Solo se pierde una oportunidad nueva, y no cambia de etapa mientras esté perdida.
ALTER TABLE public.oportunidades DROP CONSTRAINT IF EXISTS oportunidades_perdida_solo_nueva;
ALTER TABLE public.oportunidades ADD CONSTRAINT oportunidades_perdida_solo_nueva
  CHECK (perdida_at IS NULL OR estado_pipeline = 'nueva');

CREATE OR REPLACE FUNCTION public.registrar_oportunidad_perdida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.perdida_motivo IS NULL THEN
    -- Reabrir: se limpian todos los datos de la pérdida.
    NEW.perdida_at := NULL;
    NEW.perdida_detalle := NULL;
    NEW.perdida_por := NULL;
  ELSIF OLD.perdida_motivo IS NULL THEN
    -- Marcar como perdida: fecha y autor los define la base.
    NEW.perdida_at := now();
    NEW.perdida_por := (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid() LIMIT 1);
  ELSE
    -- Editar el motivo de una oportunidad ya perdida conserva fecha y autor.
    NEW.perdida_at := OLD.perdida_at;
    NEW.perdida_por := OLD.perdida_por;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registrar_oportunidad_perdida ON public.oportunidades;
CREATE TRIGGER registrar_oportunidad_perdida
  BEFORE UPDATE OF perdida_motivo, perdida_detalle, perdida_at, perdida_por ON public.oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.registrar_oportunidad_perdida();
