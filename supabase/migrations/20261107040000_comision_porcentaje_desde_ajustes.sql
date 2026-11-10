-- El % de comisión por defecto ahora sale de ajustes_sistema ('comisiones'.porcentaje_defecto).
-- Las oportunidades existentes conservan su porcentaje; solo las nuevas toman el valor configurado.
ALTER TABLE public.oportunidades ALTER COLUMN comision_porcentaje DROP DEFAULT;
-- (La función trg_actualizar_estado_comision() se actualizó para leer el ajuste cuando el porcentaje viene vacío.)
