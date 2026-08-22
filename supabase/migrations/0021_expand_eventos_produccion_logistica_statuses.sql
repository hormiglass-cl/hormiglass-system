ALTER TABLE public.eventos_produccion_logistica
  DROP CONSTRAINT IF EXISTS eventos_produccion_logistica_estado_check;

ALTER TABLE public.eventos_produccion_logistica
  ADD CONSTRAINT eventos_produccion_logistica_estado_check
  CHECK (
    estado IN (
      'programado',
      'en_proceso',
      'completado',
      'cancelado',
      'pendiente',
      'cola_produccion',
      'fabricacion',
      'listo_instalacion',
      'instalacion',
      'finalizado',
      'coordinacion',
      'despachado',
      'entregado'
    )
  );
