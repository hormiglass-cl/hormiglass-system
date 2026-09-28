-- La función de sincronización es solo para triggers; no debe exponerse como RPC.
REVOKE ALL ON FUNCTION public.handle_sync_usuario_to_trabajador() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS cotizacion_items_producto_catalogo_idx ON public.cotizacion_items(producto_catalogo_id);
CREATE INDEX IF NOT EXISTS orden_compra_items_producto_catalogo_idx ON public.orden_compra_items(producto_catalogo_id);
CREATE INDEX IF NOT EXISTS postventa_casos_responsable_idx ON public.postventa_casos(responsable_id);
CREATE INDEX IF NOT EXISTS postventa_casos_evento_idx ON public.postventa_casos(evento_id);
CREATE INDEX IF NOT EXISTS guias_despacho_verificador_idx ON public.guias_despacho(carga_verificada_por);
CREATE INDEX IF NOT EXISTS guias_despacho_confirmador_idx ON public.guias_despacho(entrega_confirmada_por);
CREATE INDEX IF NOT EXISTS eventos_guia_despacho_idx ON public.eventos_produccion_logistica(guia_despacho_id);
