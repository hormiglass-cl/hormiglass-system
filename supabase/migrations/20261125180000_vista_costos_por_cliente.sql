-- ============================================================================
-- Fase 5: Vista consolidada de costos, margen y sobrecosto por Cliente.
-- Usa security_invoker = true para respetar las políticas RLS vigentes.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_costos_por_cliente
WITH (security_invoker = true) AS
WITH ops_por_cliente AS (
  SELECT
    cliente_id,
    COUNT(oportunidad_id)::int AS cantidad_oportunidades,
    COALESCE(SUM(valor_cotizado_total), 0)::numeric AS valor_cotizado_total,
    COALESCE(SUM(total_ingresos_validados), 0)::numeric AS ingresos_abonos,
    COALESCE(SUM(costo_compras_asignadas), 0)::numeric AS costo_compras_asignadas,
    COALESCE(SUM(costo_fletes_despacho), 0)::numeric AS costo_fletes_despacho,
    COALESCE(SUM(costo_postventa), 0)::numeric AS costo_postventa
  FROM public.v_margen_por_nv
  WHERE cliente_id IS NOT NULL
  GROUP BY cliente_id
),
movs_resueltos AS (
  -- Asocia cada movimiento a su cliente (directo o vía su oportunidad), sin duplicar
  SELECT DISTINCT ON (m.id)
    m.id,
    COALESCE(m.cliente_id, o.cliente_id) AS cliente_id,
    m.tipo,
    COALESCE(m.monto, 0)::numeric AS monto,
    m.orden_compra_id,
    EXISTS (
      SELECT 1 FROM public.abonos a
      WHERE a.caja_movimiento_id = m.id AND a.estado = 'validado'
    ) AS es_abono_validado
  FROM public.caja_movimientos m
  LEFT JOIN public.oportunidades o ON o.id = m.oportunidad_id
  WHERE COALESCE(m.cliente_id, o.cliente_id) IS NOT NULL
),
caja_por_cliente AS (
  SELECT
    cliente_id,
    COALESCE(SUM(CASE WHEN tipo = 'ingreso' AND NOT es_abono_validado THEN monto ELSE 0 END), 0)::numeric AS ingresos_caja_directos,
    COALESCE(SUM(CASE WHEN tipo = 'egreso' AND orden_compra_id IS NULL THEN monto ELSE 0 END), 0)::numeric AS costo_caja_directo,
    COUNT(id)::int AS cantidad_movimientos_caja
  FROM movs_resueltos
  GROUP BY cliente_id
),
base AS (
  SELECT
    c.id AS cliente_id,
    COALESCE(NULLIF(trim(c.apellido_razon_social), ''), NULLIF(trim(c.nombre), ''), 'Cliente sin nombre') AS cliente_nombre,
    c.rut AS cliente_rut,
    COALESCE(op.cantidad_oportunidades, 0) AS cantidad_oportunidades,
    COALESCE(op.valor_cotizado_total, 0) AS valor_cotizado_total,
    COALESCE(op.ingresos_abonos, 0) AS ingresos_abonos,
    COALESCE(cj.ingresos_caja_directos, 0) AS ingresos_caja_directos,
    (COALESCE(op.ingresos_abonos, 0) + COALESCE(cj.ingresos_caja_directos, 0)) AS total_ingresos,
    COALESCE(op.costo_compras_asignadas, 0) AS costo_compras_asignadas,
    COALESCE(op.costo_fletes_despacho, 0) AS costo_fletes_despacho,
    COALESCE(op.costo_postventa, 0) AS costo_postventa,
    COALESCE(cj.costo_caja_directo, 0) AS costo_caja_directo,
    (
      COALESCE(op.costo_compras_asignadas, 0) +
      COALESCE(op.costo_fletes_despacho, 0) +
      COALESCE(op.costo_postventa, 0) +
      COALESCE(cj.costo_caja_directo, 0)
    ) AS costo_total,
    COALESCE(cj.cantidad_movimientos_caja, 0) AS cantidad_movimientos_caja
  FROM public.clientes c
  LEFT JOIN ops_por_cliente op ON op.cliente_id = c.id
  LEFT JOIN caja_por_cliente cj ON cj.cliente_id = c.id
  WHERE op.cliente_id IS NOT NULL OR cj.cliente_id IS NOT NULL
)
SELECT
  b.*,
  (b.total_ingresos - b.costo_total) AS margen_real,
  (GREATEST(b.valor_cotizado_total, b.total_ingresos) - b.costo_total) AS margen_proyectado,
  GREATEST(0::numeric, b.costo_total - GREATEST(b.valor_cotizado_total, b.total_ingresos)) AS sobrecosto,
  (b.costo_total > GREATEST(b.valor_cotizado_total, b.total_ingresos) AND b.costo_total > 0) AS tiene_sobrecosto,
  CASE
    WHEN b.total_ingresos > 0 THEN ROUND(((b.total_ingresos - b.costo_total) / b.total_ingresos) * 100, 1)
    ELSE 0
  END AS porcentaje_margen_real
FROM base b;

REVOKE ALL ON TABLE public.v_costos_por_cliente FROM anon, public;
GRANT SELECT ON TABLE public.v_costos_por_cliente TO authenticated;
