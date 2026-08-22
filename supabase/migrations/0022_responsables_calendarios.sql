CREATE TABLE IF NOT EXISTS public.responsables_calendarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  cargo TEXT,
  telefono TEXT,
  email TEXT,
  calendarios TEXT[] NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT responsables_calendarios_calendarios_check
    CHECK (calendarios <@ ARRAY['obra', 'logistica', 'produccion']::TEXT[])
);

DROP TRIGGER IF EXISTS trg_responsables_calendarios_updated_at ON public.responsables_calendarios;
CREATE TRIGGER trg_responsables_calendarios_updated_at
BEFORE UPDATE ON public.responsables_calendarios
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_responsables_calendarios_activo ON public.responsables_calendarios (activo);
CREATE INDEX IF NOT EXISTS idx_responsables_calendarios_calendarios ON public.responsables_calendarios USING GIN (calendarios);

ALTER TABLE public.responsables_calendarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "responsables_calendarios_select" ON public.responsables_calendarios;
DROP POLICY IF EXISTS "responsables_calendarios_write" ON public.responsables_calendarios;
DROP POLICY IF EXISTS "responsables_calendarios_delete" ON public.responsables_calendarios;

CREATE POLICY "responsables_calendarios_select" ON public.responsables_calendarios
  FOR SELECT TO authenticated USING (is_active_user());

CREATE POLICY "responsables_calendarios_write" ON public.responsables_calendarios
  FOR ALL TO authenticated
  USING (has_role('programacion', 'administracion', 'admin'))
  WITH CHECK (has_role('programacion', 'administracion', 'admin'));

CREATE POLICY "responsables_calendarios_delete" ON public.responsables_calendarios
  FOR DELETE TO authenticated USING (has_role('administracion', 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.responsables_calendarios TO authenticated;
