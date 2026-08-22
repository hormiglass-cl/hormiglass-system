-- 0014: Align OC policies with current app roles (admin/user)

DROP POLICY IF EXISTS "ordenes_compra_insert" ON public.ordenes_compra;
DROP POLICY IF EXISTS "ordenes_compra_update" ON public.ordenes_compra;
DROP POLICY IF EXISTS "orden_compra_items_insert" ON public.orden_compra_items;
DROP POLICY IF EXISTS "orden_compra_items_update" ON public.orden_compra_items;
DROP POLICY IF EXISTS "orden_compra_items_delete" ON public.orden_compra_items;

CREATE POLICY "ordenes_compra_insert" ON public.ordenes_compra
  FOR INSERT TO authenticated
  WITH CHECK (has_role('user'));

CREATE POLICY "ordenes_compra_update" ON public.ordenes_compra
  FOR UPDATE TO authenticated
  USING (has_role('user'))
  WITH CHECK (has_role('user'));

CREATE POLICY "orden_compra_items_insert" ON public.orden_compra_items
  FOR INSERT TO authenticated
  WITH CHECK (has_role('user'));

CREATE POLICY "orden_compra_items_update" ON public.orden_compra_items
  FOR UPDATE TO authenticated
  USING (has_role('user'))
  WITH CHECK (has_role('user'));

CREATE POLICY "orden_compra_items_delete" ON public.orden_compra_items
  FOR DELETE TO authenticated
  USING (has_role('user'));
