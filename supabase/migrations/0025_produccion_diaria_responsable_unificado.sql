ALTER TABLE public.produccion_diaria
  ADD COLUMN IF NOT EXISTS responsable_calendario_id UUID REFERENCES public.responsables_calendarios(id) ON DELETE SET NULL;

UPDATE public.produccion_diaria pd
SET responsable_calendario_id = r.id
FROM public.personal_terreno p
JOIN public.responsables_calendarios r
  ON lower(trim(r.nombre)) = lower(trim(p.nombre))
WHERE pd.responsable_calendario_id IS NULL
  AND pd.responsable_id = p.id;

CREATE INDEX IF NOT EXISTS idx_produccion_diaria_responsable_calendario
  ON public.produccion_diaria (responsable_calendario_id);
