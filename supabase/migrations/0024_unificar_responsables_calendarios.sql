ALTER TABLE public.responsables_calendarios
  ADD COLUMN IF NOT EXISTS rut TEXT;

ALTER TABLE public.responsables_calendarios
  DROP CONSTRAINT IF EXISTS responsables_calendarios_calendarios_check;

UPDATE public.responsables_calendarios
SET calendarios = array_remove(ARRAY[
  CASE WHEN 'visitas_terreno' = ANY(calendarios) THEN 'visitas_terreno' END,
  CASE WHEN calendarios && ARRAY['obra','logistica','produccion','produccion_logistica']::TEXT[] THEN 'produccion_logistica' END
], NULL)::TEXT[]
WHERE calendarios && ARRAY['obra','logistica','produccion','produccion_logistica','visitas_terreno']::TEXT[];

ALTER TABLE public.responsables_calendarios
  ADD CONSTRAINT responsables_calendarios_calendarios_check
  CHECK (calendarios <@ ARRAY['visitas_terreno','produccion_logistica']::TEXT[]);

INSERT INTO public.responsables_calendarios (nombre, cargo, telefono, email, calendarios, activo)
SELECT
  p.nombre,
  COALESCE(p.especialidad, p.tipo),
  p.telefono,
  p.email,
  ARRAY[
    CASE WHEN p.tipo = 'tecnico' THEN 'visitas_terreno' END,
    CASE WHEN p.tipo IN ('cuadrilla','encargado_fabricacion','tecnico') THEN 'produccion_logistica' END
  ]::TEXT[],
  p.activo
FROM public.personal_terreno p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.responsables_calendarios r
  WHERE lower(trim(r.nombre)) = lower(trim(p.nombre))
);

ALTER TABLE public.visitas_terreno
  ADD COLUMN IF NOT EXISTS responsable_calendario_id UUID REFERENCES public.responsables_calendarios(id) ON DELETE SET NULL;

ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS responsable_visita_id UUID REFERENCES public.responsables_calendarios(id) ON DELETE SET NULL;

UPDATE public.visitas_terreno v
SET responsable_calendario_id = r.id
FROM public.responsables_calendarios r
WHERE v.responsable_calendario_id IS NULL
  AND lower(trim(v.tecnico_visita)) = lower(trim(r.nombre));

UPDATE public.oportunidades o
SET responsable_visita_id = r.id
FROM public.responsables_calendarios r
WHERE o.responsable_visita_id IS NULL
  AND o.tecnico_visita IS NOT NULL
  AND lower(trim(o.tecnico_visita)) = lower(trim(r.nombre));

CREATE INDEX IF NOT EXISTS idx_visitas_terreno_responsable_calendario
  ON public.visitas_terreno (responsable_calendario_id);

CREATE INDEX IF NOT EXISTS idx_oportunidades_responsable_visita
  ON public.oportunidades (responsable_visita_id);

DROP INDEX IF EXISTS public.idx_responsables_calendarios_calendarios;
CREATE INDEX IF NOT EXISTS idx_responsables_calendarios_calendarios
  ON public.responsables_calendarios USING GIN (calendarios);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.responsables_calendarios TO authenticated;
