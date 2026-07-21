-- ESQUEMA DE BASE DE DATOS PARA CRM HORMIGLASS
-- Supabase Postgres SQL Schema

-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Usuarios y Roles
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    rol TEXT NOT NULL CHECK (rol IN ('admin', 'ventas', 'finanzas', 'administracion', 'programacion')),
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Función auxiliar para obtener el rol del usuario autenticado
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
DECLARE
    u_rol TEXT;
BEGIN
    SELECT rol INTO u_rol FROM public.usuarios WHERE auth_id = auth.uid() OR id = auth.uid() AND activo = true LIMIT 1;
    IF u_rol IS NULL THEN
        u_rol := 'admin'; -- Default fallback para desarrollo
    END IF;
    RETURN u_rol;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_usuarios_updated_at
BEFORE UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Tabla de Clientes
CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    apellido_razon_social TEXT,
    rut TEXT NOT NULL,
    tipo_cliente TEXT NOT NULL CHECK (tipo_cliente IN ('natural', 'juridica')),
    telefono TEXT,
    correo TEXT,
    direccion TEXT,
    comuna TEXT,
    asignado_a UUID REFERENCES public.usuarios(id),
    created_by UUID REFERENCES public.usuarios(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_clientes_updated_at
BEFORE UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Tabla de Notas de Actividad
CREATE TABLE IF NOT EXISTS public.notas_actividad (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id),
    contenido TEXT NOT NULL,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tabla de Cotizaciones
CREATE TABLE IF NOT EXISTS public.cotizaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_cotizacion TEXT NOT NULL UNIQUE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id),
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id),
    estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviada', 'aprobada', 'rechazada')),
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    descuento NUMERIC(12, 2) NOT NULL DEFAULT 0,
    iva_porcentaje NUMERIC(5, 2) NOT NULL DEFAULT 19.00,
    monto_iva NUMERIC(12, 2) NOT NULL DEFAULT 0,
    monto_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    plazo_entrega TEXT,
    condiciones_pago TEXT,
    observaciones TEXT,
    pdf_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_cotizaciones_updated_at
BEFORE UPDATE ON public.cotizaciones
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Tabla de Ítems de Cotización
CREATE TABLE IF NOT EXISTS public.cotizacion_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id UUID NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
    producto TEXT NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 1,
    precio_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0,
    descuento_porcentaje NUMERIC(5, 2) DEFAULT 0,
    total_item NUMERIC(12, 2) NOT NULL DEFAULT 0
);

-- 6. Tabla de Ventas
CREATE TABLE IF NOT EXISTS public.ventas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_venta TEXT NOT NULL UNIQUE,
    cotizacion_id UUID REFERENCES public.cotizaciones(id),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id),
    tipo_venta TEXT NOT NULL DEFAULT 'directa' CHECK (tipo_venta IN ('directa', 'programacion')),
    modalidad_entrega TEXT NOT NULL DEFAULT 'despacho' CHECK (modalidad_entrega IN ('retiro', 'despacho', 'instalacion')),
    condicion_pago TEXT NOT NULL DEFAULT 'total' CHECK (condicion_pago IN ('total', 'abono50', 'oc', 'especial')),
    medio_pago TEXT NOT NULL DEFAULT 'transferencia' CHECK (medio_pago IN ('efectivo', 'transferencia', 'debito', 'credito', 'webpay', 'cheque')),
    monto_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    monto_abonado NUMERIC(12, 2) NOT NULL DEFAULT 0,
    saldo_pendiente NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tipo_documento TEXT DEFAULT 'factura' CHECK (tipo_documento IN ('boleta', 'factura', 'factura_anticipo', 'nota_venta')),
    numero_documento TEXT,
    estado_pipeline TEXT NOT NULL DEFAULT 'nueva' CHECK (estado_pipeline IN ('nueva', 'pagada', 'programada', 'entregada')),
    fecha_solicitada DATE,
    fecha_comprometida DATE,
    asignado_a UUID REFERENCES public.usuarios(id),
    aprobado_admin BOOLEAN DEFAULT false,
    incluye_escombros BOOLEAN DEFAULT false,
    comision_registrada BOOLEAN DEFAULT false,
    poliza_emitida BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_ventas_updated_at
BEFORE UPDATE ON public.ventas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Tabla de Proveedores
CREATE TABLE IF NOT EXISTS public.proveedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    rut TEXT NOT NULL,
    contacto TEXT,
    telefono TEXT,
    correo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Tabla de Pedidos a Proveedor
CREATE TABLE IF NOT EXISTS public.pedidos_proveedor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_id UUID NOT NULL REFERENCES public.proveedores(id),
    venta_id UUID REFERENCES public.ventas(id),
    descripcion TEXT NOT NULL,
    monto NUMERIC(12, 2) NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'solicitado' CHECK (estado IN ('solicitado', 'oc_generada', 'esperando_entrega', 'recibido')),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Tabla de Movimientos de Caja
CREATE TABLE IF NOT EXISTS public.caja_movimientos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
    monto NUMERIC(12, 2) NOT NULL DEFAULT 0,
    categoria TEXT NOT NULL,
    descripcion TEXT,
    venta_id UUID REFERENCES public.ventas(id),
    pedido_proveedor_id UUID REFERENCES public.pedidos_proveedor(id),
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id),
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Tabla de Notificaciones
CREATE TABLE IF NOT EXISTS public.notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id),
    mensaje TEXT NOT NULL,
    tipo TEXT DEFAULT 'info',
    leido BOOLEAN DEFAULT false,
    entidad_relacionada TEXT,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- POLÍTICAS RLS (Row Level Security)

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_actividad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caja_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso total usuarios anon y auth" ON public.usuarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total clientes anon y auth" ON public.clientes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total notas anon y auth" ON public.notas_actividad FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total cotizaciones anon y auth" ON public.cotizaciones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total cotizacion_items anon y auth" ON public.cotizacion_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total ventas anon y auth" ON public.ventas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total proveedores anon y auth" ON public.proveedores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total pedidos_proveedor anon y auth" ON public.pedidos_proveedor FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total caja anon y auth" ON public.caja_movimientos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total notificaciones anon y auth" ON public.notificaciones FOR ALL USING (true) WITH CHECK (true);

-- Crear bucket de storage para PDFs de cotizaciones
INSERT INTO storage.buckets (id, name, public) 
VALUES ('cotizaciones-pdf', 'cotizaciones-pdf', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Read Storage PDFs" ON storage.objects FOR SELECT USING (bucket_id = 'cotizaciones-pdf');
CREATE POLICY "Public Insert Storage PDFs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'cotizaciones-pdf');
CREATE POLICY "Public Update Storage PDFs" ON storage.objects FOR UPDATE USING (bucket_id = 'cotizaciones-pdf');
CREATE POLICY "Public Delete Storage PDFs" ON storage.objects FOR DELETE USING (bucket_id = 'cotizaciones-pdf');

