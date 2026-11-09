-- Ajustes del sistema (clave/valor JSON): empresa, cotizaciones, orígenes, comisiones, etc.
-- Todos los usuarios activos leen; solo el administrador modifica.
CREATE TABLE IF NOT EXISTS public.ajustes_sistema (
  clave text PRIMARY KEY,
  valor jsonb NOT NULL,
  actualizado_por uuid,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ajustes_sistema ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ajustes_sistema_select ON public.ajustes_sistema;
DROP POLICY IF EXISTS ajustes_sistema_write_admin ON public.ajustes_sistema;
CREATE POLICY ajustes_sistema_select ON public.ajustes_sistema
  FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY ajustes_sistema_write_admin ON public.ajustes_sistema
  FOR ALL TO authenticated
  USING (public.has_role(VARIADIC ARRAY['admin']))
  WITH CHECK (public.has_role(VARIADIC ARRAY['admin']));
