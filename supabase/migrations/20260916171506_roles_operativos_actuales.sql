-- Sustituye roles heredados que ya no existen por admin/user/mano_obra.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['cotizaciones','cotizacion_items','ordenes_reventa','pedidos_proveedor','proveedores'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name||'_insert', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name||'_update', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_role(''user''))', table_name||'_insert', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_role(''user'')) WITH CHECK (public.has_role(''user''))', table_name||'_update', table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['proyectos_planificacion','visitas_terreno'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name||'_insert', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name||'_update', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_role(''user'', ''mano_obra''))', table_name||'_insert', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_role(''user'', ''mano_obra'')) WITH CHECK (public.has_role(''user'', ''mano_obra''))', table_name||'_update', table_name);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS cotizaciones_delete ON public.cotizaciones;
DROP POLICY IF EXISTS cotizacion_items_delete ON public.cotizacion_items;
DROP POLICY IF EXISTS visitas_terreno_delete ON public.visitas_terreno;
CREATE POLICY cotizaciones_delete ON public.cotizaciones FOR DELETE TO authenticated USING (public.has_role('user'));
CREATE POLICY cotizacion_items_delete ON public.cotizacion_items FOR DELETE TO authenticated USING (public.has_role('user'));
CREATE POLICY visitas_terreno_delete ON public.visitas_terreno FOR DELETE TO authenticated USING (public.has_role('user'));

DROP POLICY IF EXISTS responsables_calendarios_write ON public.responsables_calendarios;
DROP POLICY IF EXISTS responsables_calendarios_delete ON public.responsables_calendarios;
CREATE POLICY responsables_calendarios_insert ON public.responsables_calendarios FOR INSERT TO authenticated
  WITH CHECK (public.has_role('user', 'mano_obra'));
CREATE POLICY responsables_calendarios_update ON public.responsables_calendarios FOR UPDATE TO authenticated
  USING (public.has_role('user', 'mano_obra')) WITH CHECK (public.has_role('user', 'mano_obra'));
CREATE POLICY responsables_calendarios_delete ON public.responsables_calendarios FOR DELETE TO authenticated
  USING (public.has_role('admin'));

DROP POLICY IF EXISTS campos_personalizados_update ON public.campos_personalizados;
CREATE POLICY campos_personalizados_update ON public.campos_personalizados FOR UPDATE TO authenticated
  USING (public.has_role('admin') OR (public.has_role('user') AND campo_supabase = 'nicho'))
  WITH CHECK (public.has_role('admin') OR (public.has_role('user') AND campo_supabase = 'nicho'));
