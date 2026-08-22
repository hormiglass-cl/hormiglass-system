-- 0010: Personal de terreno / cuadrillas + asignaciones (ajustes 11.6 y 11.8)

CREATE TABLE IF NOT EXISTS public.personal_terreno (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'tecnico'
    CHECK (tipo IN ('tecnico', 'cuadrilla', 'encargado_fabricacion')),
  telefono TEXT,
  email TEXT,
  especialidad TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  usuario_id UUID REFERENCES public.usuarios(id),
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_personal_terreno_updated_at ON public.personal_terreno;
CREATE TRIGGER trg_personal_terreno_updated_at
BEFORE UPDATE ON public.personal_terreno
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_personal_terreno_tipo   ON public.personal_terreno (tipo);
CREATE INDEX IF NOT EXISTS idx_personal_terreno_activo ON public.personal_terreno (activo);

-- Semilla: los 3 técnicos históricos
INSERT INTO public.personal_terreno (nombre, tipo)
SELECT v.nombre, 'tecnico'
  FROM (VALUES ('Felipe Valverde'), ('Marcos Catalán'), ('Edith Tapia')) AS v(nombre)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.personal_terreno p WHERE p.nombre = v.nombre
 );

-- Asignaciones en obra/producción
ALTER TABLE public.proyectos_planificacion
  ADD COLUMN IF NOT EXISTS cuadrilla_id UUID REFERENCES public.personal_terreno(id),
  ADD COLUMN IF NOT EXISTS encargado_fabricacion_id UUID REFERENCES public.personal_terreno(id);

CREATE INDEX IF NOT EXISTS idx_proyectos_plan_cuadrilla  ON public.proyectos_planificacion (cuadrilla_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_plan_encargado  ON public.proyectos_planificacion (encargado_fabricacion_id);

-- Visitas: FK nueva manteniendo compatibilidad con tecnico_visita
ALTER TABLE public.visitas_terreno
  ADD COLUMN IF NOT EXISTS tecnico_id UUID REFERENCES public.personal_terreno(id);

CREATE INDEX IF NOT EXISTS idx_visitas_terreno_tecnico_id ON public.visitas_terreno (tecnico_id);

-- Backfill de la FK desde el texto existente
UPDATE public.visitas_terreno v
   SET tecnico_id = p.id
  FROM public.personal_terreno p
 WHERE v.tecnico_id IS NULL AND v.tecnico_visita = p.nombre;

-- RLS + grants
ALTER TABLE public.personal_terreno ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "personal_terreno_select" ON public.personal_terreno;
DROP POLICY IF EXISTS "personal_terreno_write"  ON public.personal_terreno;
DROP POLICY IF EXISTS "personal_terreno_delete" ON public.personal_terreno;

CREATE POLICY "personal_terreno_select" ON public.personal_terreno
  FOR SELECT TO authenticated USING (is_active_user());

CREATE POLICY "personal_terreno_write" ON public.personal_terreno
  FOR ALL TO authenticated
  USING (has_role('admin', 'administracion', 'programacion'))
  WITH CHECK (has_role('admin', 'administracion', 'programacion'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_terreno TO authenticated;
