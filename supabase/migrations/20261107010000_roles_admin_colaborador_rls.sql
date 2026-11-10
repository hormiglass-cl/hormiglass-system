-- ============================================================================
-- Dos roles operativos: Administrador (admin) y Colaborador (user).
-- Recursos humanos, caja, bancos y empresas y usuarios quedan solo para admin.
-- has_role() ya devuelve true para admin, por lo que basta con pedir 'admin'.
-- ============================================================================

-- 1. Recursos humanos: las tablas del colaborador estaban abiertas (incluso a anon).
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'trabajador_documentos',
    'trabajador_liquidaciones_sueldos',
    'trabajador_notas',
    'trabajador_permisos_ausencias',
    'trabajador_asistencia'
  ] LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_role(VARIADIC ARRAY[''admin''])) WITH CHECK (public.has_role(VARIADIC ARRAY[''admin'']))',
      t || '_solo_admin', t
    );
  END LOOP;
END $$;

-- 2. Trabajadores: todos los usuarios activos pueden consultar (asignaciones de obra y postventa),
--    pero solo el admin crea, edita o elimina.
DROP POLICY IF EXISTS trabajadores_select ON public.trabajadores;
DROP POLICY IF EXISTS trabajadores_insert ON public.trabajadores;
DROP POLICY IF EXISTS trabajadores_update ON public.trabajadores;
DROP POLICY IF EXISTS trabajadores_delete ON public.trabajadores;

CREATE POLICY trabajadores_select ON public.trabajadores
  FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY trabajadores_insert_admin ON public.trabajadores
  FOR INSERT TO authenticated WITH CHECK (public.has_role(VARIADIC ARRAY['admin']));
CREATE POLICY trabajadores_update_admin ON public.trabajadores
  FOR UPDATE TO authenticated
  USING (public.has_role(VARIADIC ARRAY['admin']))
  WITH CHECK (public.has_role(VARIADIC ARRAY['admin']));
CREATE POLICY trabajadores_delete_admin ON public.trabajadores
  FOR DELETE TO authenticated USING (public.has_role(VARIADIC ARRAY['admin']));

-- 3. Caja: movimientos, categorías y validación de abonos solo para admin.
DROP POLICY IF EXISTS caja_movimientos_select ON public.caja_movimientos;
DROP POLICY IF EXISTS caja_movimientos_insert ON public.caja_movimientos;
DROP POLICY IF EXISTS caja_movimientos_update ON public.caja_movimientos;
DROP POLICY IF EXISTS caja_movimientos_delete ON public.caja_movimientos;
CREATE POLICY caja_movimientos_solo_admin ON public.caja_movimientos
  FOR ALL TO authenticated
  USING (public.has_role(VARIADIC ARRAY['admin']))
  WITH CHECK (public.has_role(VARIADIC ARRAY['admin']));

DROP POLICY IF EXISTS caja_categorias_write_admin_finanzas ON public.caja_categorias;
CREATE POLICY caja_categorias_write_admin ON public.caja_categorias
  FOR ALL TO authenticated
  USING (public.has_role(VARIADIC ARRAY['admin']))
  WITH CHECK (public.has_role(VARIADIC ARRAY['admin']));

DROP POLICY IF EXISTS caja_subcategorias_write_admin_finanzas ON public.caja_subcategorias;
CREATE POLICY caja_subcategorias_write_admin ON public.caja_subcategorias
  FOR ALL TO authenticated
  USING (public.has_role(VARIADIC ARRAY['admin']))
  WITH CHECK (public.has_role(VARIADIC ARRAY['admin']));

-- Los colaboradores registran abonos desde ventas; validarlos o borrarlos es del admin.
DROP POLICY IF EXISTS abonos_update ON public.abonos;
DROP POLICY IF EXISTS abonos_delete ON public.abonos;
CREATE POLICY abonos_update ON public.abonos
  FOR UPDATE TO authenticated
  USING (public.has_role(VARIADIC ARRAY['admin']))
  WITH CHECK (public.has_role(VARIADIC ARRAY['admin']));
CREATE POLICY abonos_delete ON public.abonos
  FOR DELETE TO authenticated USING (public.has_role(VARIADIC ARRAY['admin']));

-- 4. Bancos y empresas: edición solo admin (la lectura queda para elegir cuenta en órdenes de compra).
DROP POLICY IF EXISTS cuentas_bancarias_write ON public.cuentas_bancarias;
CREATE POLICY cuentas_bancarias_write_admin ON public.cuentas_bancarias
  FOR ALL TO authenticated
  USING (public.has_role(VARIADIC ARRAY['admin']))
  WITH CHECK (public.has_role(VARIADIC ARRAY['admin']));

DROP POLICY IF EXISTS empresas_write ON public.empresas;
CREATE POLICY empresas_write_admin ON public.empresas
  FOR ALL TO authenticated
  USING (public.has_role(VARIADIC ARRAY['admin']))
  WITH CHECK (public.has_role(VARIADIC ARRAY['admin']));

-- 5. Usuarios: un colaborador puede editar su perfil, pero no su rol, estado, correo,
--    vínculo de acceso ni sus calendarios (eso se configura en Configuración, solo admin).
CREATE OR REPLACE FUNCTION public.proteger_campos_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(VARIADIC ARRAY['admin']) THEN
    NEW.rol := OLD.rol;
    NEW.activo := OLD.activo;
    NEW.auth_id := OLD.auth_id;
    NEW.email := OLD.email;
    NEW.calendario_visitas := OLD.calendario_visitas;
    NEW.calendario_produccion := OLD.calendario_produccion;
    NEW.calendario_reventa := OLD.calendario_reventa;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_campos_usuario ON public.usuarios;
CREATE TRIGGER trg_proteger_campos_usuario
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.proteger_campos_usuario();
