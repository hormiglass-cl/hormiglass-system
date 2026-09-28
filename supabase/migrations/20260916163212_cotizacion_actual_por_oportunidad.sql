-- La cotización vigente se elige por versión y fecha, sin sumar el historial.
ALTER TABLE public.oportunidades
  ADD COLUMN cotizacion_actual_id uuid;

ALTER TABLE public.oportunidades
  ADD CONSTRAINT oportunidades_cotizacion_actual_id_fkey
  FOREIGN KEY (cotizacion_actual_id) REFERENCES public.cotizaciones(id)
  ON DELETE SET NULL;

CREATE INDEX oportunidades_cotizacion_actual_id_idx
  ON public.oportunidades (cotizacion_actual_id);

UPDATE public.oportunidades AS op
SET cotizacion_actual_id = (
  SELECT c.id
  FROM public.cotizaciones AS c
  WHERE c.oportunidad_id = op.id
  ORDER BY c.version DESC NULLS LAST, c.created_at DESC, c.id DESC
  LIMIT 1
);

CREATE FUNCTION public.sync_cotizacion_actual() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  affected_op uuid;
  previous_op uuid;
  next_op uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    previous_op := OLD.oportunidad_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    next_op := NEW.oportunidad_id;
  END IF;
  -- En una reasignación se recalculan ambas oportunidades.
  FOR affected_op IN
    SELECT DISTINCT id FROM (
      SELECT previous_op AS id
      UNION ALL
      SELECT next_op AS id
    ) AS opportunities WHERE id IS NOT NULL
  LOOP
    UPDATE public.oportunidades AS op
    SET cotizacion_actual_id = (
      SELECT c.id FROM public.cotizaciones AS c
      WHERE c.oportunidad_id = affected_op
      ORDER BY c.version DESC NULLS LAST, c.created_at DESC, c.id DESC
      LIMIT 1
    )
    WHERE op.id = affected_op;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER sync_cotizacion_actual_after_change
  AFTER INSERT OR UPDATE OF oportunidad_id, version OR DELETE
  ON public.cotizaciones FOR EACH ROW
  EXECUTE FUNCTION public.sync_cotizacion_actual();

REVOKE ALL ON FUNCTION public.sync_cotizacion_actual() FROM PUBLIC;
