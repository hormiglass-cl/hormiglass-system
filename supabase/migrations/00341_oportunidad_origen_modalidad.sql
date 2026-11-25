-- 0034: Origen y modalidad del requerimiento en oportunidades.

ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS origen TEXT,
  ADD COLUMN IF NOT EXISTS modalidad_requerimiento TEXT NOT NULL DEFAULT 'instalacion'
    CHECK (modalidad_requerimiento IN ('solo_material', 'instalacion'));

COMMENT ON COLUMN public.oportunidades.origen IS 'Origen comercial de la oportunidad: referido, web, WhatsApp, llamado, visita, cliente recurrente u otro.';
COMMENT ON COLUMN public.oportunidades.modalidad_requerimiento IS 'Indica si el requerimiento es sólo material o incluye instalación.';
