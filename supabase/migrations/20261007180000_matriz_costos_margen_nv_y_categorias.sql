-- ==============================================================================
-- MIGRACIÓN: Matriz Operacional de Costos, Margen por NV y Categorías de Caja (Fase 3)
-- Fecha: 2026-10-07
-- Descripción:
--   1. Crea tablas públicas caja_categorias y caja_subcategorias para estructurar
--      costos directos, gastos operacionales, administrativos y financieros.
--   2. Siembra catálogo inicial de categorías y subcategorías contables estándar.
--   3. Enriquece caja_movimientos con empresa_id, categoria_id, subcategoria_id,
--      orden_compra_id y proveedor_id con índices correspondientes.
--   4. Habilita estado 'pagada', fecha_pago y caja_movimiento_id en ordenes_compra.
--   5. Implementa RPC pagar_orden_compra_en_caja para liquidar OCs generando egreso.
--   6. Crea la vista SQL v_margen_por_nv con ingresos reales, costos y rentabilidad.
--   7. Configura RLS y permisos correspondientes.
-- ==============================================================================

-- 1. Tabla de Categorías de Caja
CREATE TABLE IF NOT EXISTS public.caja_categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
    clasificacion TEXT NOT NULL CHECK (clasificacion IN (
        'costo_directo',
        'gasto_operacional',
        'gasto_administrativo',
        'gasto_financiero',
        'ingreso_operacional',
        'ingreso_no_operacional'
    )),
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    orden INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabla de Subcategorías de Caja
CREATE TABLE IF NOT EXISTS public.caja_subcategorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria_id UUID NOT NULL REFERENCES public.caja_categorias(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    orden INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caja_subcategorias_categoria_id ON public.caja_subcategorias(categoria_id);
CREATE INDEX IF NOT EXISTS idx_caja_categorias_tipo ON public.caja_categorias(tipo);
CREATE INDEX IF NOT EXISTS idx_caja_categorias_clasificacion ON public.caja_categorias(clasificacion);

-- 3. Siembra inicial de Categorías y Subcategorías (idempotente)
DO $$
DECLARE
    v_cat_cd_id UUID;
    v_cat_go_id UUID;
    v_cat_ga_id UUID;
    v_cat_gf_id UUID;
    v_cat_io_id UUID;
    v_cat_ino_id UUID;
BEGIN
    -- Categoría: Costos Directos de Venta (Egreso)
    SELECT id INTO v_cat_cd_id FROM public.caja_categorias WHERE nombre = 'Costos Directos de Venta' LIMIT 1;
    IF v_cat_cd_id IS NULL THEN
        INSERT INTO public.caja_categorias (nombre, tipo, clasificacion, descripcion, orden)
        VALUES ('Costos Directos de Venta', 'egreso', 'costo_directo', 'Materiales, insumos, mano de obra y traslados directamente asignados a ventas', 1)
        RETURNING id INTO v_cat_cd_id;
    END IF;

    -- Subcategorías de Costos Directos
    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_cd_id, 'Materiales e Insumos (OC Proveedor)', 'Compras de áridos, cemento, cristales, herrajes y perfiles para órdenes', 1
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_cd_id AND nombre = 'Materiales e Insumos (OC Proveedor)');

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_cd_id, 'Fletes y Despachos de Guías', 'Costos de traslados, combustible y flete externo por entrega de productos', 2
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_cd_id AND nombre = 'Fletes y Despachos de Guías');

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_cd_id, 'Mano de Obra en Terreno e Instalación', 'Pagos por instalación, cuadrillas externas y montaje en terreno', 3
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_cd_id AND nombre = 'Mano de Obra en Terreno e Instalación');

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_cd_id, 'Herramientas Específicas de Obra', 'Consumibles y herramientas menores imputables directamente a la faena', 4
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_cd_id AND nombre = 'Herramientas Específicas de Obra');

    -- Categoría: Gastos Operacionales Planta (Egreso)
    SELECT id INTO v_cat_go_id FROM public.caja_categorias WHERE nombre = 'Gastos Operacionales Planta' LIMIT 1;
    IF v_cat_go_id IS NULL THEN
        INSERT INTO public.caja_categorias (nombre, tipo, clasificacion, descripcion, orden)
        VALUES ('Gastos Operacionales Planta', 'egreso', 'gasto_operacional', 'Costos fijos y variables de mantenimiento de talleres y bodega', 2)
        RETURNING id INTO v_cat_go_id;
    END IF;

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_go_id, 'Arriendo Planta y Galpón', 'Pagos de arriendo de instalaciones productivas', 1
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_go_id AND nombre = 'Arriendo Planta y Galpón');

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_go_id, 'Mantención Maquinaria y Moldes', 'Reparación de hormigoneras, mesas vibradoras y moldes', 2
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_go_id AND nombre = 'Mantención Maquinaria y Moldes');

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_go_id, 'Combustible y Vehículos Operativos', 'Petróleo/Bencina y mantención de camiones y camionetas de flota propia', 3
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_go_id AND nombre = 'Combustible y Vehículos Operativos');

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_go_id, 'EPP y Seguridad Laboral', 'Equipos de protección personal y elementos de seguridad', 4
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_go_id AND nombre = 'EPP y Seguridad Laboral');

    -- Categoría: Gastos Administrativos (Egreso)
    SELECT id INTO v_cat_ga_id FROM public.caja_categorias WHERE nombre = 'Gastos Administrativos' LIMIT 1;
    IF v_cat_ga_id IS NULL THEN
        INSERT INTO public.caja_categorias (nombre, tipo, clasificacion, descripcion, orden)
        VALUES ('Gastos Administrativos', 'egreso', 'gasto_administrativo', 'Sueldos de administración, servicios básicos, software y asesorías', 3)
        RETURNING id INTO v_cat_ga_id;
    END IF;

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_ga_id, 'Sueldos y Remuneraciones Admin', 'Remuneraciones de administración, finanzas y gerencia', 1
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_ga_id AND nombre = 'Sueldos y Remuneraciones Admin');

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_ga_id, 'Servicios Básicos (Luz, Agua, Gas)', 'Consumos de servicios básicos de oficinas y planta', 2
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_ga_id AND nombre = 'Servicios Básicos (Luz, Agua, Gas)');

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_ga_id, 'Software, CRM y Comunicaciones', 'Licencias informáticas, telefonía móvil y servidores', 3
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_ga_id AND nombre = 'Software, CRM y Comunicaciones');

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_ga_id, 'Asesorías Contables y Legales', 'Honorarios de contabilidad externa, auditoría y legal', 4
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_ga_id AND nombre = 'Asesorías Contables y Legales');

    -- Categoría: Gastos Financieros (Egreso)
    SELECT id INTO v_cat_gf_id FROM public.caja_categorias WHERE nombre = 'Gastos Financieros' LIMIT 1;
    IF v_cat_gf_id IS NULL THEN
        INSERT INTO public.caja_categorias (nombre, tipo, clasificacion, descripcion, orden)
        VALUES ('Gastos Financieros', 'egreso', 'gasto_financiero', 'Comisiones bancarias, intereses y cargos por transferencias', 4)
        RETURNING id INTO v_cat_gf_id;
    END IF;

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_gf_id, 'Comisiones Bancarias y Tarjetas', 'Mantención de cuentas corrientes, comisiones POS y transferencias', 1
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_gf_id AND nombre = 'Comisiones Bancarias y Tarjetas');

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_gf_id, 'Intereses y Líneas de Crédito', 'Intereses bancarios, factorings o préstamos comerciales', 2
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_gf_id AND nombre = 'Intereses y Líneas de Crédito');

    -- Categoría: Ingresos Operacionales (Ingreso)
    SELECT id INTO v_cat_io_id FROM public.caja_categorias WHERE nombre = 'Ingresos Operacionales' LIMIT 1;
    IF v_cat_io_id IS NULL THEN
        INSERT INTO public.caja_categorias (nombre, tipo, clasificacion, descripcion, orden)
        VALUES ('Ingresos Operacionales', 'ingreso', 'ingreso_operacional', 'Cobros por ventas de productos fabricados, reventa e instalaciones', 1)
        RETURNING id INTO v_cat_io_id;
    END IF;

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_io_id, 'Abono / Anticipo de Venta', 'Anticipos recibidos de clientes para iniciar fabricación o despacho', 1
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_io_id AND nombre = 'Abono / Anticipo de Venta');

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_io_id, 'Liquidación Saldo Venta', 'Pago final de ventas contra entrega o según crédito pactado', 2
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_io_id AND nombre = 'Liquidación Saldo Venta');

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_io_id, 'Servicio de Flete e Instalación', 'Ingresos facturados por servicios complementarios', 3
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_io_id AND nombre = 'Servicio de Flete e Instalación');

    -- Categoría: Otros Ingresos (Ingreso No Operacional)
    SELECT id INTO v_cat_ino_id FROM public.caja_categorias WHERE nombre = 'Otros Ingresos' LIMIT 1;
    IF v_cat_ino_id IS NULL THEN
        INSERT INTO public.caja_categorias (nombre, tipo, clasificacion, descripcion, orden)
        VALUES ('Otros Ingresos', 'ingreso', 'ingreso_no_operacional', 'Ingresos extraordinarios no provenientes del giro principal', 2)
        RETURNING id INTO v_cat_ino_id;
    END IF;

    INSERT INTO public.caja_subcategorias (categoria_id, nombre, descripcion, orden)
    SELECT v_cat_ino_id, 'Rendimientos Financieros / Reembolsos', 'Intereses a favor, devoluciones o reajustes', 1
    WHERE NOT EXISTS (SELECT 1 FROM public.caja_subcategorias WHERE categoria_id = v_cat_ino_id AND nombre = 'Rendimientos Financieros / Reembolsos');
