-- ==============================================================================
-- Migración: Módulo de Asistencia y Perfil Consolidado del Trabajador (RRHH)
-- Fecha: Octubre 2026
-- Objetivo: Crear tabla de asistencia, sembrar histórico 2026 de liquidaciones,
--           permisos y asistencias, e indexar para búsquedas por trabajador_id.
-- ==============================================================================

-- 1. Tabla de Asistencia
CREATE TABLE IF NOT EXISTS public.trabajador_asistencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajador_id uuid NOT NULL REFERENCES public.trabajadores(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  hora_entrada time,
  hora_salida time,
  estado text NOT NULL DEFAULT 'presente' CHECK (estado IN ('presente', 'atraso', 'salida_temprana', 'ausente_justificado', 'ausente_injustificado', 'en_terreno')),
  minutos_atraso integer DEFAULT 0,
  origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'geovictoria', 'zkteco', 'app_movil')),
  observaciones text,
  creado_por uuid REFERENCES public.usuarios(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trabajador_asistencia_trab_fecha 
  ON public.trabajador_asistencia(trabajador_id, fecha DESC);

ALTER TABLE public.trabajador_asistencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trabajador_asistencia_all" ON public.trabajador_asistencia;
CREATE POLICY "trabajador_asistencia_all" ON public.trabajador_asistencia
  FOR ALL TO authenticated
  USING (public.is_active_user())
  WITH CHECK (public.is_active_user());

-- 2. Sembrar liquidaciones 2026 de demostración para los trabajadores existentes
INSERT INTO public.trabajador_liquidaciones_sueldos (
  trabajador_id, mes, anio, monto_sueldo_base, bonos, descuentos, monto_liquido, estado_pago, fecha_pago
)
SELECT 
  t.id, 7, 2026, 
  COALESCE(t.sueldo_base, 750000), 
  50000, 
  35000, 
  COALESCE(t.sueldo_base, 750000) + 15000, 
  'pagado', 
  '2026-07-31'::date
FROM public.trabajadores t
WHERE NOT EXISTS (
  SELECT 1 FROM public.trabajador_liquidaciones_sueldos l WHERE l.trabajador_id = t.id AND l.mes = 7 AND l.anio = 2026
);

INSERT INTO public.trabajador_liquidaciones_sueldos (
  trabajador_id, mes, anio, monto_sueldo_base, bonos, descuentos, monto_liquido, estado_pago, fecha_pago
)
SELECT 
  t.id, 8, 2026, 
  COALESCE(t.sueldo_base, 750000), 
  60000, 
  35000, 
  COALESCE(t.sueldo_base, 750000) + 25000, 
  'pagado', 
  '2026-08-31'::date
FROM public.trabajadores t
WHERE NOT EXISTS (
  SELECT 1 FROM public.trabajador_liquidaciones_sueldos l WHERE l.trabajador_id = t.id AND l.mes = 8 AND l.anio = 2026
);

INSERT INTO public.trabajador_liquidaciones_sueldos (
  trabajador_id, mes, anio, monto_sueldo_base, bonos, descuentos, monto_liquido, estado_pago, fecha_pago
)
SELECT 
  t.id, 9, 2026, 
  COALESCE(t.sueldo_base, 750000), 
  70000, 
  35000, 
  COALESCE(t.sueldo_base, 750000) + 35000, 
  'pagado', 
  '2026-09-30'::date
FROM public.trabajadores t
WHERE NOT EXISTS (
  SELECT 1 FROM public.trabajador_liquidaciones_sueldos l WHERE l.trabajador_id = t.id AND l.mes = 9 AND l.anio = 2026
);

-- 3. Sembrar permisos de demostración 2026
INSERT INTO public.trabajador_permisos_ausencias (
  trabajador_id, tipo, fecha_inicio, fecha_fin, motivo, estado, bloquea_calendario
)
SELECT 
  t.id, 'vacaciones', '2026-02-10'::date, '2026-02-20'::date, 'Vacaciones legales período estival', 'aprobado', true
FROM public.trabajadores t
WHERE t.nombre ILIKE '%Marcos%'
  AND NOT EXISTS (
    SELECT 1 FROM public.trabajador_permisos_ausencias p WHERE p.trabajador_id = t.id AND p.fecha_inicio = '2026-02-10'::date
  );

INSERT INTO public.trabajador_permisos_ausencias (
  trabajador_id, tipo, fecha_inicio, fecha_fin, motivo, estado, bloquea_calendario
)
SELECT 
  t.id, 'permiso', '2026-06-15'::date, '2026-06-15'::date, 'Trámite notarial personal', 'aprobado', false
FROM public.trabajadores t
WHERE t.nombre ILIKE '%Jesus%'
  AND NOT EXISTS (
    SELECT 1 FROM public.trabajador_permisos_ausencias p WHERE p.trabajador_id = t.id AND p.fecha_inicio = '2026-06-15'::date
  );

-- 4. Sembrar registros de asistencia de demostración
INSERT INTO public.trabajador_asistencia (
  trabajador_id, fecha, hora_entrada, hora_salida, estado, minutos_atraso, origen, observaciones
)
SELECT 
  t.id, CURRENT_DATE - INTERVAL '1 day', '08:00:00'::time, '17:30:00'::time, 'presente', 0, 'manual', 'Jornada normal de trabajo'
FROM public.trabajadores t
WHERE NOT EXISTS (
  SELECT 1 FROM public.trabajador_asistencia a WHERE a.trabajador_id = t.id AND a.fecha = CURRENT_DATE - INTERVAL '1 day'
);

INSERT INTO public.trabajador_asistencia (
  trabajador_id, fecha, hora_entrada, hora_salida, estado, minutos_atraso, origen, observaciones
)
SELECT 
  t.id, CURRENT_DATE, '08:12:00'::time, NULL, 'atraso', 12, 'manual', 'Ingreso planta con atraso menor'
FROM public.trabajadores t
WHERE t.nombre ILIKE '%Marcos%'
  AND NOT EXISTS (
    SELECT 1 FROM public.trabajador_asistencia a WHERE a.trabajador_id = t.id AND a.fecha = CURRENT_DATE
  );
