-- ==============================================================================
-- Migración 0033: Módulo de Recursos Humanos (RR.HH.)
-- Tablas: trabajadores, trabajador_documentos, trabajador_permisos_ausencias, 
--         trabajador_liquidaciones_sueldos, trabajador_notas
-- ==============================================================================

-- 1. Tabla Principal de Trabajadores / Colaboradores
CREATE TABLE IF NOT EXISTS public.trabajadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  rut TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  comuna TEXT,
  region TEXT,
  cargo TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT 'Operaciones & Terreno',
  tipo_contrato TEXT NOT NULL DEFAULT 'Indefinido',
  fecha_ingreso DATE DEFAULT CURRENT_DATE,
  sueldo_base NUMERIC DEFAULT 0,
  estado_disponibilidad TEXT NOT NULL DEFAULT 'disponible', -- 'disponible', 'en_terreno', 'permiso', 'licencia', 'vacaciones', 'falta'
  activo BOOLEAN NOT NULL DEFAULT true,
  contacto_emergencia_nombre TEXT,
  contacto_emergencia_telefono TEXT,
  banco TEXT,
  tipo_cuenta TEXT,
  numero_cuenta TEXT,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_trabajadores_rut ON public.trabajadores(rut);
CREATE INDEX IF NOT EXISTS idx_trabajadores_cargo ON public.trabajadores(cargo);
CREATE INDEX IF NOT EXISTS idx_trabajadores_disponibilidad ON public.trabajadores(estado_disponibilidad);
CREATE INDEX IF NOT EXISTS idx_trabajadores_activo ON public.trabajadores(activo);

