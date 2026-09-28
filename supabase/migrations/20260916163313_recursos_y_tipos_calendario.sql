ALTER TABLE public.eventos_produccion_logistica
  DROP CONSTRAINT IF EXISTS eventos_produccion_logistica_tipo_evento_check;

ALTER TABLE public.eventos_produccion_logistica
  ADD CONSTRAINT eventos_produccion_logistica_tipo_evento_check
  CHECK (tipo_evento IN (
    'obra', 'produccion', 'reventa', 'logistica',
    'retiro_proveedor', 'despacho_cliente', 'instalacion',
    'postventa', 'logistica_interna'
  )),
  ADD COLUMN recurso_vehiculo text,
  ADD COLUMN motivo_reprogramacion text;

CREATE INDEX eventos_recurso_vehiculo_fecha_idx
  ON public.eventos_produccion_logistica (recurso_vehiculo, fecha_inicio)
  WHERE recurso_vehiculo IS NOT NULL;
