ALTER TABLE public.personal_terreno
  ADD COLUMN IF NOT EXISTS rut TEXT,
  ADD COLUMN IF NOT EXISTS calendario_visitas BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS calendario_produccion_logistica BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS tecnico_id UUID REFERENCES public.personal_terreno(id) ON DELETE SET NULL;

UPDATE public.personal_terreno p
SET calendario_visitas = TRUE,
    calendario_produccion_logistica = TRUE
WHERE p.tipo = 'tecnico'
  AND (p.calendario_visitas IS DISTINCT FROM TRUE OR p.calendario_produccion_logistica IS DISTINCT FROM TRUE);

UPDATE public.personal_terreno p
SET calendario_produccion_logistica = TRUE
WHERE p.tipo IN ('cuadrilla', 'encargado_fabricacion')
  AND p.calendario_produccion_logistica IS DISTINCT FROM TRUE;

UPDATE public.personal_terreno p
SET calendario_visitas = CASE WHEN 'visitas_terreno' = ANY(r.calendarios) THEN TRUE ELSE p.calendario_visitas END,
    calendario_produccion_logistica = CASE WHEN 'produccion_logistica' = ANY(r.calendarios) THEN TRUE ELSE p.calendario_produccion_logistica END,
    rut = COALESCE(p.rut, r.rut)
FROM public.responsables_calendarios r
WHERE lower(trim(p.nombre)) = lower(trim(r.nombre));

UPDATE public.visitas_terreno v
SET tecnico_id = p.id
FROM public.responsables_calendarios r
JOIN public.personal_terreno p ON lower(trim(p.nombre)) = lower(trim(r.nombre))
WHERE v.tecnico_id IS NULL
  AND v.responsable_calendario_id = r.id;

UPDATE public.oportunidades o
SET tecnico_id = p.id
FROM public.responsables_calendarios r
JOIN public.personal_terreno p ON lower(trim(p.nombre)) = lower(trim(r.nombre))
WHERE o.tecnico_id IS NULL
  AND o.responsable_visita_id = r.id;

UPDATE public.eventos_produccion_logistica e
SET responsable_id = p.id
FROM public.responsables_calendarios r
JOIN public.personal_terreno p ON lower(trim(p.nombre)) = lower(trim(r.nombre))
WHERE e.responsable_id IS NULL
  AND e.responsable_calendario_id = r.id;

UPDATE public.produccion_diaria pd
SET responsable_id = p.id
FROM public.responsables_calendarios r
JOIN public.personal_terreno p ON lower(trim(p.nombre)) = lower(trim(r.nombre))
WHERE pd.responsable_id IS NULL
  AND pd.responsable_calendario_id = r.id;

CREATE INDEX IF NOT EXISTS idx_personal_terreno_cal_visitas
  ON public.personal_terreno (calendario_visitas) WHERE activo = TRUE;
CREATE INDEX IF NOT EXISTS idx_personal_terreno_cal_prod_log
  ON public.personal_terreno (calendario_produccion_logistica) WHERE activo = TRUE;
CREATE INDEX IF NOT EXISTS idx_oportunidades_tecnico_id ON public.oportunidades (tecnico_id);
