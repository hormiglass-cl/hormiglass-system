-- ESQUEMA DE BASE DE DATOS PARA CRM HORMIGLASS
-- Supabase Postgres SQL Schema
--
-- Este archivo documenta el estado base de la base (proyecto jvenwcupdllcqbxixcuo,
-- Postgres 17), leído inicialmente vía Supabase MCP el 2026-08-05 y actualizado
-- con las migraciones aplicadas hasta 0017 el 2026-08-21. Las migraciones en
-- supabase/migrations/ son la fuente ejecutable de verdad.
--
-- Notas:
--   - El esquema usa roles actuales de la app: `admin` y `user`.
--   - Las tablas de órdenes de compra están modeladas con RLS, grants acotados,
--     versionado y folio único.
--   - Algunas tablas operativas ajenas a OC conservan políticas históricas con
--     roles más granulares; no se amplían a `user` sin aprobación explícita.
--
-- Ver plans/plan-seguridad-supabase.md y supabase/migrations/ para el plan de
-- remediación completo.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- 1. Usuarios y Roles
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    rol TEXT NOT NULL CHECK (rol IN ('admin', 'user')),
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
    requiere_antecedentes BOOLEAN NOT NULL DEFAULT false,
    antecedentes JSONB NOT NULL DEFAULT '[]',
    tipo_venta TEXT DEFAULT 'Instalación',
    origen TEXT,
    modalidad_requerimiento TEXT NOT NULL DEFAULT 'instalacion'
      CHECK (modalidad_requerimiento IN ('solo_material', 'instalacion')),
    requiere_visita_terreno BOOLEAN DEFAULT false,
    tecnico_visita TEXT,
    tecnico_id UUID,
    responsable_visita_id UUID,
    fecha_visita_terreno TEXT,
    hora_visita_terreno TEXT,
    estado_visita TEXT DEFAULT 'programada',
    observaciones_visita TEXT,
    region TEXT,
    rama_destino TEXT CHECK (rama_destino IS NULL OR rama_destino IN ('produccion', 'reventa')),
    rama_definida_en TIMESTAMPTZ,
    rama_definida_por UUID REFERENCES public.usuarios(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.oportunidad_antecedentes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oportunidad_id UUID NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'otro'
      CHECK (tipo IN ('contrato', 'anexo', 'documento_empresa', 'documento_trabajador', 'otro')),
    bucket_id TEXT NOT NULL DEFAULT 'documentos',
    storage_path TEXT NOT NULL,
    public_url TEXT,
    mime_type TEXT,
    size_bytes BIGINT,
    subido_por_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    subido_por_nombre TEXT,
    eliminado BOOLEAN NOT NULL DEFAULT false,
    eliminado_en TIMESTAMPTZ,
    eliminado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS oportunidad_antecedentes_storage_path_key
  ON public.oportunidad_antecedentes (bucket_id, storage_path);
CREATE INDEX IF NOT EXISTS idx_oportunidad_antecedentes_oportunidad
  ON public.oportunidad_antecedentes (oportunidad_id, eliminado, created_at DESC);
CREATE TRIGGER trg_oportunidad_antecedentes_updated_at BEFORE UPDATE ON public.oportunidad_antecedentes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
    referencia_cliente TEXT,
    fecha_validez DATE,
    comentario_publico TEXT,
    fecha_inicio_compromiso DATE,
    fecha_limite_compromiso DATE,
    condiciones_pago TEXT,
    observaciones TEXT,
    fecha_aprobacion TIMESTAMPTZ,
    pdf_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_cotizaciones_updated_at BEFORE UPDATE ON public.cotizaciones
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cotizaciones_fecha_aprobacion BEFORE UPDATE ON public.cotizaciones
    FOR EACH ROW EXECUTE FUNCTION public.set_fecha_aprobacion();

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
    direccion TEXT,
    comuna TEXT,
    region TEXT,
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
    tipo TEXT DEFAULT 'comentario' CHECK (tipo IN ('comentario', 'actualizacion', 'abono', 'reclamo')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Personal de terreno / cuadrillas / encargados
CREATE TABLE IF NOT EXISTS public.personal_terreno (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    rut TEXT,
    tipo TEXT NOT NULL DEFAULT 'tecnico' CHECK (tipo IN ('tecnico', 'cuadrilla', 'encargado_fabricacion')),
    telefono TEXT,
    email TEXT,
    especialidad TEXT,
    calendario_visitas BOOLEAN NOT NULL DEFAULT TRUE,
    calendario_produccion_logistica BOOLEAN NOT NULL DEFAULT TRUE,
    activo BOOLEAN NOT NULL DEFAULT true,
    usuario_id UUID REFERENCES public.usuarios(id),
    observaciones TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_personal_terreno_updated_at BEFORE UPDATE ON public.personal_terreno
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_personal_terreno_tipo ON public.personal_terreno (tipo);
CREATE INDEX IF NOT EXISTS idx_personal_terreno_activo ON public.personal_terreno (activo);
CREATE INDEX IF NOT EXISTS idx_personal_terreno_cal_visitas ON public.personal_terreno (calendario_visitas) WHERE activo = TRUE;
CREATE INDEX IF NOT EXISTS idx_personal_terreno_cal_prod_log ON public.personal_terreno (calendario_produccion_logistica) WHERE activo = TRUE;
ALTER TABLE public.oportunidades
  ADD CONSTRAINT oportunidades_tecnico_id_fkey
  FOREIGN KEY (tecnico_id) REFERENCES public.personal_terreno(id) ON DELETE SET NULL;

-- 16. Visitas a Terreno (⚠️ RLS DESACTIVADO en vivo — ver Fase 3)
CREATE TABLE IF NOT EXISTS public.visitas_terreno (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oportunidad_id UUID REFERENCES public.oportunidades(id),
    tecnico_visita TEXT NOT NULL,
    fecha_visita_terreno TEXT NOT NULL,
    hora_visita_terreno TEXT,
    estado_visita TEXT DEFAULT 'programada',
    observaciones_visita TEXT,
    tecnico_id UUID REFERENCES public.personal_terreno(id),
    responsable_calendario_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()))
);

-- 17. Proyectos de Planificación (fabricación/instalación) (⚠️ RLS DESACTIVADO en vivo)
CREATE TABLE IF NOT EXISTS public.proyectos_planificacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oportunidad_id UUID UNIQUE REFERENCES public.oportunidades(id),
    codigo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    cliente_id UUID REFERENCES public.clientes(id),
    estado TEXT NOT NULL DEFAULT 'pendiente',
    fecha_estimada_instalacion TEXT,
    fecha_estimada_produccion TEXT,
    cuadrilla_id UUID REFERENCES public.personal_terreno(id),
    encargado_fabricacion_id UUID REFERENCES public.personal_terreno(id),
    observaciones TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. Órdenes de Reventa de Material (⚠️ RLS DESACTIVADO en vivo)
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
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.eventos_produccion_logistica (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contexto TEXT NOT NULL DEFAULT 'produccion_logistica' CHECK (contexto IN ('produccion_logistica', 'reventa_logistica')),
  oportunidad_id UUID NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  planificacion_id UUID REFERENCES public.proyectos_planificacion(id) ON DELETE SET NULL,
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN ('obra', 'produccion', 'reventa', 'logistica')),
  titulo TEXT NOT NULL,
  fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin TIMESTAMPTZ NOT NULL DEFAULT (NOW() + interval '1 hour'),
  fecha_evento DATE,
  hora_evento TEXT,
  responsable_id UUID REFERENCES public.personal_terreno(id) ON DELETE SET NULL,
  responsable_calendario_id UUID REFERENCES public.responsables_calendarios(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'por_hacer' CHECK (estado IN ('por_hacer', 'en_curso', 'reprogramado', 'completado', 'no_realizado')),
  observaciones TEXT,
  registrado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eventos_prod_log_op ON public.eventos_produccion_logistica (oportunidad_id);
CREATE INDEX IF NOT EXISTS idx_eventos_prod_log_contexto_fecha ON public.eventos_produccion_logistica (contexto, fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_eventos_prod_log_tipo_fecha ON public.eventos_produccion_logistica (tipo_evento, fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_eventos_prod_log_responsable ON public.eventos_produccion_logistica (responsable_id);
CREATE INDEX IF NOT EXISTS idx_eventos_prod_log_responsable_calendario ON public.eventos_produccion_logistica (responsable_calendario_id);

CREATE TABLE IF NOT EXISTS public.responsables_calendarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  rut TEXT,
  cargo TEXT,
  telefono TEXT,
  email TEXT,
  calendarios TEXT[] NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT responsables_calendarios_calendarios_check
    CHECK (calendarios <@ ARRAY['visitas_terreno', 'produccion_logistica']::TEXT[])
);
CREATE INDEX IF NOT EXISTS idx_responsables_calendarios_activo ON public.responsables_calendarios (activo);
CREATE INDEX IF NOT EXISTS idx_responsables_calendarios_calendarios ON public.responsables_calendarios USING GIN (calendarios);
ALTER TABLE public.oportunidades
  ADD CONSTRAINT oportunidades_responsable_visita_id_fkey
  FOREIGN KEY (responsable_visita_id) REFERENCES public.responsables_calendarios(id) ON DELETE SET NULL;
ALTER TABLE public.visitas_terreno
  ADD CONSTRAINT visitas_terreno_responsable_calendario_id_fkey
  FOREIGN KEY (responsable_calendario_id) REFERENCES public.responsables_calendarios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_oportunidades_rama_destino ON public.oportunidades (rama_destino);
CREATE INDEX IF NOT EXISTS idx_proyectos_plan_cuadrilla ON public.proyectos_planificacion (cuadrilla_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_plan_encargado ON public.proyectos_planificacion (encargado_fabricacion_id);
CREATE INDEX IF NOT EXISTS idx_visitas_terreno_tecnico_id ON public.visitas_terreno (tecnico_id);
CREATE INDEX IF NOT EXISTS idx_visitas_terreno_responsable_calendario ON public.visitas_terreno (responsable_calendario_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_responsable_visita ON public.oportunidades (responsable_visita_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_tecnico_id ON public.oportunidades (tecnico_id);

-- 19. Producción diaria por oportunidad/producto
CREATE TABLE IF NOT EXISTS public.produccion_diaria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oportunidad_id UUID NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
    cotizacion_id UUID REFERENCES public.cotizaciones(id),
    cotizacion_item_id UUID REFERENCES public.cotizacion_items(id) ON DELETE SET NULL,
    producto TEXT NOT NULL,
    cantidad_producida NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cantidad_producida >= 0),
    fecha_produccion DATE NOT NULL DEFAULT CURRENT_DATE,
    responsable_id UUID REFERENCES public.personal_terreno(id),
    responsable_calendario_id UUID REFERENCES public.responsables_calendarios(id) ON DELETE SET NULL,
    observaciones TEXT,
    registrado_por UUID REFERENCES public.usuarios(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_produccion_diaria_updated_at BEFORE UPDATE ON public.produccion_diaria
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_produccion_diaria_oportunidad ON public.produccion_diaria (oportunidad_id);
CREATE INDEX IF NOT EXISTS idx_produccion_diaria_fecha ON public.produccion_diaria (fecha_produccion DESC);
CREATE INDEX IF NOT EXISTS idx_produccion_diaria_op_prod ON public.produccion_diaria (oportunidad_id, producto);

-- 20. Órdenes de Compra oficiales Hormiglass
CREATE TABLE IF NOT EXISTS public.ordenes_compra (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_oc TEXT NOT NULL UNIQUE,
    proveedor_id UUID NOT NULL REFERENCES public.proveedores(id),
    oportunidad_id UUID REFERENCES public.oportunidades(id),
    usuario_id UUID REFERENCES public.usuarios(id),
    fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
    version INTEGER NOT NULL DEFAULT 1,
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
CREATE TRIGGER trg_ordenes_compra_updated_at BEFORE UPDATE ON public.ordenes_compra
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_proveedor_id ON public.ordenes_compra (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_oportunidad_id ON public.ordenes_compra (oportunidad_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_usuario_id ON public.ordenes_compra (usuario_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_fecha_emision ON public.ordenes_compra (fecha_emision DESC);

CREATE TABLE IF NOT EXISTS public.orden_compra_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orden_compra_id UUID NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
    articulo_codigo TEXT,
    descripcion TEXT NOT NULL,
    cantidad NUMERIC(12, 2) NOT NULL DEFAULT 1,
    precio_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_item NUMERIC(12, 2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_orden_compra_items_orden_compra_id ON public.orden_compra_items (orden_compra_id);

-- No existe tabla `abonos`. Los pagos/abonos viven en oportunidades.comprobantes_pago
-- (jsonb). Cualquier query que haga `.select('*, abonos(*)')` (planificacion,
-- reventa) está referenciando una relación que no existe — se corrige en Fase 4.

-- ============================================================
-- Funciones auxiliares
-- ============================================================

-- get_current_user_role(): código legado sin uso actual en políticas.
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u_rol TEXT;
BEGIN
    SELECT rol
      INTO u_rol
      FROM public.usuarios
     WHERE auth_id = auth.uid()
       AND activo = true
     LIMIT 1;

    RETURN u_rol;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_current_user_role() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.current_usuario_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT id FROM public.usuarios WHERE auth_id = auth.uid() AND activo = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_rol()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT rol FROM public.usuarios WHERE auth_id = auth.uid() AND activo = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((SELECT true FROM public.usuarios WHERE auth_id = auth.uid() AND activo = true LIMIT 1), false);
$$;

CREATE OR REPLACE FUNCTION public.has_role(VARIADIC roles text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT public.current_rol() = ANY(roles) OR public.current_rol() = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.backfill_usuarios_auth_id()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.usuarios u
    SET auth_id = a.id
    FROM auth.users a
    WHERE lower(a.email) = lower(u.email) AND u.auth_id IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.usuarios
    SET auth_id = NEW.id
    WHERE lower(email) = lower(NEW.email) AND auth_id IS NULL;

    IF NOT FOUND THEN
        INSERT INTO public.usuarios (auth_id, nombre, email, rol, activo)
        VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email), NEW.email, 'user', false);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

REVOKE EXECUTE ON FUNCTION public.backfill_usuarios_auth_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_delete_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_update_user_auth_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_user_admin(text, text, text, text) FROM PUBLIC, anon;

-- ============================================================
-- RLS — estado real (permisivo). La Fase 3 del plan de seguridad reemplaza
-- todo este bloque por políticas basadas en rol. NO editar a mano sin pasar
-- por supabase/migrations/.
-- ============================================================

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_actividad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidad_antecedentes ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE public.personal_terreno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produccion_diaria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orden_compra_items ENABLE ROW LEVEL SECURITY;
-- visitas_terreno, proyectos_planificacion, ordenes_reventa: RLS DESACTIVADO en vivo (sin ALTER siquiera).

CREATE POLICY "Acceso total usuarios anon y auth" ON public.usuarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total clientes anon y auth" ON public.clientes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total notas anon y auth" ON public.notas_actividad FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permissive Oportunidades Policy" ON public.oportunidades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "oportunidad_antecedentes_select" ON public.oportunidad_antecedentes
  FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "oportunidad_antecedentes_insert" ON public.oportunidad_antecedentes
  FOR INSERT TO authenticated WITH CHECK (has_role('user'));
CREATE POLICY "oportunidad_antecedentes_update" ON public.oportunidad_antecedentes
  FOR UPDATE TO authenticated
  USING (has_role('user'))
  WITH CHECK (has_role('user'));
CREATE POLICY "oportunidad_antecedentes_delete" ON public.oportunidad_antecedentes
  FOR DELETE TO authenticated USING (has_role('admin'));
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
CREATE POLICY "personal_terreno_select" ON public.personal_terreno
  FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "personal_terreno_write" ON public.personal_terreno
  FOR ALL TO authenticated
  USING (has_role('admin', 'administracion', 'programacion'))
  WITH CHECK (has_role('admin', 'administracion', 'programacion'));
CREATE POLICY "produccion_diaria_select" ON public.produccion_diaria
  FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "produccion_diaria_write" ON public.produccion_diaria
  FOR ALL TO authenticated
  USING (has_role('admin', 'administracion', 'programacion'))
  WITH CHECK (has_role('admin', 'administracion', 'programacion'));
CREATE POLICY "ordenes_compra_select" ON public.ordenes_compra
  FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "ordenes_compra_insert" ON public.ordenes_compra
  FOR INSERT TO authenticated WITH CHECK (has_role('user'));
CREATE POLICY "ordenes_compra_update" ON public.ordenes_compra
  FOR UPDATE TO authenticated
  USING (has_role('user'))
  WITH CHECK (has_role('user'));
CREATE POLICY "ordenes_compra_delete" ON public.ordenes_compra
  FOR DELETE TO authenticated USING (has_role('admin'));
CREATE POLICY "orden_compra_items_select" ON public.orden_compra_items
  FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "orden_compra_items_insert" ON public.orden_compra_items
  FOR INSERT TO authenticated WITH CHECK (has_role('user'));
CREATE POLICY "orden_compra_items_update" ON public.orden_compra_items
  FOR UPDATE TO authenticated
  USING (has_role('user'))
  WITH CHECK (has_role('user'));
CREATE POLICY "orden_compra_items_delete" ON public.orden_compra_items
  FOR DELETE TO authenticated USING (has_role('user'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_terreno TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produccion_diaria TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oportunidad_antecedentes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordenes_compra TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orden_compra_items TO authenticated;

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
