-- 0001: Reconciliación de esquema — cambios aditivos y seguros.
-- No toca RLS ni políticas. Seguro de aplicar en cualquier momento.

-- Agregar a la publicación de Realtime las tablas que la faltan (necesario
-- para que las suscripciones de la Fase 5 del plan de seguridad funcionen;
-- confirmado ausentes vía pg_publication_tables el 2026-08-05).
ALTER PUBLICATION supabase_realtime ADD TABLE public.caja_movimientos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campos_personalizados;
ALTER PUBLICATION supabase_realtime ADD TABLE public.logs_sistema;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos_proveedor;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ventas;

-- Índice único case-insensitive en email (login compara en minúsculas).
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_lower_key ON public.usuarios (lower(email));
