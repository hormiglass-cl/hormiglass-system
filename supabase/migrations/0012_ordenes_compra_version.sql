-- 0012: Versionado de ordenes de compra

ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

UPDATE public.ordenes_compra
SET version = 1
WHERE version IS NULL;
