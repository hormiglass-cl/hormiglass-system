-- Activar solo después de verificar que generar_avisos_cobro excluye
-- entregas no acreditadas y usa monto_abonado histórico.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'hormiglass_cobros_diarios'
  ) THEN
    PERFORM cron.schedule(
      'hormiglass_cobros_diarios',
      '0 12 * * *',
      'SELECT public.generar_avisos_cobro();'
    );
  END IF;
END;
$$;
