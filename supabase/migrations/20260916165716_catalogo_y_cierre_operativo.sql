-- Catálogo comercial y de insumos; no realiza movimientos de inventario.
CREATE TABLE public.catalogo_productos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  categoria text NOT NULL CHECK (categoria IN ('producto', 'insumo', 'servicio')),
  unidad text NOT NULL DEFAULT 'unidad',
  precio_referencia numeric(14,2) NOT NULL DEFAULT 0 CHECK (precio_referencia >= 0),
  costo_referencia numeric(14,2) NOT NULL DEFAULT 0 CHECK (costo_referencia >= 0),
  descripcion text,
  es_demo boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.catalogo_productos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalogo_productos FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_productos TO authenticated;
CREATE POLICY catalogo_productos_select ON public.catalogo_productos
  FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY catalogo_productos_insert ON public.catalogo_productos
  FOR INSERT TO authenticated WITH CHECK (public.has_role('user'));
CREATE POLICY catalogo_productos_update ON public.catalogo_productos
  FOR UPDATE TO authenticated USING (public.has_role('user')) WITH CHECK (public.has_role('user'));
CREATE POLICY catalogo_productos_delete ON public.catalogo_productos
  FOR DELETE TO authenticated USING (public.has_role('admin'));

ALTER TABLE public.cotizacion_items
  ALTER COLUMN cantidad TYPE numeric(12,2),
  ADD COLUMN producto_catalogo_id uuid REFERENCES public.catalogo_productos(id) ON DELETE SET NULL;
ALTER TABLE public.orden_compra_items
  ADD COLUMN producto_catalogo_id uuid REFERENCES public.catalogo_productos(id) ON DELETE SET NULL;

-- Despacho operacional interno. Los DTE y folios tributarios quedan fuera de alcance.
ALTER TABLE public.guias_despacho
  ADD COLUMN costo_estimado numeric(14,2) NOT NULL DEFAULT 0 CHECK (costo_estimado >= 0),
  ADD COLUMN costo_real numeric(14,2) NOT NULL DEFAULT 0 CHECK (costo_real >= 0),
  ADD COLUMN tipo_transporte text NOT NULL DEFAULT 'propio'
    CHECK (tipo_transporte IN ('propio', 'externo', 'retiro_cliente')),
  ADD COLUMN recibido_por text,
  ADD COLUMN carga_verificada_por uuid REFERENCES public.usuarios(id),
  ADD COLUMN carga_verificada_at timestamptz,
  ADD COLUMN entrega_confirmada_por uuid REFERENCES public.usuarios(id),
  ADD COLUMN entrega_confirmada_at timestamptz;

CREATE TABLE public.postventa_casos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidad_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('faltante', 'defecto', 'cantidad_adicional', 'otro')),
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'programado', 'en_curso', 'resuelto', 'cancelado')),
  descripcion text NOT NULL,
  cantidad_adicional numeric(12,2) CHECK (cantidad_adicional IS NULL OR cantidad_adicional >= 0),
  autorizacion_cliente text,
  CONSTRAINT cantidad_adicional_autorizada CHECK (cantidad_adicional IS NULL OR cantidad_adicional = 0 OR nullif(trim(autorizacion_cliente), '') IS NOT NULL),
  fecha_compromiso date,
  responsable_id uuid REFERENCES public.usuarios(id),
  evento_id uuid REFERENCES public.eventos_produccion_logistica(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX postventa_casos_op_idx ON public.postventa_casos(oportunidad_id);
ALTER TABLE public.postventa_casos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.postventa_casos FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.postventa_casos TO authenticated;
CREATE POLICY postventa_casos_select ON public.postventa_casos
  FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY postventa_casos_insert ON public.postventa_casos
  FOR INSERT TO authenticated WITH CHECK (public.has_role('user', 'mano_obra'));
CREATE POLICY postventa_casos_update ON public.postventa_casos
  FOR UPDATE TO authenticated USING (public.has_role('user', 'mano_obra'))
  WITH CHECK (public.has_role('user', 'mano_obra'));
CREATE POLICY postventa_casos_delete ON public.postventa_casos
  FOR DELETE TO authenticated USING (public.has_role('admin'));

-- Los roles existentes son admin, user y mano_obra. Las políticas legacy
-- referían a ventas/programacion/administracion y bloqueaban a las operarias.
DROP POLICY IF EXISTS eventos_produccion_logistica_write ON public.eventos_produccion_logistica;
DROP POLICY IF EXISTS eventos_produccion_logistica_delete ON public.eventos_produccion_logistica;
CREATE POLICY eventos_produccion_logistica_write ON public.eventos_produccion_logistica
  FOR INSERT TO authenticated WITH CHECK (public.has_role('user', 'mano_obra'));
CREATE POLICY eventos_produccion_logistica_update ON public.eventos_produccion_logistica
  FOR UPDATE TO authenticated USING (public.has_role('user', 'mano_obra'))
  WITH CHECK (public.has_role('user', 'mano_obra'));
CREATE POLICY eventos_produccion_logistica_delete ON public.eventos_produccion_logistica
  FOR DELETE TO authenticated USING (public.has_role('admin'));
DROP POLICY IF EXISTS produccion_diaria_write ON public.produccion_diaria;
CREATE POLICY produccion_diaria_insert ON public.produccion_diaria
  FOR INSERT TO authenticated WITH CHECK (public.has_role('user', 'mano_obra'));
CREATE POLICY produccion_diaria_update ON public.produccion_diaria
  FOR UPDATE TO authenticated USING (public.has_role('user', 'mano_obra'))
  WITH CHECK (public.has_role('user', 'mano_obra'));
CREATE POLICY produccion_diaria_delete ON public.produccion_diaria
  FOR DELETE TO authenticated USING (public.has_role('admin'));

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ordenes_produccion', 'orden_produccion_items', 'guias_despacho', 'guia_despacho_items', 'guia_despacho_documentos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_insert', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_update', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_delete', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_role(''user'', ''mano_obra''))', table_name || '_insert', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_role(''user'', ''mano_obra'')) WITH CHECK (public.has_role(''user'', ''mano_obra''))', table_name || '_update', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_role(''admin''))', table_name || '_delete', table_name);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS entregas_documentos_insert ON storage.objects;
CREATE POLICY entregas_documentos_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'administracion' AND public.has_role('user', 'mano_obra') AND
    EXISTS (SELECT 1 FROM public.guias_despacho g WHERE g.id = CASE
      WHEN name ~ '^entregas/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
      THEN split_part(name, '/', 2)::uuid ELSE NULL END)
  );

