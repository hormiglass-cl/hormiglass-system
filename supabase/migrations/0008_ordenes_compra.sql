-- 0008: Ordenes de compra oficiales Hormiglass

ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS direccion TEXT,
  ADD COLUMN IF NOT EXISTS comuna TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT;

CREATE TABLE IF NOT EXISTS public.ordenes_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_oc TEXT NOT NULL UNIQUE,
  proveedor_id UUID NOT NULL REFERENCES public.proveedores(id),
  oportunidad_id UUID REFERENCES public.oportunidades(id),
  usuario_id UUID REFERENCES public.usuarios(id),
  fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'emitida', 'aprobada', 'recibida', 'cancelada')),
  envie_a_nombre TEXT NOT NULL DEFAULT 'Sociedad Inmobiliaria Hormiglass Spa',
  envie_a_rut TEXT NOT NULL DEFAULT '77.615.313-3',
  envie_a_contacto TEXT NOT NULL DEFAULT 'Isaac Calderon',
  envie_a_direccion TEXT NOT NULL DEFAULT 'Portezuelo 1502, San Bernardo.',
  envie_a_telefono TEXT NOT NULL DEFAULT '227253725',
  envie_a_email TEXT NOT NULL DEFAULT 'hormiglass@gmail.com',
  condicion_pago TEXT NOT NULL DEFAULT 'Contado',
  contacto_pago_nombre TEXT,
  contacto_pago_telefono TEXT,
  contacto_pago_email TEXT,
  instrucciones_especiales TEXT DEFAULT 'Retiro de fabrica.',
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  iva_porcentaje NUMERIC(5, 2) NOT NULL DEFAULT 19.00,
  monto_iva NUMERIC(12, 2) NOT NULL DEFAULT 0,
  costo_envio NUMERIC(12, 2) NOT NULL DEFAULT 0,
  otros_cargos NUMERIC(12, 2) NOT NULL DEFAULT 0,
  monto_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_ordenes_compra_updated_at ON public.ordenes_compra;
CREATE TRIGGER trg_ordenes_compra_updated_at
BEFORE UPDATE ON public.ordenes_compra
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.orden_compra_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_compra_id UUID NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  articulo_codigo TEXT,
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(12, 2) NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_item NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ordenes_compra_proveedor_id ON public.ordenes_compra (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_oportunidad_id ON public.ordenes_compra (oportunidad_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_usuario_id ON public.ordenes_compra (usuario_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_fecha_emision ON public.ordenes_compra (fecha_emision DESC);
CREATE INDEX IF NOT EXISTS idx_orden_compra_items_orden_compra_id ON public.orden_compra_items (orden_compra_id);

ALTER TABLE public.ordenes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orden_compra_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ordenes_compra_select" ON public.ordenes_compra;
DROP POLICY IF EXISTS "ordenes_compra_insert" ON public.ordenes_compra;
DROP POLICY IF EXISTS "ordenes_compra_update" ON public.ordenes_compra;
DROP POLICY IF EXISTS "ordenes_compra_delete" ON public.ordenes_compra;
CREATE POLICY "ordenes_compra_select" ON public.ordenes_compra FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "ordenes_compra_insert" ON public.ordenes_compra FOR INSERT TO authenticated WITH CHECK (has_role('ventas', 'administracion', 'finanzas'));
CREATE POLICY "ordenes_compra_update" ON public.ordenes_compra FOR UPDATE TO authenticated USING (has_role('ventas', 'administracion', 'finanzas')) WITH CHECK (has_role('ventas', 'administracion', 'finanzas'));
CREATE POLICY "ordenes_compra_delete" ON public.ordenes_compra FOR DELETE TO authenticated USING (has_role('admin'));

DROP POLICY IF EXISTS "orden_compra_items_select" ON public.orden_compra_items;
DROP POLICY IF EXISTS "orden_compra_items_insert" ON public.orden_compra_items;
DROP POLICY IF EXISTS "orden_compra_items_update" ON public.orden_compra_items;
DROP POLICY IF EXISTS "orden_compra_items_delete" ON public.orden_compra_items;
CREATE POLICY "orden_compra_items_select" ON public.orden_compra_items FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "orden_compra_items_insert" ON public.orden_compra_items FOR INSERT TO authenticated WITH CHECK (has_role('ventas', 'administracion', 'finanzas'));
CREATE POLICY "orden_compra_items_update" ON public.orden_compra_items FOR UPDATE TO authenticated USING (has_role('ventas', 'administracion', 'finanzas')) WITH CHECK (has_role('ventas', 'administracion', 'finanzas'));
CREATE POLICY "orden_compra_items_delete" ON public.orden_compra_items FOR DELETE TO authenticated USING (has_role('ventas', 'administracion', 'finanzas'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordenes_compra TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orden_compra_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.proveedores TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ordenes_compra;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orden_compra_items;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
