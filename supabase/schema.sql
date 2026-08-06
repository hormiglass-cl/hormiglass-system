-- ESQUEMA DE BASE DE DATOS PARA CRM HORMIGLASS
-- Supabase Postgres SQL Schema
--
-- Este archivo documenta el ESTADO REAL de la base (proyecto jvenwcupdllcqbxixcuo,
-- Postgres 17) leído directamente vía Supabase MCP el 2026-08-05. Reemplaza la
-- versión anterior, que estaba desincronizada: faltaban 7 tablas que la app ya
-- usa en producción y varias columnas de las tablas documentadas.
--
-- ⚠️ SEGURIDAD — snapshot al momento de este dump (antes de aplicar las
-- migraciones de supabase/migrations/):
--   - RLS "activado" pero con políticas `USING (true) WITH CHECK (true)` en 14
--     de 17 tablas + en el bucket cotizaciones-pdf → anon+authenticated tienen
--     CRUD completo vía la anon key pública.
--   - RLS *desactivado por completo* (ni siquiera política abierta) en
--     visitas_terreno, proyectos_planificacion, ordenes_reventa.
--   - auth.users está vacía — no existe ni una sola cuenta de Supabase Auth.
--     Los 3 usuarios reales (usuarios.auth_id = NULL) inician sesión hoy solo
--     con el email, sin verificar contraseña (ver Fase 1 del plan de seguridad).
--   - El bucket `documentos` (comprobantes de pago) NO existe en Storage —
--     el código que lo referencia en app/ventas/page.tsx está actualmente roto.
--   - get_current_user_role() no tiene search_path fijo, es invocable por
--     `anon`/`authenticated` vía RPC, y falla abierto a 'admin' cuando no
--     encuentra un usuario — no se usa en ninguna política hoy (código muerto),
--     pero cualquiera puede confirmarlo llamando /rest/v1/rpc/get_current_user_role.
--
-- Ver plans/plan-seguridad-supabase.md y supabase/migrations/ para el plan de
-- remediación completo.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Usuarios y Roles
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
CREATE TRIGGER trg_usuarios_updated_at BEFORE UPDATE ON public.usuarios
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Clientes
CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    apellido_razon_social TEXT,
    rut TEXT NOT NULL,
    tipo_cliente TEXT DEFAULT 'juridica' CHECK (tipo_cliente IN ('natural', 'juridica')),
    telefono TEXT,
    correo TEXT,
    correos_secundarios TEXT[],
    direccion TEXT,
    comuna TEXT,
    region TEXT,
    nicho TEXT,
    tipo_venta TEXT DEFAULT 'Instalación',
    asignado_a UUID REFERENCES public.usuarios(id),
    created_by UUID REFERENCES public.usuarios(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_clientes_updated_at BEFORE UPDATE ON public.clientes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Notas de Actividad (timeline de clientes)
CREATE TABLE IF NOT EXISTS public.notas_actividad (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES public.usuarios(id),
    contenido TEXT NOT NULL,
    tipo_actividad TEXT DEFAULT 'nota',
    fecha_recordatorio TIMESTAMPTZ,
    hora_recordatorio TEXT,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Oportunidades (pipeline comercial — reemplazó a `ventas`, ver nota abajo)
CREATE TABLE IF NOT EXISTS public.oportunidades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT NOT NULL UNIQUE,
    titulo TEXT NOT NULL,
    cliente_id UUID REFERENCES public.clientes(id),
    estado_pipeline TEXT DEFAULT 'nueva', -- sin CHECK en vivo; TS define los 16 estados válidos
    fecha_inicio DATE DEFAULT CURRENT_DATE,
    fecha_limite DATE,
    modalidad_entrega TEXT DEFAULT 'retiro',
    condicion_pago TEXT DEFAULT 'total',
    monto_abonado NUMERIC DEFAULT 0,
    asignado_a UUID REFERENCES public.usuarios(id),
    prioridad TEXT DEFAULT 'urgente',
    productos JSONB DEFAULT '[]',
    monto_estimado NUMERIC DEFAULT 0,
    probabilidad NUMERIC DEFAULT 50,
    comprobantes_pago JSONB DEFAULT '[]',
    notas_venta JSONB DEFAULT '[]',
    ordenes_compra JSONB DEFAULT '[]',
    chat_interno JSONB DEFAULT '[]',
    tipo_venta TEXT DEFAULT 'Instalación',
    requiere_visita_terreno BOOLEAN DEFAULT false,
    tecnico_visita TEXT,
    fecha_visita_terreno TEXT,
    hora_visita_terreno TEXT,
    estado_visita TEXT DEFAULT 'programada',
    observaciones_visita TEXT,
    region TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Cotizaciones
CREATE TABLE IF NOT EXISTS public.cotizaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_cotizacion TEXT NOT NULL UNIQUE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id),
    usuario_id UUID REFERENCES public.usuarios(id),
    oportunidad_id UUID REFERENCES public.oportunidades(id),
    version INTEGER DEFAULT 1,
    estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviada', 'aprobada', 'rechazada')),
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    descuento NUMERIC(12, 2) NOT NULL DEFAULT 0,
    iva_porcentaje NUMERIC(5, 2) NOT NULL DEFAULT 19.00,
    monto_iva NUMERIC(12, 2) NOT NULL DEFAULT 0,
    monto_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    plazo_entrega TEXT,
    fecha_inicio_compromiso DATE,
    fecha_limite_compromiso DATE,
    condiciones_pago TEXT,
    observaciones TEXT,
    pdf_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_cotizaciones_updated_at BEFORE UPDATE ON public.cotizaciones
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Ítems de Cotización
CREATE TABLE IF NOT EXISTS public.cotizacion_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id UUID NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
    producto TEXT NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 1,
    precio_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0,
    descuento_porcentaje NUMERIC(5, 2) DEFAULT 0,
    total_item NUMERIC(12, 2) NOT NULL DEFAULT 0
);

