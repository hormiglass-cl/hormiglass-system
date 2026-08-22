ALTER TABLE public.eventos_produccion_logistica
  DROP CONSTRAINT IF EXISTS eventos_produccion_logistica_tipo_evento_check;

UPDATE public.eventos_produccion_logistica
   SET tipo_evento = CASE tipo_evento
     WHEN 'fabricacion' THEN 'produccion'
     WHEN 'instalacion' THEN 'obra'
     ELSE tipo_evento
   END
 WHERE tipo_evento IN ('fabricacion', 'instalacion');

ALTER TABLE public.eventos_produccion_logistica
  ADD CONSTRAINT eventos_produccion_logistica_tipo_evento_check
  CHECK (tipo_evento IN ('obra', 'logistica', 'produccion'));
