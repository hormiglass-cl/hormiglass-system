-- 0009: Rama de destino explícita para oportunidades (ajuste 11.3)

ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS rama_destino TEXT
    CHECK (rama_destino IS NULL OR rama_destino IN ('produccion', 'reventa')),
  ADD COLUMN IF NOT EXISTS rama_definida_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rama_definida_por UUID REFERENCES public.usuarios(id);

-- BACKFILL: preservar el comportamiento actual de las oportunidades vivas.
-- 1) Por estado actual del pipeline (fuente más confiable)
UPDATE public.oportunidades
   SET rama_destino = 'produccion'
 WHERE rama_destino IS NULL AND estado_pipeline LIKE 'prod\_%';

UPDATE public.oportunidades
   SET rama_destino = 'reventa'
 WHERE rama_destino IS NULL AND estado_pipeline LIKE 'rev\_%';

-- 2) Por existencia de registro hijo (oportunidades ya transferidas)
UPDATE public.oportunidades o
   SET rama_destino = 'produccion'
 WHERE o.rama_destino IS NULL
   AND EXISTS (SELECT 1 FROM public.proyectos_planificacion p WHERE p.oportunidad_id = o.id);

UPDATE public.oportunidades o
   SET rama_destino = 'reventa'
 WHERE o.rama_destino IS NULL
   AND EXISTS (SELECT 1 FROM public.ordenes_reventa r WHERE r.oportunidad_id = o.id);

-- 3) Las que están en 'entregada' sin hijo: inferir del tipo_venta (regla vieja)
UPDATE public.oportunidades
   SET rama_destino = CASE
         WHEN tipo_venta IN ('Suministro', 'Reventa de Material') THEN 'reventa'
         ELSE 'produccion' END
 WHERE rama_destino IS NULL AND estado_pipeline = 'entregada';

CREATE INDEX IF NOT EXISTS idx_oportunidades_rama_destino
  ON public.oportunidades (rama_destino);
