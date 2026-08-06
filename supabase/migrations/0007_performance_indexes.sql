-- 0007: Performance optimization B-Tree indexes for fast queries

-- 1. Notificaciones (Búsquedas por usuario y estado de lectura)
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_leido ON public.notificaciones (usuario_id, leido);

-- 2. Oportunidades (Relaciones con cliente y usuario asignado)
CREATE INDEX IF NOT EXISTS idx_oportunidades_cliente_id ON public.oportunidades (cliente_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_asignado_a ON public.oportunidades (asignado_a);
CREATE INDEX IF NOT EXISTS idx_oportunidades_estado_pipeline ON public.oportunidades (estado_pipeline);

-- 3. Cotizaciones (Relaciones con cliente y oportunidad)
CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente_id ON public.cotizaciones (cliente_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_oportunidad_id ON public.cotizaciones (oportunidad_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_usuario_id ON public.cotizaciones (usuario_id);

-- 4. Cotización Items
CREATE INDEX IF NOT EXISTS idx_cotizacion_items_cotizacion_id ON public.cotizacion_items (cotizacion_id);

-- 5. Notas de Actividad
CREATE INDEX IF NOT EXISTS idx_notas_actividad_cliente_id ON public.notas_actividad (cliente_id);
CREATE INDEX IF NOT EXISTS idx_notas_actividad_usuario_id ON public.notas_actividad (usuario_id);

-- 6. Actividades Operativas
CREATE INDEX IF NOT EXISTS idx_actividades_op_oportunidad_id ON public.actividades_op (oportunidad_id);

-- 7. Visitas a Terreno
CREATE INDEX IF NOT EXISTS idx_visitas_terreno_oportunidad_id ON public.visitas_terreno (oportunidad_id);

-- 8. Movimientos de Caja (Filtros por fecha y tipo)
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_fecha ON public.caja_movimientos (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_tipo ON public.caja_movimientos (tipo);

-- 9. Pedidos a Proveedores
CREATE INDEX IF NOT EXISTS idx_pedidos_proveedor_proveedor_id ON public.pedidos_proveedor (proveedor_id);

-- 10. Clientes
CREATE INDEX IF NOT EXISTS idx_clientes_asignado_a ON public.clientes (asignado_a);
CREATE INDEX IF NOT EXISTS idx_clientes_rut ON public.clientes (rut);