-- 7. Ventas (LEGACY — 0 filas, ninguna página la consulta; superseded by
--    `oportunidades`. Se mantiene por compatibilidad, RLS deny-all en Fase 3.)
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
CREATE TRIGGER trg_ventas_updated_at BEFORE UPDATE ON public.ventas
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
COMMENT ON TABLE public.ventas IS 'DEPRECATED — superseded by public.oportunidades. 0 filas, no queried by the app.';

-- 8. Proveedores
CREATE TABLE IF NOT EXISTS public.proveedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    rut TEXT NOT NULL,
    contacto TEXT,
    telefono TEXT,
    correo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Pedidos a Proveedor
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

-- 10. Movimientos de Caja
CREATE TABLE IF NOT EXISTS public.caja_movimientos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
    monto NUMERIC(12, 2) NOT NULL DEFAULT 0,
    categoria TEXT NOT NULL,
    descripcion TEXT,
    venta_id UUID REFERENCES public.ventas(id),
    pedido_proveedor_id UUID REFERENCES public.pedidos_proveedor(id),
    usuario_id UUID REFERENCES public.usuarios(id), -- nullable en vivo hoy; app/caja/page.tsx debe dejar de mandar null (Fase 4)
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Notificaciones
CREATE TABLE IF NOT EXISTS public.notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES public.usuarios(id),
    mensaje TEXT NOT NULL,
    tipo TEXT DEFAULT 'info',
    leido BOOLEAN DEFAULT false,
    entidad_relacionada TEXT,
    link_url TEXT,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Campos Personalizados (metadata de configuración del CRM; id es TEXT
--     porque se siembra con ids fijos como 'sys-cli-1')
CREATE TABLE IF NOT EXISTS public.campos_personalizados (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    campo_supabase TEXT NOT NULL,
    entidad TEXT NOT NULL,
    tipo TEXT NOT NULL,
    opciones TEXT[],
    es_sistema BOOLEAN DEFAULT false,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Log de Auditoría del Sistema
CREATE TABLE IF NOT EXISTS public.logs_sistema (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_accion TEXT NOT NULL,
    entidad TEXT NOT NULL,
    entidad_id TEXT,
    descripcion TEXT NOT NULL,
    usuario_id UUID REFERENCES public.usuarios(id),
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Actividades / Chat interno de una Oportunidad
CREATE TABLE IF NOT EXISTS public.actividades_op (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oportunidad_id UUID REFERENCES public.oportunidades(id),
    usuario_id UUID REFERENCES public.usuarios(id),
    usuario_nombre TEXT NOT NULL,
    contenido TEXT NOT NULL,
    tipo TEXT DEFAULT 'comentario',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Visitas a Terreno (⚠️ RLS DESACTIVADO en vivo — ver Fase 3)
CREATE TABLE IF NOT EXISTS public.visitas_terreno (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oportunidad_id UUID REFERENCES public.oportunidades(id),
    tecnico_visita TEXT NOT NULL,
    fecha_visita_terreno TEXT NOT NULL,
    hora_visita_terreno TEXT,
    estado_visita TEXT DEFAULT 'programada',
    observaciones_visita TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()))
);

-- 16. Proyectos de Planificación (fabricación/instalación) (⚠️ RLS DESACTIVADO en vivo)
CREATE TABLE IF NOT EXISTS public.proyectos_planificacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oportunidad_id UUID UNIQUE REFERENCES public.oportunidades(id),
    codigo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    cliente_id UUID REFERENCES public.clientes(id),
    estado TEXT NOT NULL DEFAULT 'pendiente',
    fecha_estimada_instalacion TEXT,
    fecha_estimada_produccion TEXT,
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. Órdenes de Reventa de Material (⚠️ RLS DESACTIVADO en vivo)
CREATE TABLE IF NOT EXISTS public.ordenes_reventa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oportunidad_id UUID UNIQUE REFERENCES public.oportunidades(id),
    codigo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    cliente_id UUID REFERENCES public.clientes(id),
    proveedor_nombre TEXT,
    estado TEXT NOT NULL DEFAULT 'coordinacion_proveedor',
    fecha_despacho TEXT,
    observaciones TEXT,
    notas_postventa TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- No existe tabla `abonos`. Los pagos/abonos viven en oportunidades.comprobantes_pago
-- (jsonb). Cualquier query que haga `.select('*, abonos(*)')` (planificacion,
-- reventa) está referenciando una relación que no existe — se corrige en Fase 4.

-- ============================================================
-- Funciones auxiliares
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- get_current_user_role(): código muerto (ninguna política lo usa hoy), con
-- dos defectos de seguridad — ver cabecera del archivo. Se reemplaza en la
-- Fase 3 (current_rol/current_usuario_id/has_role, con SET search_path fijo
-- y sin fallback a 'admin'). Se deja documentada tal cual vive en producción.
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
DECLARE
    u_rol TEXT;
BEGIN
    SELECT rol INTO u_rol FROM public.usuarios WHERE auth_id = auth.uid() OR id = auth.uid() AND activo = true LIMIT 1;
    IF u_rol IS NULL THEN
        u_rol := 'admin'; -- fail-open, ver advertencia
    END IF;
    RETURN u_rol;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RLS — estado real (permisivo). La Fase 3 del plan de seguridad reemplaza
-- todo este bloque por políticas basadas en rol. NO editar a mano sin pasar
-- por supabase/migrations/.
-- ============================================================

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_actividad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caja_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campos_personalizados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actividades_op ENABLE ROW LEVEL SECURITY;
-- visitas_terreno, proyectos_planificacion, ordenes_reventa: RLS DESACTIVADO en vivo (sin ALTER siquiera).

CREATE POLICY "Acceso total usuarios anon y auth" ON public.usuarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total clientes anon y auth" ON public.clientes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total notas anon y auth" ON public.notas_actividad FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permissive Oportunidades Policy" ON public.oportunidades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total cotizaciones anon y auth" ON public.cotizaciones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total cotizacion_items anon y auth" ON public.cotizacion_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total ventas anon y auth" ON public.ventas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total proveedores anon y auth" ON public.proveedores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total pedidos_proveedor anon y auth" ON public.pedidos_proveedor FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total caja anon y auth" ON public.caja_movimientos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total notificaciones anon y auth" ON public.notificaciones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access for campos_personalizados" ON public.campos_personalizados FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on logs_sistema" ON public.logs_sistema FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permissive Actividades Op Policy" ON public.actividades_op FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Storage
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('cotizaciones-pdf', 'cotizaciones-pdf', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Read Storage PDFs" ON storage.objects FOR SELECT USING (bucket_id = 'cotizaciones-pdf');
CREATE POLICY "Public Insert Storage PDFs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'cotizaciones-pdf');
CREATE POLICY "Public Update Storage PDFs" ON storage.objects FOR UPDATE USING (bucket_id = 'cotizaciones-pdf');
CREATE POLICY "Public Delete Storage PDFs" ON storage.objects FOR DELETE USING (bucket_id = 'cotizaciones-pdf');

-- Bucket `documentos` (comprobantes de pago, referenciado por app/ventas/page.tsx)
-- NO existe en vivo. Se crea en la Fase 3 (supabase/migrations/0005_storage_policies.sql)
-- como bucket privado + URLs firmadas, según decisión del usuario.

-- ============================================================
-- Realtime — tablas en la publicación supabase_realtime (confirmado en vivo)
-- ============================================================
-- Incluidas: actividades_op, clientes, cotizacion_items, cotizaciones,
--   notas_actividad, notificaciones, oportunidades, ordenes_reventa,
--   proveedores, proyectos_planificacion, usuarios, visitas_terreno.
-- Faltan (bloquea Fase 5 hasta agregarlas): caja_movimientos,
--   campos_personalizados, logs_sistema, pedidos_proveedor, ventas.
