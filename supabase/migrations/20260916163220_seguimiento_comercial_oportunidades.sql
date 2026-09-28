ALTER TABLE public.oportunidades
  ADD COLUMN seguimiento_resultado text,
  ADD COLUMN proxima_accion text,
  ADD COLUMN proxima_accion_fecha timestamptz,
  ADD COLUMN seguimiento_responsable_id uuid REFERENCES public.usuarios(id);

CREATE INDEX oportunidades_proxima_accion_idx
  ON public.oportunidades (proxima_accion_fecha)
  WHERE proxima_accion_fecha IS NOT NULL;

CREATE UNIQUE INDEX notificaciones_seguimiento_unico_idx
  ON public.notificaciones (usuario_id, entidad_relacionada, tipo)
  WHERE tipo = 'seguimiento';
