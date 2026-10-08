-- Migración: Módulo Integral de Postventa, Garantías y Costeo por NV
-- Fecha: 2026-10-07

-- 1. Ampliar checks de postventa_casos
ALTER TABLE public.postventa_casos DROP CONSTRAINT IF EXISTS postventa_casos_estado_check;
ALTER TABLE public.postventa_casos DROP CONSTRAINT IF EXISTS postventa_casos_tipo_check;

ALTER TABLE public.postventa_casos ADD CONSTRAINT postventa_casos_estado_check
  CHECK (estado = ANY (ARRAY[
    'recibido'::text,
    'en_revision'::text,
    'visita_programada'::text,
    'reparacion_programada'::text,
    'cerrado'::text,
    'abierto'::text,
    'programado'::text,
    'en_curso'::text,
    'resuelto'::text,
    'cancelado'::text
  ]));

ALTER TABLE public.postventa_casos ADD CONSTRAINT postventa_casos_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'producto_defectuoso'::text,
    'problema_fabricacion'::text,
    'problema_instalacion'::text,
    'dano_transporte'::text,
    'uso_incorrecto'::text,
    'movimiento_terreno'::text,
    'trabajo_adicional'::text,
    'dano_terceros'::text,
    'faltante'::text,
    'defecto'::text,
    'cantidad_adicional'::text,
    'otro'::text
  ]));

-- 2. Nuevas columnas en postventa_casos
ALTER TABLE public.postventa_casos
  ADD COLUMN IF NOT EXISTS folio text UNIQUE,
  ADD COLUMN IF NOT EXISTS vendedor_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cuadrilla_id uuid REFERENCES public.trabajadores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS obra text,
  ADD COLUMN IF NOT EXISTS producto_id uuid REFERENCES public.catalogo_productos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS producto_texto text,
  ADD COLUMN IF NOT EXISTS tipo_problema text,
  ADD COLUMN IF NOT EXISTS causa_raiz text CHECK (causa_raiz IS NULL OR causa_raiz IN ('Fabricacion', 'Instalacion', 'Despacho', 'Terreno', 'Cliente', 'Proveedor', 'Transportista', 'Sin determinar')),
  ADD COLUMN IF NOT EXISTS resolucion text CHECK (resolucion IS NULL OR resolucion IN ('garantia', 'responsabilidad_parcial', 'no_garantia', 'transportista', 'en_evaluacion')),
  ADD COLUMN IF NOT EXISTS antecedentes_venta jsonb DEFAULT '{"cotizado_verificado": false, "contratado_verificado": false, "entregado_verificado": false, "condiciones_terreno": "", "observaciones_instalacion": "", "guia_recepcion_verificada": false, "pagos_al_dia": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS cobertura_garantia_doc text,
  ADD COLUMN IF NOT EXISTS costo_total numeric(12,2) DEFAULT 0 CHECK (costo_total >= 0),
  ADD COLUMN IF NOT EXISTS conformidad_cliente boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS conformidad_observaciones text,
  ADD COLUMN IF NOT EXISTS fecha_cierre timestamptz,
  ADD COLUMN IF NOT EXISTS cerrado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fecha_reclamo date DEFAULT CURRENT_DATE;