END $$;

-- 4. Ampliar caja_movimientos con nuevas relaciones
ALTER TABLE public.caja_movimientos
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS categoria_id UUID REFERENCES public.caja_categorias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subcategoria_id UUID REFERENCES public.caja_subcategorias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS orden_compra_id UUID REFERENCES public.ordenes_compra(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_empresa_id ON public.caja_movimientos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_categoria_id ON public.caja_movimientos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_subcategoria_id ON public.caja_movimientos(subcategoria_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_orden_compra_id ON public.caja_movimientos(orden_compra_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_proveedor_id ON public.caja_movimientos(proveedor_id);

-- 5. Ampliar ordenes_compra con estado 'pagada', fecha_pago y caja_movimiento_id
ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS caja_movimiento_id UUID REFERENCES public.caja_movimientos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fecha_pago TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pagado_por_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL;

-- Actualizar constraint de estado para aceptar 'pagada'
ALTER TABLE public.ordenes_compra DROP CONSTRAINT IF EXISTS ordenes_compra_estado_check;
ALTER TABLE public.ordenes_compra ADD CONSTRAINT ordenes_compra_estado_check 
  CHECK (estado = ANY (ARRAY['borrador'::text, 'emitida'::text, 'aprobada'::text, 'recibida'::text, 'pagada'::text, 'cancelada'::text]));

CREATE INDEX IF NOT EXISTS idx_ordenes_compra_caja_movimiento_id ON public.ordenes_compra(caja_movimiento_id);

-- 6. RPC para pagar una Orden de Compra desde Caja / Órdenes de Compra
CREATE OR REPLACE FUNCTION public.pagar_orden_compra_en_caja(
    p_orden_compra_id UUID,
    p_cuenta_bancaria_id UUID,
    p_subcategoria_id UUID DEFAULT NULL,
    p_descripcion TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_oc RECORD;
    v_cuenta RECORD;
    v_subcat RECORD;
    v_cat_id UUID;
    v_auth_uid UUID := auth.uid();
    v_app_usuario_id UUID;
    v_usuario_nombre TEXT := 'Usuario Sistema';
    v_mov_id UUID;
    v_glosa TEXT;
    v_principal_op_id UUID;
BEGIN
    -- Resolver el ID interno del usuario en la tabla public.usuarios
    IF v_auth_uid IS NOT NULL THEN
        SELECT id, nombre INTO v_app_usuario_id, v_usuario_nombre 
        FROM public.usuarios 
        WHERE auth_id = v_auth_uid OR id = v_auth_uid
        LIMIT 1;
    END IF;

    -- Si no se encontró el usuario pero hay usuarios en la base, asignar el primer admin
    IF v_app_usuario_id IS NULL THEN
        SELECT id, nombre INTO v_app_usuario_id, v_usuario_nombre
        FROM public.usuarios
        WHERE rol = 'admin' AND activo = true
        LIMIT 1;
    END IF;

    -- Obtener datos de la Orden de Compra
    SELECT oc.*, p.nombre AS proveedor_nombre, p.rut AS proveedor_rut
    INTO v_oc
    FROM public.ordenes_compra oc
    LEFT JOIN public.proveedores p ON p.id = oc.proveedor_id
    WHERE oc.id = p_orden_compra_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La orden de compra no existe.';
    END IF;

    IF v_oc.estado = 'cancelada' THEN
        RAISE EXCEPTION 'No se puede pagar una orden de compra cancelada.';
    END IF;

    -- Validar cuenta bancaria
    SELECT cb.*, e.id AS emp_id, e.razon_social AS emp_nombre
    INTO v_cuenta
    FROM public.cuentas_bancarias cb
    LEFT JOIN public.empresas e ON e.id = cb.empresa_id
    WHERE cb.id = p_cuenta_bancaria_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La cuenta bancaria seleccionada no existe.';
    END IF;

    -- Subcategoría por defecto si no viene
    IF p_subcategoria_id IS NOT NULL THEN
        SELECT s.id, s.categoria_id INTO v_subcat
        FROM public.caja_subcategorias s
        WHERE s.id = p_subcategoria_id;
        v_cat_id := v_subcat.categoria_id;
    ELSE
        -- Buscar la subcategoría por defecto 'Materiales e Insumos (OC Proveedor)'
        SELECT s.id, s.categoria_id INTO v_subcat
        FROM public.caja_subcategorias s
        JOIN public.caja_categorias c ON c.id = s.categoria_id
        WHERE s.nombre ILIKE '%Materiales e Insumos%'
        LIMIT 1;
        v_cat_id := v_subcat.categoria_id;
    END IF;

    -- Obtener la oportunidad principal si existe
    v_principal_op_id := v_oc.oportunidad_id;
    IF v_principal_op_id IS NULL THEN
        SELECT oportunidad_id INTO v_principal_op_id
        FROM public.orden_compra_asignaciones
        WHERE orden_compra_id = p_orden_compra_id
        LIMIT 1;
    END IF;

    v_glosa := COALESCE(
        NULLIF(p_descripcion, ''),
        'Pago OC ' || v_oc.numero_oc || ' - ' || COALESCE(v_oc.proveedor_nombre, 'Proveedor') || ' (' || v_cuenta.alias || ')'
    );

    -- Insertar movimiento de egreso en caja
    INSERT INTO public.caja_movimientos (
        tipo,
        monto,
        categoria,
        descripcion,
        fecha,
        cuenta_bancaria_id,
        empresa_id,
        categoria_id,
        subcategoria_id,
        orden_compra_id,
        proveedor_id,
        oportunidad_id,
        usuario_id
    ) VALUES (
        'egreso',
        v_oc.monto_total,
        'Costos Directos',
        v_glosa,
        now(),
        p_cuenta_bancaria_id,
        v_cuenta.empresa_id,
        v_cat_id,
        v_subcat.id,
        p_orden_compra_id,
        v_oc.proveedor_id,
        v_principal_op_id,
        v_app_usuario_id
    ) RETURNING id INTO v_mov_id;

    -- Actualizar orden de compra a pagada
    UPDATE public.ordenes_compra
    SET estado = 'pagada',
        caja_movimiento_id = v_mov_id,
        fecha_pago = now(),
        pagado_por_id = v_app_usuario_id,
        updated_at = now()
    WHERE id = p_orden_compra_id;

    RETURN jsonb_build_object(
        'success', true,
        'orden_compra_id', p_orden_compra_id,
        'caja_movimiento_id', v_mov_id,
        'monto_pagado', v_oc.monto_total,
        'cuenta_alias', v_cuenta.alias
    );
END;
$$;

-- 7. Vista SQL v_margen_por_nv: Matriz de Costos y Rentabilidad por Nota de Venta
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
    AND orden_compra_id IS NULL  -- evitar duplicar compras si ya están asignadas via OC
  GROUP BY oportunidad_id
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
  -- Costo Directo Total Acumulado
  (COALESCE(cc.costo_compras_asignadas, 0) + COALESCE(cf.costo_fletes_despacho, 0) + COALESCE(cd.costo_caja_directo, 0)) AS costo_directo_total,
  -- Margen Bruto Real (calculado contra ingresos validados)
  (COALESCE(iv.total_ingresos_validados, o.monto_abonado, 0) - (COALESCE(cc.costo_compras_asignadas, 0) + COALESCE(cf.costo_fletes_despacho, 0) + COALESCE(cd.costo_caja_directo, 0))) AS margen_bruto_real,
  -- Margen Bruto Proyectado (calculado contra venta cotizada total)
  (COALESCE(ca.valor_total, 0) - (COALESCE(cc.costo_compras_asignadas, 0) + COALESCE(cf.costo_fletes_despacho, 0) + COALESCE(cd.costo_caja_directo, 0))) AS margen_bruto_proyectado,
  -- Porcentaje de Margen Proyectado
  CASE
    WHEN COALESCE(ca.valor_total, 0) > 0 THEN
      ROUND(((COALESCE(ca.valor_total, 0) - (COALESCE(cc.costo_compras_asignadas, 0) + COALESCE(cf.costo_fletes_despacho, 0) + COALESCE(cd.costo_caja_directo, 0))) / ca.valor_total) * 100, 1)
    ELSE 0
  END AS porcentaje_margen_proyectado,
  -- Porcentaje de Margen Real
  CASE
    WHEN COALESCE(iv.total_ingresos_validados, o.monto_abonado, 0) > 0 THEN
      ROUND(((COALESCE(iv.total_ingresos_validados, o.monto_abonado, 0) - (COALESCE(cc.costo_compras_asignadas, 0) + COALESCE(cf.costo_fletes_despacho, 0) + COALESCE(cd.costo_caja_directo, 0))) / COALESCE(iv.total_ingresos_validados, o.monto_abonado, 0)) * 100, 1)
    ELSE 0
  END AS porcentaje_margen_real
FROM public.oportunidades o
LEFT JOIN cotizacion_activa ca ON ca.oportunidad_id = o.id
LEFT JOIN public.clientes cl ON cl.id = o.cliente_id
LEFT JOIN public.usuarios u ON u.id = o.asignado_a
LEFT JOIN ingresos_validados iv ON iv.oportunidad_id = o.id
LEFT JOIN costos_compras cc ON cc.oportunidad_id = o.id
LEFT JOIN costos_fletes cf ON cf.oportunidad_id = o.id
LEFT JOIN costos_caja_directos cd ON cd.oportunidad_id = o.id;

-- 8. Seguridad y Políticas RLS
ALTER TABLE public.caja_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caja_subcategorias ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura para usuarios activos
DROP POLICY IF EXISTS "caja_categorias_select_active" ON public.caja_categorias;
CREATE POLICY "caja_categorias_select_active" ON public.caja_categorias
    FOR SELECT TO authenticated USING (is_active_user());

DROP POLICY IF EXISTS "caja_subcategorias_select_active" ON public.caja_subcategorias;
CREATE POLICY "caja_subcategorias_select_active" ON public.caja_subcategorias
    FOR SELECT TO authenticated USING (is_active_user());

-- Políticas de escritura para admin y finanzas
DROP POLICY IF EXISTS "caja_categorias_write_admin_finanzas" ON public.caja_categorias;
CREATE POLICY "caja_categorias_write_admin_finanzas" ON public.caja_categorias
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.usuarios
            WHERE id = auth.uid() AND rol IN ('admin', 'finanzas') AND activo = true
        )
    );

DROP POLICY IF EXISTS "caja_subcategorias_write_admin_finanzas" ON public.caja_subcategorias;
CREATE POLICY "caja_subcategorias_write_admin_finanzas" ON public.caja_subcategorias
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.usuarios
            WHERE id = auth.uid() AND rol IN ('admin', 'finanzas') AND activo = true
        )
    );

-- Permisos GRANT
GRANT ALL ON TABLE public.caja_categorias TO authenticated;
GRANT ALL ON TABLE public.caja_subcategorias TO authenticated;
GRANT SELECT ON TABLE public.caja_categorias TO anon;
GRANT SELECT ON TABLE public.caja_subcategorias TO anon;
GRANT SELECT ON TABLE public.v_margen_por_nv TO authenticated;
GRANT SELECT ON TABLE public.v_margen_por_nv TO anon;
GRANT EXECUTE ON FUNCTION public.pagar_orden_compra_en_caja(UUID, UUID, UUID, TEXT) TO authenticated;
