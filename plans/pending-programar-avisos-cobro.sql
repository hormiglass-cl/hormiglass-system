-- Ejecuta cada día a las 12:00 UTC (08:00 o 09:00 en Chile, según horario).
-- La función usa cobro_aviso_ciclos para emitir un aviso al vencer y luego
-- uno cada siete días por venta y destinatario mientras siga el saldo.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule(
  'hormiglass_cobros_diarios',
  '0 12 * * *',
  $$SELECT public.generar_avisos_cobro();$$
);
