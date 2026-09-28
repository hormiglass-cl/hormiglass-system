-- Report layouts are private to their owner. Monetary totals still come only from caja_movimientos.
CREATE TABLE public.reportes_vistas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 1 AND 80),
  configuracion jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuracion) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reportes_vistas_usuario_id_idx ON public.reportes_vistas (usuario_id, updated_at DESC);
CREATE UNIQUE INDEX reportes_vistas_nombre_usuario_idx ON public.reportes_vistas (usuario_id, lower(nombre));
CREATE TRIGGER reportes_vistas_updated_at BEFORE UPDATE ON public.reportes_vistas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.reportes_vistas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reportes_vistas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reportes_vistas TO authenticated;

CREATE POLICY reportes_vistas_select ON public.reportes_vistas FOR SELECT TO authenticated
  USING (usuario_id = (SELECT public.current_usuario_id()) AND (SELECT public.has_role('user')));
CREATE POLICY reportes_vistas_insert ON public.reportes_vistas FOR INSERT TO authenticated
  WITH CHECK (usuario_id = (SELECT public.current_usuario_id()) AND (SELECT public.has_role('user')));
CREATE POLICY reportes_vistas_update ON public.reportes_vistas FOR UPDATE TO authenticated
  USING (usuario_id = (SELECT public.current_usuario_id()) AND (SELECT public.has_role('user')))
  WITH CHECK (usuario_id = (SELECT public.current_usuario_id()) AND (SELECT public.has_role('user')));
CREATE POLICY reportes_vistas_delete ON public.reportes_vistas FOR DELETE TO authenticated
  USING (usuario_id = (SELECT public.current_usuario_id()) AND (SELECT public.has_role('user')));

-- Caja and financial reporting are for active admin/user profiles.
DROP POLICY IF EXISTS caja_movimientos_select ON public.caja_movimientos;
CREATE POLICY caja_movimientos_select ON public.caja_movimientos FOR SELECT TO authenticated
  USING ((SELECT public.has_role('user')));
DROP POLICY IF EXISTS caja_movimientos_insert ON public.caja_movimientos;
CREATE POLICY caja_movimientos_insert ON public.caja_movimientos FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role('user')) AND usuario_id = (SELECT public.current_usuario_id()));
