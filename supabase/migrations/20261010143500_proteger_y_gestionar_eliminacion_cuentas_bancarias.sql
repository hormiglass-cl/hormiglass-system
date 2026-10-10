-- Migración: Protección defensiva y auditoría para eliminación de cuentas bancarias
-- Fecha: 2026-10-10
-- Fase 1: Ajustes Octubre 2026 (Parte 2)

CREATE OR REPLACE FUNCTION public.proteger_eliminacion_cuenta_bancaria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_movimientos_count bigint;
  v_abonos_count bigint;
BEGIN
  -- Verificar si existen movimientos asociados en caja_movimientos
  SELECT COUNT(*) INTO v_movimientos_count
  FROM public.caja_movimientos
  WHERE cuenta_bancaria_id = OLD.id;

  IF v_movimientos_count > 0 THEN
    RAISE EXCEPTION 'No se puede eliminar la cuenta bancaria "%" porque tiene % movimiento(s) registrados en caja. Desactívela en su lugar.',
      OLD.alias, v_movimientos_count
      USING ERRCODE = '23503';
  END IF;

  -- Verificar si existen abonos asociados en public.abonos
  SELECT COUNT(*) INTO v_abonos_count
  FROM public.abonos
  WHERE cuenta_bancaria_id = OLD.id;

  IF v_abonos_count > 0 THEN
    RAISE EXCEPTION 'No se puede eliminar la cuenta bancaria "%" porque tiene % abono(s) registrados. Desactívela en su lugar.',
      OLD.alias, v_abonos_count
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

-- Revocar permisos RPC directos para evitar exposición innecesaria a anon/authenticated
REVOKE EXECUTE ON FUNCTION public.proteger_eliminacion_cuenta_bancaria() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_proteger_eliminacion_cuenta_bancaria ON public.cuentas_bancarias;
CREATE TRIGGER trg_proteger_eliminacion_cuenta_bancaria
  BEFORE DELETE ON public.cuentas_bancarias
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_eliminacion_cuenta_bancaria();