-- 2. Carpetas y Documentos del Trabajador (Contratos, Anexos, etc.)
CREATE TABLE IF NOT EXISTS public.trabajador_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajador_id UUID NOT NULL REFERENCES public.trabajadores(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL, -- 'contratos', 'anexos', 'liquidaciones', 'comprobantes', 'licencias', 'certificados', 'otros'
  nombre_archivo TEXT NOT NULL,
  url TEXT NOT NULL,
  storage_path TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  fecha_emision DATE DEFAULT CURRENT_DATE,
  subido_por TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trabajador_documentos_trabajador ON public.trabajador_documentos(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_trabajador_documentos_categoria ON public.trabajador_documentos(categoria);

-- 3. Permisos, Ausencias, Licencias y Vacaciones (Bloqueo de Disponibilidad)
CREATE TABLE IF NOT EXISTS public.trabajador_permisos_ausencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajador_id UUID NOT NULL REFERENCES public.trabajadores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'permiso', 'vacaciones', 'licencia_medica', 'falta_injustificada', 'dia_administrativo'
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  hora_inicio TIME,
  hora_fin TIME,
  jornada_completa BOOLEAN NOT NULL DEFAULT true,
  motivo TEXT,
  estado TEXT NOT NULL DEFAULT 'aprobado', -- 'aprobado', 'pendiente', 'rechazado'
  bloquea_calendario BOOLEAN NOT NULL DEFAULT true,
  comprobante_url TEXT,
  aprobado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trabajador_permisos_trabajador ON public.trabajador_permisos_ausencias(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_trabajador_permisos_fechas ON public.trabajador_permisos_ausencias(fecha_inicio, fecha_fin);

-- 4. Liquidaciones y Comprobantes de Sueldo
CREATE TABLE IF NOT EXISTS public.trabajador_liquidaciones_sueldos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajador_id UUID NOT NULL REFERENCES public.trabajadores(id) ON DELETE CASCADE,
  mes INT NOT NULL,
  anio INT NOT NULL,
  monto_sueldo_base NUMERIC NOT NULL DEFAULT 0,
  bonos NUMERIC NOT NULL DEFAULT 0,
  descuentos NUMERIC NOT NULL DEFAULT 0,
  monto_liquido NUMERIC NOT NULL DEFAULT 0,
  estado_pago TEXT NOT NULL DEFAULT 'pagado', -- 'pendiente', 'pagado'
  fecha_pago DATE DEFAULT CURRENT_DATE,
  comprobante_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trabajador_liquidaciones_trabajador ON public.trabajador_liquidaciones_sueldos(trabajador_id);

-- 5. Bitácora de Notas y Seguimiento
CREATE TABLE IF NOT EXISTS public.trabajador_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajador_id UUID NOT NULL REFERENCES public.trabajadores(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL DEFAULT 'nota', -- 'nota', 'felicitacion', 'amonestacion', 'evaluacion', 'seguimiento'
  contenido TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trabajador_notas_trabajador ON public.trabajador_notas(trabajador_id);

-- ==============================================================================
-- RLS POLICIES
-- ==============================================================================

ALTER TABLE public.trabajadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trabajador_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trabajador_permisos_ausencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trabajador_liquidaciones_sueldos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trabajador_notas ENABLE ROW LEVEL SECURITY;

-- trabajadores
DROP POLICY IF EXISTS "trabajadores_select" ON public.trabajadores;
CREATE POLICY "trabajadores_select" ON public.trabajadores FOR SELECT USING (true);

DROP POLICY IF EXISTS "trabajadores_insert" ON public.trabajadores;
CREATE POLICY "trabajadores_insert" ON public.trabajadores FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "trabajadores_update" ON public.trabajadores;
CREATE POLICY "trabajadores_update" ON public.trabajadores FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "trabajadores_delete" ON public.trabajadores;
CREATE POLICY "trabajadores_delete" ON public.trabajadores FOR DELETE USING (true);

-- trabajador_documentos
DROP POLICY IF EXISTS "trabajador_documentos_select" ON public.trabajador_documentos;
CREATE POLICY "trabajador_documentos_select" ON public.trabajador_documentos FOR SELECT USING (true);

DROP POLICY IF EXISTS "trabajador_documentos_insert" ON public.trabajador_documentos;
CREATE POLICY "trabajador_documentos_insert" ON public.trabajador_documentos FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "trabajador_documentos_update" ON public.trabajador_documentos;
CREATE POLICY "trabajador_documentos_update" ON public.trabajador_documentos FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "trabajador_documentos_delete" ON public.trabajador_documentos;
CREATE POLICY "trabajador_documentos_delete" ON public.trabajador_documentos FOR DELETE USING (true);

-- trabajador_permisos_ausencias
DROP POLICY IF EXISTS "trabajador_permisos_select" ON public.trabajador_permisos_ausencias;
CREATE POLICY "trabajador_permisos_select" ON public.trabajador_permisos_ausencias FOR SELECT USING (true);

DROP POLICY IF EXISTS "trabajador_permisos_insert" ON public.trabajador_permisos_ausencias;
CREATE POLICY "trabajador_permisos_insert" ON public.trabajador_permisos_ausencias FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "trabajador_permisos_update" ON public.trabajador_permisos_ausencias;
CREATE POLICY "trabajador_permisos_update" ON public.trabajador_permisos_ausencias FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "trabajador_permisos_delete" ON public.trabajador_permisos_ausencias;
CREATE POLICY "trabajador_permisos_delete" ON public.trabajador_permisos_ausencias FOR DELETE USING (true);

-- trabajador_liquidaciones_sueldos
DROP POLICY IF EXISTS "trabajador_liquidaciones_select" ON public.trabajador_liquidaciones_sueldos;
CREATE POLICY "trabajador_liquidaciones_select" ON public.trabajador_liquidaciones_sueldos FOR SELECT USING (true);

DROP POLICY IF EXISTS "trabajador_liquidaciones_insert" ON public.trabajador_liquidaciones_sueldos;
CREATE POLICY "trabajador_liquidaciones_insert" ON public.trabajador_liquidaciones_sueldos FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "trabajador_liquidaciones_update" ON public.trabajador_liquidaciones_sueldos;
CREATE POLICY "trabajador_liquidaciones_update" ON public.trabajador_liquidaciones_sueldos FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "trabajador_liquidaciones_delete" ON public.trabajador_liquidaciones_sueldos;
CREATE POLICY "trabajador_liquidaciones_delete" ON public.trabajador_liquidaciones_sueldos FOR DELETE USING (true);

-- trabajador_notas
DROP POLICY IF EXISTS "trabajador_notas_select" ON public.trabajador_notas;
CREATE POLICY "trabajador_notas_select" ON public.trabajador_notas FOR SELECT USING (true);

DROP POLICY IF EXISTS "trabajador_notas_insert" ON public.trabajador_notas;
CREATE POLICY "trabajador_notas_insert" ON public.trabajador_notas FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "trabajador_notas_update" ON public.trabajador_notas;
CREATE POLICY "trabajador_notas_update" ON public.trabajador_notas FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "trabajador_notas_delete" ON public.trabajador_notas;
CREATE POLICY "trabajador_notas_delete" ON public.trabajador_notas FOR DELETE USING (true);