-- Índices en postventa_casos
CREATE INDEX IF NOT EXISTS idx_postventa_casos_folio ON public.postventa_casos(folio);
CREATE INDEX IF NOT EXISTS idx_postventa_casos_vendedor ON public.postventa_casos(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_postventa_casos_cuadrilla ON public.postventa_casos(cuadrilla_id);
CREATE INDEX IF NOT EXISTS idx_postventa_casos_causa_raiz ON public.postventa_casos(causa_raiz);
CREATE INDEX IF NOT EXISTS idx_postventa_casos_resolucion ON public.postventa_casos(resolucion);

-- 3. Generador de folios automáticos (PV-YYYY-XXXX)
CREATE OR REPLACE FUNCTION public.generar_folio_postventa()
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_year text := to_char(CURRENT_DATE, 'YYYY');
    v_count int;
    v_folio text;
BEGIN
    SELECT COUNT(*) + 1 INTO v_count
    FROM public.postventa_casos
    WHERE folio LIKE 'PV-' || v_year || '-%';

    v_folio := 'PV-' || v_year || '-' || lpad(v_count::text, 4, '0');
    WHILE EXISTS (SELECT 1 FROM public.postventa_casos WHERE folio = v_folio) LOOP
        v_count := v_count + 1;
        v_folio := 'PV-' || v_year || '-' || lpad(v_count::text, 4, '0');
    END LOOP;

    RETURN v_folio;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.trg_set_folio_postventa()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    IF NEW.folio IS NULL OR TRIM(NEW.folio) = '' THEN
        NEW.folio := public.generar_folio_postventa();
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_postventa_set_folio ON public.postventa_casos;
CREATE TRIGGER trg_postventa_set_folio
BEFORE INSERT ON public.postventa_casos
FOR EACH ROW
EXECUTE FUNCTION public.trg_set_folio_postventa();

UPDATE public.postventa_casos
SET folio = public.generar_folio_postventa()
WHERE folio IS NULL;

-- 4. Tablas auxiliares: postventa_evidencias y postventa_costos
CREATE TABLE IF NOT EXISTS public.postventa_evidencias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    caso_id uuid NOT NULL REFERENCES public.postventa_casos(id) ON DELETE CASCADE,
    tipo_evidencia text NOT NULL CHECK (tipo_evidencia IN ('antes', 'durante', 'despues', 'conformidad', 'diagnostico', 'otro')),
    archivo_url text NOT NULL,
    nombre_archivo text,
    descripcion text,
    usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.postventa_costos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    caso_id uuid NOT NULL REFERENCES public.postventa_casos(id) ON DELETE CASCADE,
    tipo_costo text NOT NULL CHECK (tipo_costo IN ('materiales', 'flete', 'mano_obra', 'reposicion', 'traslado', 'otro')),
    descripcion text NOT NULL,
    monto numeric(12,2) NOT NULL CHECK (monto >= 0),
    proveedor_o_maestro text,
    fecha date DEFAULT CURRENT_DATE,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_postventa_evidencias_caso ON public.postventa_evidencias(caso_id);
CREATE INDEX IF NOT EXISTS idx_postventa_costos_caso ON public.postventa_costos(caso_id);

-- 5. Trigger sincronizador de costos acumulados en el caso
CREATE OR REPLACE FUNCTION public.sync_costo_total_postventa()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_caso_id uuid;
    v_total numeric(12,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_caso_id := OLD.caso_id;
    ELSE
        v_caso_id := NEW.caso_id;
    END IF;

    SELECT COALESCE(SUM(monto), 0) INTO v_total
    FROM public.postventa_costos
    WHERE caso_id = v_caso_id;

    UPDATE public.postventa_casos
    SET costo_total = v_total
    WHERE id = v_caso_id;

    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_costo_postventa ON public.postventa_costos;
CREATE TRIGGER trg_sync_costo_postventa
AFTER INSERT OR UPDATE OR DELETE ON public.postventa_costos
FOR EACH ROW
EXECUTE FUNCTION public.sync_costo_total_postventa();

-- 6. Trigger de bloqueo para reglas de cierre obligatorio
CREATE OR REPLACE FUNCTION public.validar_cierre_postventa()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    IF NEW.estado IN ('cerrado', 'resuelto') AND (OLD.estado NOT IN ('cerrado', 'resuelto')) THEN
        -- A. Fotografías finales obligatorias
        IF NOT EXISTS (
            SELECT 1 FROM public.postventa_evidencias
            WHERE caso_id = NEW.id AND tipo_evidencia IN ('despues', 'conformidad')
        ) THEN
            RAISE EXCEPTION 'No se puede cerrar el caso %: se requieren fotografías finales de trabajo terminado o conformidad.', NEW.folio;
        END IF;

        -- B. Conformidad del cliente obligatoria
        IF NOT (NEW.conformidad_cliente = true OR EXISTS (
            SELECT 1 FROM public.postventa_evidencias
            WHERE caso_id = NEW.id AND tipo_evidencia = 'conformidad'
        )) THEN
            RAISE EXCEPTION 'No se puede cerrar el caso %: se requiere registrar la confirmación o conformidad del cliente.', NEW.folio;
        END IF;

        -- C. Causa raíz identificada obligatoria
        IF NEW.causa_raiz IS NULL OR NEW.causa_raiz = 'Sin determinar' OR TRIM(NEW.causa_raiz) = '' THEN
            RAISE EXCEPTION 'No se puede cerrar el caso %: se debe clasificar la causa raíz del problema.', NEW.folio;
        END IF;

        -- D. Registro de costos de postventa obligatorio
        IF NOT (NEW.costo_total > 0 OR EXISTS (
            SELECT 1 FROM public.postventa_costos
            WHERE caso_id = NEW.id
        )) THEN
            RAISE EXCEPTION 'No se puede cerrar el caso %: se debe registrar al menos un costo imputado (materiales, maestro, flete, etc.).', NEW.folio;
        END IF;

        NEW.fecha_cierre := COALESCE(NEW.fecha_cierre, now());
    END IF;

    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_validar_cierre_postventa ON public.postventa_casos;
CREATE TRIGGER trg_validar_cierre_postventa
BEFORE UPDATE OF estado ON public.postventa_casos
FOR EACH ROW
EXECUTE FUNCTION public.validar_cierre_postventa();

-- 7. Actualización de vista v_margen_por_nv integrando costos de postventa
CREATE OR REPLACE VIEW public.v_margen_por_nv AS
WITH cotizacion_activa AS (
  SELECT DISTINCT ON (c.oportunidad_id)
    c.oportunidad_id,
    c.id AS cotizacion_id,
    c.numero_cotizacion,
    COALESCE(c.subtotal, 0) AS valor_neto,
    COALESCE(c.monto_total, 0) AS valor_total,
    c.estado AS estado_cotizacion
  FROM public.cotizaciones c
  WHERE c.oportunidad_id IS NOT NULL
  ORDER BY c.oportunidad_id,
    CASE WHEN c.estado = 'aprobada' THEN 1
         WHEN c.estado = 'enviada' THEN 2
         ELSE 3 END,
    c.version DESC NULLS LAST,
    c.created_at DESC
),
ingresos_validados AS (
  SELECT
    oportunidad_id,
    COALESCE(SUM(monto), 0) AS total_ingresos_validados,
    COUNT(id) AS cantidad_abonos_validados
  FROM public.abonos
  WHERE estado = 'validado'
  GROUP BY oportunidad_id
),
costos_compras AS (
  SELECT
    oportunidad_id,
    COALESCE(SUM(costo_asignado), 0) AS costo_compras_asignadas,
    COUNT(id) AS cantidad_asignaciones_oc
  FROM public.orden_compra_asignaciones
  GROUP BY oportunidad_id
),
costos_fletes AS (
  SELECT
    oportunidad_id,
    COALESCE(SUM(CASE WHEN costo_real_confirmado = true THEN COALESCE(costo_real, 0) ELSE COALESCE(costo_estimado, 0) END), 0) AS costo_fletes_despacho,
    COUNT(id) AS cantidad_guias
  FROM public.guias_despacho
  WHERE estado != 'cancelada'
  GROUP BY oportunidad_id
),
costos_caja_directos AS (
  SELECT
    oportunidad_id,
    COALESCE(SUM(monto), 0) AS costo_caja_directo,
    COUNT(id) AS cantidad_movimientos_caja
  FROM public.caja_movimientos
  WHERE tipo = 'egreso'
    AND oportunidad_id IS NOT NULL
    AND orden_compra_id IS NULL
  GROUP BY oportunidad_id
),
costos_postventa AS (
  SELECT
    pc.oportunidad_id,
    COALESCE(SUM(c.monto), 0) AS costo_postventa_total,
    COUNT(c.id) AS cantidad_costos_postventa
  FROM public.postventa_casos pc
  JOIN public.postventa_costos c ON c.caso_id = pc.id
  GROUP BY pc.oportunidad_id
)
SELECT
  o.id AS oportunidad_id,
  o.codigo,
  o.titulo,
  o.cliente_id,
  COALESCE(NULLIF(cl.apellido_razon_social, ''), NULLIF(cl.nombre, ''), 'Sin cliente especificado') AS cliente_nombre,
  cl.rut AS cliente_rut,
  o.asignado_a AS vendedor_id,
  COALESCE(u.nombre, 'Sin asignar') AS vendedor_nombre,
  o.estado_pipeline,
  o.created_at AS fecha_creacion,
  COALESCE(ca.numero_cotizacion, 'Sin cotización') AS numero_cotizacion,
  COALESCE(ca.valor_neto, 0) AS valor_cotizado_neto,
  COALESCE(ca.valor_total, 0) AS valor_cotizado_total,
  COALESCE(iv.total_ingresos_validados, o.monto_abonado, 0) AS total_ingresos_validados,
  COALESCE(cc.costo_compras_asignadas, 0) AS costo_compras_asignadas,
  COALESCE(cf.costo_fletes_despacho, 0) AS costo_fletes_despacho,
  COALESCE(cd.costo_caja_directo, 0) AS costo_caja_directo,
  COALESCE(cp.costo_postventa_total, 0) AS costo_postventa,
  -- Costo Directo Total Acumulado (incluye compras, fletes, egresos de caja y postventa)
  (COALESCE(cc.costo_compras_asignadas, 0) + COALESCE(cf.costo_fletes_despacho, 0) + COALESCE(cd.costo_caja_directo, 0) + COALESCE(cp.costo_postventa_total, 0)) AS costo_directo_total,
  -- Margen Bruto Real
  (COALESCE(iv.total_ingresos_validados, o.monto_abonado, 0) - (COALESCE(cc.costo_compras_asignadas, 0) + COALESCE(cf.costo_fletes_despacho, 0) + COALESCE(cd.costo_caja_directo, 0) + COALESCE(cp.costo_postventa_total, 0))) AS margen_bruto_real,
  -- Margen Bruto Proyectado
  (COALESCE(ca.valor_total, 0) - (COALESCE(cc.costo_compras_asignadas, 0) + COALESCE(cf.costo_fletes_despacho, 0) + COALESCE(cd.costo_caja_directo, 0) + COALESCE(cp.costo_postventa_total, 0))) AS margen_bruto_proyectado,
  -- Porcentajes
  CASE
    WHEN COALESCE(ca.valor_total, 0) > 0 THEN
      ROUND(((COALESCE(ca.valor_total, 0) - (COALESCE(cc.costo_compras_asignadas, 0) + COALESCE(cf.costo_fletes_despacho, 0) + COALESCE(cd.costo_caja_directo, 0) + COALESCE(cp.costo_postventa_total, 0))) / ca.valor_total) * 100, 1)
    ELSE 0
  END AS porcentaje_margen_proyectado,
  CASE
    WHEN COALESCE(iv.total_ingresos_validados, o.monto_abonado, 0) > 0 THEN
      ROUND(((COALESCE(iv.total_ingresos_validados, o.monto_abonado, 0) - (COALESCE(cc.costo_compras_asignadas, 0) + COALESCE(cf.costo_fletes_despacho, 0) + COALESCE(cd.costo_caja_directo, 0) + COALESCE(cp.costo_postventa_total, 0))) / COALESCE(iv.total_ingresos_validados, o.monto_abonado, 0)) * 100, 1)
    ELSE 0
  END AS porcentaje_margen_real
FROM public.oportunidades o
LEFT JOIN cotizacion_activa ca ON ca.oportunidad_id = o.id
LEFT JOIN public.clientes cl ON cl.id = o.cliente_id
LEFT JOIN public.usuarios u ON u.id = o.asignado_a
LEFT JOIN ingresos_validados iv ON iv.oportunidad_id = o.id
LEFT JOIN costos_compras cc ON cc.oportunidad_id = o.id
LEFT JOIN costos_fletes cf ON cf.oportunidad_id = o.id
LEFT JOIN costos_caja_directos cd ON cd.oportunidad_id = o.id
LEFT JOIN costos_postventa cp ON cp.oportunidad_id = o.id;

-- 8. Seguridad y Políticas RLS
ALTER TABLE public.postventa_casos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postventa_evidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postventa_costos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "postventa_casos_select_active" ON public.postventa_casos;
CREATE POLICY "postventa_casos_select_active" ON public.postventa_casos
    FOR SELECT TO authenticated USING (is_active_user());

DROP POLICY IF EXISTS "postventa_casos_write_role" ON public.postventa_casos;
CREATE POLICY "postventa_casos_write_role" ON public.postventa_casos
    FOR ALL TO authenticated USING (has_role('admin', 'user', 'finanzas', 'mano_obra'));

DROP POLICY IF EXISTS "postventa_evidencias_select" ON public.postventa_evidencias;
CREATE POLICY "postventa_evidencias_select" ON public.postventa_evidencias
    FOR SELECT TO authenticated USING (is_active_user());

DROP POLICY IF EXISTS "postventa_evidencias_write" ON public.postventa_evidencias;
CREATE POLICY "postventa_evidencias_write" ON public.postventa_evidencias
    FOR ALL TO authenticated USING (has_role('admin', 'user', 'finanzas', 'mano_obra'));

DROP POLICY IF EXISTS "postventa_costos_select" ON public.postventa_costos;
CREATE POLICY "postventa_costos_select" ON public.postventa_costos
    FOR SELECT TO authenticated USING (is_active_user());

DROP POLICY IF EXISTS "postventa_costos_write" ON public.postventa_costos;
CREATE POLICY "postventa_costos_write" ON public.postventa_costos
    FOR ALL TO authenticated USING (has_role('admin', 'user', 'finanzas', 'mano_obra'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.postventa_casos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.postventa_evidencias TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.postventa_costos TO authenticated;
