-- ==============================================================================
-- Migración: Pipeline Comercial - Venta Aprobada sin Acreditación Documental Previa
-- Fecha: 2026-10-10
--
-- En el pipeline comercial de Hormiglass, cuando una oportunidad es aprobada
-- (estado_pipeline = 'entregada', denominada comercialmente "Venta Aprobada"),
-- el negocio avanza hacia Producción o Reventa.
--
-- La acreditación documental de entrega (entrega_acreditada) NO debe exigirse
-- para pasar a 'entregada', ya que la fabricación y despacho ocurren con
-- posterioridad. La acreditación de entrega se exige exclusivamente al momento
-- del cierre real operativo: 'prod_finalizado' (Producción) y 'rev_entregado' (Reventa).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.validar_cierre_venta() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- 1. Entrega manual requiere aprobación administrativa registrada
  IF NEW.entrega_manual_confirmada AND NOT OLD.entrega_manual_confirmada AND NOT EXISTS (
    SELECT 1 FROM public.operacion_excepciones WHERE oportunidad_id = NEW.id AND tipo = 'entrega_manual' AND estado = 'aprobada'
  ) THEN
    RAISE EXCEPTION 'La entrega manual requiere aprobación administrativa';
  END IF;

  -- 2. Solo las etapas de cierre real de obra / reventa exigen acreditar entrega documentalmente
  -- 'entregada' corresponde a 'Venta Aprobada' comercial y NO exige guía entregada previa
  IF NEW.estado_pipeline IN ('prod_finalizado', 'rev_entregado')
     AND OLD.estado_pipeline IS DISTINCT FROM NEW.estado_pipeline
     AND NOT public.entrega_acreditada(NEW.id) THEN
    RAISE EXCEPTION 'La venta solo puede cerrarse cuando la entrega está acreditada';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_cierre_venta() FROM PUBLIC;
