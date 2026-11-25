-- ============================================================================
-- Fase 1: Catálogos editables de Caja (Centros de Costos, Insumos, Vehículos)
-- y columnas de imputación / medio de pago / tipo de documento en caja_movimientos.
-- Roles: solo 'admin' puede crear/editar/eliminar en estos catálogos.
-- ============================================================================

-- 1. Catálogo editable: Centros de Costos
CREATE TABLE IF NOT EXISTS public.caja_centros_costo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.caja_centros_costo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS caja_centros_costo_select ON public.caja_centros_costo;
DROP POLICY IF EXISTS caja_centros_costo_write_admin ON public.caja_centros_costo;

CREATE POLICY caja_centros_costo_select ON public.caja_centros_costo
  FOR SELECT TO authenticated
  USING (public.is_active_user());

CREATE POLICY caja_centros_costo_write_admin ON public.caja_centros_costo
  FOR ALL TO authenticated
  USING (public.has_role(VARIADIC ARRAY['admin']))
  WITH CHECK (public.has_role(VARIADIC ARRAY['admin']));

INSERT INTO public.caja_centros_costo (codigo, nombre, descripcion, orden) VALUES
  ('TERRENO-2', 'Terreno 2 – Calera de Tango', 'Gastos operativos, combustibles y mantención de Terreno 2', 1),
  ('OBRAS', 'Obras / Proyectos', 'Costos, insumos y traslados asignados directamente a obras de clientes', 2),
  ('FLOTA', 'Flota y Camiones', 'Combustibles, mantenciones y gastos de camiones y traslados', 3),
  ('PLANTA', 'Planta / Producción', 'Operación diaria de planta, materiales y producción', 4),
  ('ADMIN', 'Administración', 'Gastos administrativos y generales de empresa', 5)
ON CONFLICT (codigo) DO NOTHING;

-- 2. Catálogo editable: Insumos / Materias Primas y Combustibles
CREATE TABLE IF NOT EXISTS public.caja_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  grupo TEXT NOT NULL DEFAULT 'materia_prima'
    CHECK (grupo IN ('materia_prima', 'combustible', 'otro')),
  unidad TEXT,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.caja_insumos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS caja_insumos_select ON public.caja_insumos;
DROP POLICY IF EXISTS caja_insumos_write_admin ON public.caja_insumos;

CREATE POLICY caja_insumos_select ON public.caja_insumos
  FOR SELECT TO authenticated
  USING (public.is_active_user());

CREATE POLICY caja_insumos_write_admin ON public.caja_insumos
  FOR ALL TO authenticated
  USING (public.has_role(VARIADIC ARRAY['admin']))
  WITH CHECK (public.has_role(VARIADIC ARRAY['admin']));

INSERT INTO public.caja_insumos (codigo, nombre, grupo, unidad, descripcion, orden) VALUES
  ('MP-GRANO', 'Grano', 'materia_prima', 'm3', 'Consumo de grano para producción', 1),
  ('MP-CEMENTO', 'Cemento', 'materia_prima', 'saco', 'Consumo de cemento para producción', 2),
  ('MP-ARENA', 'Arena', 'materia_prima', 'm3', 'Consumo de arena para producción', 3),
  ('MP-GRAVILLA', 'Gravilla', 'materia_prima', 'm3', 'Consumo de gravilla para producción', 4),
  ('COMB-PETROLEO', 'Petróleo', 'combustible', 'L', 'Petróleo para camiones, maquinaria o terreno', 5),
  ('COMB-PARAFINA', 'Parafina', 'combustible', 'L', 'Parafina para operación y equipos', 6),
  ('COMB-BENCINA', 'Bencina', 'combustible', 'L', 'Bencina para vehículos, traslados y obras', 7)
ON CONFLICT (codigo) DO NOTHING;

-- 3. Catálogo editable: Camiones / Vehículos
CREATE TABLE IF NOT EXISTS public.caja_vehiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  patente TEXT,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_caja_vehiculos_nombre_unique
  ON public.caja_vehiculos (lower(trim(nombre)));

ALTER TABLE public.caja_vehiculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS caja_vehiculos_select ON public.caja_vehiculos;
DROP POLICY IF EXISTS caja_vehiculos_write_admin ON public.caja_vehiculos;

CREATE POLICY caja_vehiculos_select ON public.caja_vehiculos
  FOR SELECT TO authenticated
  USING (public.is_active_user());

CREATE POLICY caja_vehiculos_write_admin ON public.caja_vehiculos
  FOR ALL TO authenticated
  USING (public.has_role(VARIADIC ARRAY['admin']))
  WITH CHECK (public.has_role(VARIADIC ARRAY['admin']));

-- 4. Ampliación de public.caja_movimientos con imputación y respaldo
ALTER TABLE public.caja_movimientos
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trabajador_id UUID REFERENCES public.trabajadores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS centro_costo_id UUID REFERENCES public.caja_centros_costo(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS insumo_id UUID REFERENCES public.caja_insumos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehiculo_id UUID REFERENCES public.caja_vehiculos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS medio_pago TEXT,
  ADD COLUMN IF NOT EXISTS tipo_documento TEXT;

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_cliente_id ON public.caja_movimientos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_trabajador_id ON public.caja_movimientos(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_centro_costo_id ON public.caja_movimientos(centro_costo_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_insumo_id ON public.caja_movimientos(insumo_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_vehiculo_id ON public.caja_movimientos(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_medio_pago ON public.caja_movimientos(medio_pago);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_tipo_documento ON public.caja_movimientos(tipo_documento);

-- 5. Protección de integridad: impedir borrado directo desde API de movimientos
--    generados por un abono validado (sin interferir con el RPC rechazar_abono).
CREATE OR REPLACE FUNCTION public.proteger_borrado_movimiento_abono()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF current_user = 'authenticated' AND EXISTS (
    SELECT 1
    FROM public.abonos a
    WHERE a.caja_movimiento_id = OLD.id
      AND a.estado = 'validado'
  ) THEN
    RAISE EXCEPTION 'Este movimiento proviene de un abono validado y no puede eliminarse directamente. Rechaza o ajusta el pago desde Validación de pagos.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_borrado_movimiento_abono ON public.caja_movimientos;
CREATE TRIGGER trg_proteger_borrado_movimiento_abono
  BEFORE DELETE ON public.caja_movimientos
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_borrado_movimiento_abono();
