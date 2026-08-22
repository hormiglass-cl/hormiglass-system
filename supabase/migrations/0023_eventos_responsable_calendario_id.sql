ALTER TABLE public.eventos_produccion_logistica
  ADD COLUMN IF NOT EXISTS responsable_calendario_id UUID REFERENCES public.responsables_calendarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_eventos_prod_log_responsable_calendario
  ON public.eventos_produccion_logistica (responsable_calendario_id);