-- Aviso interno al vendedor cuando se completa una entrega con saldo.
CREATE UNIQUE INDEX notificaciones_cobro_unico_idx ON public.notificaciones(usuario_id, entidad_relacionada, tipo)
  WHERE tipo = 'cobro_pendiente';

CREATE FUNCTION public.registrar_cobro_pendiente() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  sale public.oportunidades%ROWTYPE;
  expected_count integer;
  missing_count integer;
  amount numeric;
  paid numeric;
BEGIN
  IF TG_TABLE_NAME = 'guias_despacho' THEN
    SELECT * INTO sale FROM public.oportunidades WHERE id = NEW.oportunidad_id;
  ELSE
    SELECT * INTO sale FROM public.oportunidades WHERE id = NEW.id;
  END IF;
  IF sale.id IS NULL OR sale.asignado_a IS NULL OR sale.cotizacion_actual_id IS NULL THEN RETURN NEW; END IF;
  IF NOT sale.entrega_manual_confirmada THEN
    SELECT count(*) INTO expected_count FROM public.cotizacion_items WHERE cotizacion_id = sale.cotizacion_actual_id;
    IF expected_count = 0 THEN RETURN NEW; END IF;
    SELECT count(*) INTO missing_count FROM public.cotizacion_items ci WHERE ci.cotizacion_id = sale.cotizacion_actual_id
      AND ci.cantidad > COALESCE((SELECT sum(gi.cantidad_recibida) FROM public.guia_despacho_items gi
        JOIN public.guias_despacho g ON g.id = gi.guia_despacho_id
        WHERE g.oportunidad_id = sale.id AND g.estado = 'entregada' AND gi.cotizacion_item_id = ci.id), 0);
    IF missing_count > 0 THEN RETURN NEW; END IF;
  END IF;
  SELECT monto_total INTO amount FROM public.cotizaciones WHERE id = sale.cotizacion_actual_id AND estado IN ('enviada', 'aprobada');
  IF amount IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(sum((e.value->>'monto')::numeric),0) INTO paid
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(sale.comprobantes_pago) = 'array'
    THEN sale.comprobantes_pago ELSE '[]'::jsonb END) AS e(value)
  WHERE e.value ? 'monto' AND (e.value->>'monto') ~ '^[0-9]+(\.[0-9]+)?$';
  IF amount <= paid THEN RETURN NEW; END IF;
  INSERT INTO public.notificaciones(usuario_id, mensaje, tipo, entidad_relacionada, link_url)
  VALUES (sale.asignado_a, 'Entrega completada con saldo pendiente: contactar al cliente para gestionar el cobro.',
          'cobro_pendiente', sale.id::text, '/ventas?oportunidad=' || sale.id::text)
  ON CONFLICT (usuario_id, entidad_relacionada, tipo) WHERE tipo = 'cobro_pendiente' DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cobro_pendiente_tras_guia
  AFTER INSERT OR UPDATE OF estado ON public.guias_despacho FOR EACH ROW
  WHEN (NEW.estado = 'entregada') EXECUTE FUNCTION public.registrar_cobro_pendiente();
CREATE TRIGGER cobro_pendiente_tras_entrega_manual
  AFTER UPDATE OF entrega_manual_confirmada ON public.oportunidades FOR EACH ROW
  WHEN (NEW.entrega_manual_confirmada = true) EXECUTE FUNCTION public.registrar_cobro_pendiente();
REVOKE ALL ON FUNCTION public.registrar_cobro_pendiente() FROM PUBLIC;
