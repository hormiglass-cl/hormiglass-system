-- ==============================================================================
-- MIGRACIÓN: Optimización de Rendimiento, RLS InitPlan e Índices Críticos
-- ==============================================================================

-- 1. Optimizar RLS InitPlan en public.usuarios:
--    auth.uid() envuelto en (SELECT auth.uid()) para evaluación única por query
--    en lugar de ejecución por cada fila en escaneos secuenciales.
DROP POLICY IF EXISTS usuarios_select ON public.usuarios;
CREATE POLICY usuarios_select ON public.usuarios
  FOR SELECT TO authenticated
  USING ((auth_id = (SELECT auth.uid())) OR is_active_user());

-- 2. Separar permisos de escritura en public.caja_categorias:
--    Evita políticas permisivas múltiples en SELECT al restringir write a INSERT, UPDATE, DELETE.
DROP POLICY IF EXISTS caja_categorias_write_admin_finanzas ON public.caja_categorias;
CREATE POLICY caja_categorias_insert_admin_finanzas ON public.caja_categorias
  FOR INSERT TO authenticated
  WITH CHECK (has_role('admin', 'finanzas'));
CREATE POLICY caja_categorias_update_admin_finanzas ON public.caja_categorias
  FOR UPDATE TO authenticated
  USING (has_role('admin', 'finanzas'))
  WITH CHECK (has_role('admin', 'finanzas'));
CREATE POLICY caja_categorias_delete_admin_finanzas ON public.caja_categorias
  FOR DELETE TO authenticated
  USING (has_role('admin', 'finanzas'));

-- 3. Separar permisos de escritura en public.caja_subcategorias:
DROP POLICY IF EXISTS caja_subcategorias_write_admin_finanzas ON public.caja_subcategorias;
CREATE POLICY caja_subcategorias_insert_admin_finanzas ON public.caja_subcategorias
  FOR INSERT TO authenticated
  WITH CHECK (has_role('admin', 'finanzas'));
CREATE POLICY caja_subcategorias_update_admin_finanzas ON public.caja_subcategorias
  FOR UPDATE TO authenticated
  USING (has_role('admin', 'finanzas'))
  WITH CHECK (has_role('admin', 'finanzas'));
CREATE POLICY caja_subcategorias_delete_admin_finanzas ON public.caja_subcategorias
  FOR DELETE TO authenticated
  USING (has_role('admin', 'finanzas'));

-- 4. Limpiar política duplicada en public.eventos_produccion_logistica:
DROP POLICY IF EXISTS eventos_prod_log_select ON public.eventos_produccion_logistica;

-- 5. Índices de Claves Foráneas (Foreign Keys) de Alto Tráfico:
CREATE INDEX IF NOT EXISTS idx_abonos_caja_movimiento_id ON public.abonos(caja_movimiento_id);
CREATE INDEX IF NOT EXISTS idx_abonos_creado_por_id ON public.abonos(creado_por_id);
CREATE INDEX IF NOT EXISTS idx_abonos_validado_por_id ON public.abonos(validado_por_id);
CREATE INDEX IF NOT EXISTS idx_abonos_oportunidad_id ON public.abonos(oportunidad_id);
CREATE INDEX IF NOT EXISTS idx_abonos_estado_pendiente ON public.abonos(estado) WHERE estado = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_actividades_op_usuario_id ON public.actividades_op(usuario_id);
CREATE INDEX IF NOT EXISTS idx_actividades_op_oportunidad_id ON public.actividades_op(oportunidad_id);

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_pedido_proveedor_id ON public.caja_movimientos(pedido_proveedor_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_usuario_id ON public.caja_movimientos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_venta_id ON public.caja_movimientos(venta_id);

CREATE INDEX IF NOT EXISTS idx_clientes_created_by ON public.clientes(created_by);

CREATE INDEX IF NOT EXISTS idx_eventos_prod_log_registrado_por ON public.eventos_produccion_logistica(registrado_por);
CREATE INDEX IF NOT EXISTS idx_eventos_prod_log_planificacion_id ON public.eventos_produccion_logistica(planificacion_id);

CREATE INDEX IF NOT EXISTS idx_guia_despacho_items_cotizacion_item_id ON public.guia_despacho_items(cotizacion_item_id);

CREATE INDEX IF NOT EXISTS idx_oportunidades_responsable_operativo_id ON public.oportunidades(responsable_operativo_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_seguimiento_responsable_id ON public.oportunidades(seguimiento_responsable_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_rama_definida_por ON public.oportunidades(rama_definida_por);
CREATE INDEX IF NOT EXISTS idx_oportunidades_comision_pagada_por ON public.oportunidades(comision_pagada_por);
CREATE INDEX IF NOT EXISTS idx_oportunidades_estado_pipeline ON public.oportunidades(estado_pipeline);
CREATE INDEX IF NOT EXISTS idx_oportunidades_created_at_desc ON public.oportunidades(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orden_produccion_items_cotizacion_item_id ON public.orden_produccion_items(cotizacion_item_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_pagado_por_id ON public.ordenes_compra(pagado_por_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_produccion_responsable_id ON public.ordenes_produccion(responsable_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_proveedor_venta_id ON public.pedidos_proveedor(venta_id);

CREATE INDEX IF NOT EXISTS idx_ventas_asignado_a ON public.ventas(asignado_a);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente_id ON public.ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_cotizacion_id ON public.ventas(cotizacion_id);

CREATE INDEX IF NOT EXISTS idx_notificaciones_user_unread ON public.notificaciones(usuario_id, leido) WHERE leido = false;

CREATE INDEX IF NOT EXISTS idx_cotizaciones_oportunidad_id ON public.cotizaciones(oportunidad_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente_id ON public.cotizaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_created_at_desc ON public.cotizaciones(created_at DESC);
