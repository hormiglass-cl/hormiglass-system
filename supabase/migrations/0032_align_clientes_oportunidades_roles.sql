-- 0032: Align clientes and oportunidades policies with current app roles (admin/user)

DROP POLICY IF EXISTS "clientes_insert" ON public.clientes;
DROP POLICY IF EXISTS "clientes_update" ON public.clientes;

CREATE POLICY "clientes_insert" ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (has_role('user'));

CREATE POLICY "clientes_update" ON public.clientes
  FOR UPDATE TO authenticated
  USING (has_role('user'))
  WITH CHECK (has_role('user'));

DROP POLICY IF EXISTS "oportunidades_insert" ON public.oportunidades;
DROP POLICY IF EXISTS "oportunidades_update" ON public.oportunidades;

CREATE POLICY "oportunidades_insert" ON public.oportunidades
  FOR INSERT TO authenticated
  WITH CHECK (has_role('user'));

CREATE POLICY "oportunidades_update" ON public.oportunidades
  FOR UPDATE TO authenticated
  USING (has_role('user'))
  WITH CHECK (has_role('user'));
