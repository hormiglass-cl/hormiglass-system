-- Un usuario activo puede eliminar oportunidades con la confirmación de la UI.
-- has_role('user') también autoriza a administradores y rechaza cuentas inactivas.
DROP POLICY IF EXISTS oportunidades_delete ON public.oportunidades;
CREATE POLICY oportunidades_delete ON public.oportunidades
  FOR DELETE TO authenticated
  USING ((SELECT public.has_role('user')));
