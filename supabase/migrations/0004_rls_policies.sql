-- 0004: Políticas RLS por tabla y revocación total de permisos anónimos.

-- 1. Bloqueo Base: Quitar todos los permisos de la API anónima (anon key).
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- Otorgar uso general a usuarios autenticados.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 2. Habilitar RLS en las 17 tablas.
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_actividad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actividades_op ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas_terreno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proyectos_planificacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_reventa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caja_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campos_personalizados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;

-- 3. Limpiar políticas previas totalmente permisivas si existen.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- 4. POLÍTICAS DE LECTURA (GENERALMENTE ABIERTAS PARA USUARIOS AUTENTICADOS ACTIVOS)

-- usuarios
CREATE POLICY "usuarios_select" ON public.usuarios FOR SELECT TO authenticated USING ((auth_id = auth.uid()) OR is_active_user());
CREATE POLICY "usuarios_update_admin" ON public.usuarios FOR UPDATE TO authenticated USING (has_role('admin')) WITH CHECK (has_role('admin'));
CREATE POLICY "usuarios_update_self" ON public.usuarios FOR UPDATE TO authenticated USING (id = current_usuario_id()) WITH CHECK (id = current_usuario_id());
CREATE POLICY "usuarios_delete_admin" ON public.usuarios FOR DELETE TO authenticated USING (has_role('admin') AND id <> current_usuario_id());

-- clientes
CREATE POLICY "clientes_select" ON public.clientes FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "clientes_insert" ON public.clientes FOR INSERT TO authenticated WITH CHECK (has_role('ventas', 'administracion'));
CREATE POLICY "clientes_update" ON public.clientes FOR UPDATE TO authenticated USING (has_role('ventas', 'administracion')) WITH CHECK (has_role('ventas', 'administracion'));
CREATE POLICY "clientes_delete" ON public.clientes FOR DELETE TO authenticated USING (has_role('admin'));

-- notas_actividad
CREATE POLICY "notas_actividad_select" ON public.notas_actividad FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "notas_actividad_insert" ON public.notas_actividad FOR INSERT TO authenticated WITH CHECK (is_active_user());
CREATE POLICY "notas_actividad_update" ON public.notas_actividad FOR UPDATE TO authenticated USING (has_role('admin'));
CREATE POLICY "notas_actividad_delete" ON public.notas_actividad FOR DELETE TO authenticated USING (has_role('admin'));

-- cotizaciones
CREATE POLICY "cotizaciones_select" ON public.cotizaciones FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "cotizaciones_insert" ON public.cotizaciones FOR INSERT TO authenticated WITH CHECK (has_role('ventas'));
CREATE POLICY "cotizaciones_update" ON public.cotizaciones FOR UPDATE TO authenticated USING (has_role('ventas')) WITH CHECK (has_role('ventas'));
CREATE POLICY "cotizaciones_delete" ON public.cotizaciones FOR DELETE TO authenticated USING (has_role('ventas'));

-- cotizacion_items
CREATE POLICY "cotizacion_items_select" ON public.cotizacion_items FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "cotizacion_items_insert" ON public.cotizacion_items FOR INSERT TO authenticated WITH CHECK (has_role('ventas'));
CREATE POLICY "cotizacion_items_update" ON public.cotizacion_items FOR UPDATE TO authenticated USING (has_role('ventas')) WITH CHECK (has_role('ventas'));
CREATE POLICY "cotizacion_items_delete" ON public.cotizacion_items FOR DELETE TO authenticated USING (has_role('ventas'));

-- oportunidades
CREATE POLICY "oportunidades_select" ON public.oportunidades FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "oportunidades_insert" ON public.oportunidades FOR INSERT TO authenticated WITH CHECK (has_role('ventas'));
CREATE POLICY "oportunidades_update" ON public.oportunidades FOR UPDATE TO authenticated USING (has_role('ventas', 'finanzas', 'programacion', 'administracion')) WITH CHECK (has_role('ventas', 'finanzas', 'programacion', 'administracion'));
CREATE POLICY "oportunidades_delete" ON public.oportunidades FOR DELETE TO authenticated USING (has_role('admin'));

-- actividades_op
CREATE POLICY "actividades_op_select" ON public.actividades_op FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "actividades_op_insert" ON public.actividades_op FOR INSERT TO authenticated WITH CHECK (is_active_user());
CREATE POLICY "actividades_op_delete" ON public.actividades_op FOR DELETE TO authenticated USING (has_role('admin'));

-- visitas_terreno
CREATE POLICY "visitas_terreno_select" ON public.visitas_terreno FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "visitas_terreno_insert" ON public.visitas_terreno FOR INSERT TO authenticated WITH CHECK (has_role('ventas', 'programacion'));
CREATE POLICY "visitas_terreno_update" ON public.visitas_terreno FOR UPDATE TO authenticated USING (has_role('ventas', 'programacion')) WITH CHECK (has_role('ventas', 'programacion'));
CREATE POLICY "visitas_terreno_delete" ON public.visitas_terreno FOR DELETE TO authenticated USING (has_role('ventas', 'programacion'));

-- proyectos_planificacion (soporta upsert)
CREATE POLICY "proyectos_planificacion_select" ON public.proyectos_planificacion FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "proyectos_planificacion_insert" ON public.proyectos_planificacion FOR INSERT TO authenticated WITH CHECK (has_role('ventas', 'programacion'));
CREATE POLICY "proyectos_planificacion_update" ON public.proyectos_planificacion FOR UPDATE TO authenticated USING (has_role('ventas', 'programacion')) WITH CHECK (has_role('ventas', 'programacion'));
CREATE POLICY "proyectos_planificacion_delete" ON public.proyectos_planificacion FOR DELETE TO authenticated USING (has_role('admin'));

-- ordenes_reventa (soporta upsert)
CREATE POLICY "ordenes_reventa_select" ON public.ordenes_reventa FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "ordenes_reventa_insert" ON public.ordenes_reventa FOR INSERT TO authenticated WITH CHECK (has_role('ventas', 'programacion'));
CREATE POLICY "ordenes_reventa_update" ON public.ordenes_reventa FOR UPDATE TO authenticated USING (has_role('ventas', 'programacion')) WITH CHECK (has_role('ventas', 'programacion'));
CREATE POLICY "ordenes_reventa_delete" ON public.ordenes_reventa FOR DELETE TO authenticated USING (has_role('admin'));

-- proveedores
CREATE POLICY "proveedores_select" ON public.proveedores FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "proveedores_insert" ON public.proveedores FOR INSERT TO authenticated WITH CHECK (has_role('administracion', 'finanzas'));
CREATE POLICY "proveedores_update" ON public.proveedores FOR UPDATE TO authenticated USING (has_role('administracion', 'finanzas')) WITH CHECK (has_role('administracion', 'finanzas'));
CREATE POLICY "proveedores_delete" ON public.proveedores FOR DELETE TO authenticated USING (has_role('admin'));

-- pedidos_proveedor
CREATE POLICY "pedidos_proveedor_select" ON public.pedidos_proveedor FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "pedidos_proveedor_insert" ON public.pedidos_proveedor FOR INSERT TO authenticated WITH CHECK (has_role('administracion', 'finanzas'));
CREATE POLICY "pedidos_proveedor_update" ON public.pedidos_proveedor FOR UPDATE TO authenticated USING (has_role('administracion', 'finanzas')) WITH CHECK (has_role('administracion', 'finanzas'));
CREATE POLICY "pedidos_proveedor_delete" ON public.pedidos_proveedor FOR DELETE TO authenticated USING (has_role('admin'));

-- caja_movimientos
CREATE POLICY "caja_movimientos_select" ON public.caja_movimientos FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "caja_movimientos_insert" ON public.caja_movimientos FOR INSERT TO authenticated WITH CHECK (has_role('finanzas'));
CREATE POLICY "caja_movimientos_update" ON public.caja_movimientos FOR UPDATE TO authenticated USING (has_role('admin')) WITH CHECK (has_role('admin'));
CREATE POLICY "caja_movimientos_delete" ON public.caja_movimientos FOR DELETE TO authenticated USING (has_role('admin'));

-- notificaciones
CREATE POLICY "notificaciones_select" ON public.notificaciones FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "notificaciones_insert" ON public.notificaciones FOR INSERT TO authenticated WITH CHECK (is_active_user());
CREATE POLICY "notificaciones_update" ON public.notificaciones FOR UPDATE TO authenticated USING (usuario_id = current_usuario_id() OR has_role('admin')) WITH CHECK (usuario_id = current_usuario_id() OR has_role('admin'));
CREATE POLICY "notificaciones_delete" ON public.notificaciones FOR DELETE TO authenticated USING (usuario_id = current_usuario_id() OR has_role('admin'));

-- campos_personalizados (excepción para ventas en nicho)
CREATE POLICY "campos_personalizados_select" ON public.campos_personalizados FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "campos_personalizados_insert" ON public.campos_personalizados FOR INSERT TO authenticated WITH CHECK (has_role('admin'));
CREATE POLICY "campos_personalizados_update" ON public.campos_personalizados FOR UPDATE TO authenticated USING (has_role('admin') OR (has_role('ventas') AND campo_supabase = 'nicho')) WITH CHECK (has_role('admin') OR (has_role('ventas') AND campo_supabase = 'nicho'));
CREATE POLICY "campos_personalizados_delete" ON public.campos_personalizados FOR DELETE TO authenticated USING (has_role('admin'));

-- logs_sistema (solo admin lee, cualquier usuario activo inserta)
CREATE POLICY "logs_sistema_select" ON public.logs_sistema FOR SELECT TO authenticated USING (has_role('admin'));
CREATE POLICY "logs_sistema_insert" ON public.logs_sistema FOR INSERT TO authenticated WITH CHECK (is_active_user());

-- ventas (legacy)
-- Deny-all implícito (sin políticas)
