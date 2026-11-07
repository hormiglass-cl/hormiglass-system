-- ============================================================================
-- Migración: 20261106020000_normalizar_abonos_visitas_y_bitacora.sql
-- Fase 5: Fuente Única de Verdad en Base de Datos (Abonos, Visitas, Tareas y Bitácora)
-- ============================================================================
-- 1. Abonos (public.abonos como única fuente de verdad):
--    - Trigger en public.abonos que sincroniza oportunidades.monto_abonado
--      y oportunidades.comprobantes_pago ante cualquier INSERT/UPDATE/DELETE.
--    - Actualiza public.generar_avisos_cobro() para calcular el monto pagado
--      directamente desde public.abonos WHERE estado = 'validado'.
-- 2. Visitas a Terreno (public.visitas_terreno como única fuente de verdad):
--    - Backfill de visitas históricas desde columnas planas de oportunidades
--      hacia public.visitas_terreno.
--    - Trigger en public.visitas_terreno que mantiene sincronizadas las columnas
--      resumen en public.oportunidades automáticamente sin doble escritura en UI.
-- 3. Bitácora y Timeline Unificado de Cliente:
--    - Agrega cliente_id a public.actividades_op con backfill y trigger automático.
--    - Crea la vista public.v_timeline_cliente (security_invoker = true) que une
--      notas_actividad y actividades_op en un solo flujo cronológico por cliente.
-- 4. Deprecación segura de tablas legadas sin uso:
--    - Revoca permisos de escritura y documenta tablas obsoletas.
-- ============================================================================

-- ============================================================================
-- 1. ABONOS COMO FUENTE ÚNICA DE VERDAD
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_sync_abonos_to_oportunidad()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_op_id UUID;
  v_total_validado NUMERIC := 0;
  v_pagos_json JSONB := '[]'::jsonb;
BEGIN
  v_op_id := COALESCE(NEW.oportunidad_id, OLD.oportunidad_id);
  IF v_op_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(a.monto), 0)
    INTO v_total_validado
    FROM public.abonos a
   WHERE a.oportunidad_id = v_op_id
     AND a.estado = 'validado';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'monto', a.monto,
        'fecha', to_char(a.fecha AT TIME ZONE 'America/Santiago', 'DD-MM-YYYY HH24:MI'),
        'fecha_iso', a.fecha,
        'nota', a.nota,
        'estado', a.estado,
        'motivo_rechazo', a.motivo_rechazo,
        'cuenta_bancaria_id', a.cuenta_bancaria_id,
        'banco_alias', cb.alias,
        'comprobante_nombre', a.comprobante_nombre,
        'comprobante_url', a.comprobante_url,
        'creado_por', a.creado_por_nombre,
        'validado_por', a.validado_por_nombre,
        'validado_at', a.validado_at
      ) ORDER BY a.fecha ASC, a.created_at ASC
    ),
    '[]'::jsonb
  )
    INTO v_pagos_json
    FROM public.abonos a
    LEFT JOIN public.cuentas_bancarias cb ON cb.id = a.cuenta_bancaria_id
   WHERE a.oportunidad_id = v_op_id;

  UPDATE public.oportunidades
     SET monto_abonado = v_total_validado,
         comprobantes_pago = v_pagos_json,
         updated_at = now()
   WHERE id = v_op_id
     AND (
       monto_abonado IS DISTINCT FROM v_total_validado
       OR comprobantes_pago IS DISTINCT FROM v_pagos_json
     );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_abonos_to_oportunidad_trigger ON public.abonos;
CREATE TRIGGER trg_sync_abonos_to_oportunidad_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.abonos
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_abonos_to_oportunidad();

-- Actualizar generar_avisos_cobro para consultar public.abonos como fuente canónica
CREATE OR REPLACE FUNCTION public.generar_avisos_cobro(
  p_hoy date DEFAULT (now() AT TIME ZONE 'America/Santiago')::date
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sale record;
  recipient uuid;
  cycle_number integer;
  total_amount numeric;
  paid_amount numeric;
  inserted_count integer := 0;
BEGIN
  FOR sale IN
    SELECT
      o.id,
      o.codigo,
      o.asignado_a,
      o.fecha_vencimiento_cobro,
      COALESCE(
        (SELECT SUM(a.monto) FROM public.abonos a WHERE a.oportunidad_id = o.id AND a.estado = 'validado'),
        o.monto_abonado,
        0
      ) AS abono_validado_real,
      c.monto_total
    FROM public.oportunidades o
    JOIN public.cotizaciones c ON c.id = o.cotizacion_actual_id
    WHERE o.fecha_vencimiento_cobro <= p_hoy
      AND c.estado IN ('enviada', 'aprobada')
      AND public.entrega_acreditada(o.id)
  LOOP
    paid_amount := greatest(coalesce(sale.abono_validado_real, 0), 0);
    total_amount := coalesce(sale.monto_total, 0);
    IF total_amount <= paid_amount THEN
      CONTINUE;
    END IF;
    cycle_number := (p_hoy - sale.fecha_vencimiento_cobro) / 7;
    FOR recipient IN
      SELECT DISTINCT id FROM public.usuarios
      WHERE activo AND (id = sale.asignado_a OR rol = 'admin')
    LOOP
      INSERT INTO public.cobro_aviso_ciclos(
        oportunidad_id, usuario_id, fecha_vencimiento, ciclo
      ) VALUES (
        sale.id, recipient, sale.fecha_vencimiento_cobro, cycle_number
      ) ON CONFLICT DO NOTHING;
      IF FOUND THEN
        INSERT INTO public.notificaciones(
          usuario_id, mensaje, tipo, entidad_relacionada, link_url
        ) VALUES (
          recipient,
          'Cobro vencido de la venta ' || sale.codigo ||
            '. Saldo pendiente: $' || (total_amount - paid_amount)::text,
          'cobro_vencido', sale.id::text,
          '/ventas?oportunidad=' || sale.id::text
        );
        inserted_count := inserted_count + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generar_avisos_cobro(date)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. VISITAS A TERRENO COMO FUENTE ÚNICA DE VERDAD
-- ============================================================================
-- Backfill de visitas históricas que existían sólo en columnas de oportunidades
INSERT INTO public.visitas_terreno (
  oportunidad_id,
  tecnico_id,
  tecnico_visita,
  fecha_visita_terreno,
  hora_visita_terreno,
  estado_visita,
  observaciones_visita
)
SELECT
  o.id,
  o.tecnico_id,
  COALESCE(NULLIF(trim(o.tecnico_visita), ''), 'Por asignar'),
  o.fecha_visita_terreno,
  COALESCE(NULLIF(trim(o.hora_visita_terreno), ''), '09:00'),
  COALESCE(NULLIF(trim(o.estado_visita), ''), 'programada'),
  o.observaciones_visita
FROM public.oportunidades o
WHERE o.fecha_visita_terreno IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.visitas_terreno vt
    WHERE vt.oportunidad_id = o.id
  );

-- Trigger para sincronizar automáticamente oportunidades desde public.visitas_terreno
CREATE OR REPLACE FUNCTION public.trg_sync_visitas_terreno_to_oportunidad()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_op_id UUID;
  v_vis RECORD;
BEGIN
  v_op_id := COALESCE(NEW.oportunidad_id, OLD.oportunidad_id);
  IF v_op_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Seleccionar la visita activa/más reciente de la oportunidad (priorizando programadas o realizadas)
  SELECT
    vt.fecha_visita_terreno,
    vt.hora_visita_terreno,
    vt.tecnico_id,
    vt.tecnico_visita,
    vt.estado_visita,
    vt.observaciones_visita
  INTO v_vis
  FROM public.visitas_terreno vt
  WHERE vt.oportunidad_id = v_op_id
  ORDER BY
    CASE WHEN COALESCE(vt.estado_visita, 'programada') = 'cancelada' THEN 1 ELSE 0 END ASC,
    vt.fecha_visita_terreno DESC NULLS LAST,
    vt.created_at DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.oportunidades
       SET fecha_visita_terreno = v_vis.fecha_visita_terreno,
           hora_visita_terreno = v_vis.hora_visita_terreno,
           tecnico_id = v_vis.tecnico_id,
           tecnico_visita = v_vis.tecnico_visita,
           estado_visita = v_vis.estado_visita,
           observaciones_visita = v_vis.observaciones_visita,
           requiere_visita_terreno = true,
           updated_at = now()
     WHERE id = v_op_id;
  ELSE
    UPDATE public.oportunidades
       SET fecha_visita_terreno = NULL,
           hora_visita_terreno = NULL,
           tecnico_id = NULL,
           tecnico_visita = NULL,
           estado_visita = NULL,
           observaciones_visita = NULL,
           requiere_visita_terreno = false,
           updated_at = now()
     WHERE id = v_op_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_visitas_terreno_to_oportunidad_trigger ON public.visitas_terreno;
CREATE TRIGGER trg_sync_visitas_terreno_to_oportunidad_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.visitas_terreno
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_visitas_terreno_to_oportunidad();

-- ============================================================================
-- 3. BITÁCORA COMERCIAL Y TIMELINE UNIFICADO DEL CLIENTE
-- ============================================================================
ALTER TABLE public.actividades_op
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL;

-- Campos de recordatorio (misma forma que notas_actividad) para unir ambos flujos en la vista
ALTER TABLE public.actividades_op
  ADD COLUMN IF NOT EXISTS fecha_recordatorio timestamptz,
  ADD COLUMN IF NOT EXISTS hora_recordatorio text;

CREATE INDEX IF NOT EXISTS idx_actividades_op_cliente_id
  ON public.actividades_op(cliente_id);

-- Backfill de cliente_id en actividades_op desde oportunidades
UPDATE public.actividades_op a
   SET cliente_id = o.cliente_id
  FROM public.oportunidades o
 WHERE a.oportunidad_id = o.id
   AND a.cliente_id IS NULL
   AND o.cliente_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_fill_actividad_op_cliente_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.cliente_id IS NULL AND NEW.oportunidad_id IS NOT NULL THEN
    SELECT o.cliente_id INTO NEW.cliente_id
      FROM public.oportunidades o
     WHERE o.id = NEW.oportunidad_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_actividad_op_cliente_id_trigger ON public.actividades_op;
CREATE TRIGGER trg_fill_actividad_op_cliente_id_trigger
BEFORE INSERT OR UPDATE OF oportunidad_id ON public.actividades_op
FOR EACH ROW
EXECUTE FUNCTION public.trg_fill_actividad_op_cliente_id();

-- Vista unificada del timeline comercial + operativo por cliente
CREATE OR REPLACE VIEW public.v_timeline_cliente
WITH (security_invoker = true)
AS
SELECT
  n.id AS registro_id,
  'cliente'::text AS origen,
  n.cliente_id,
  NULL::uuid AS oportunidad_id,
  NULL::text AS oportunidad_codigo,
  n.usuario_id,
  COALESCE(u.nombre, 'Sistema') AS usuario_nombre,
  COALESCE(n.tipo_actividad, 'nota')::text AS tipo,
  n.contenido,
  n.fecha_recordatorio,
  n.hora_recordatorio,
  n.fecha AS fecha_evento
FROM public.notas_actividad n
LEFT JOIN public.usuarios u ON u.id = n.usuario_id
UNION ALL
SELECT
  a.id AS registro_id,
  'oportunidad'::text AS origen,
  COALESCE(a.cliente_id, o.cliente_id) AS cliente_id,
  a.oportunidad_id,
  o.codigo AS oportunidad_codigo,
  a.usuario_id,
  COALESCE(a.usuario_nombre, u.nombre, 'Sistema') AS usuario_nombre,
  COALESCE(a.tipo, 'comentario')::text AS tipo,
  a.contenido,
  a.fecha_recordatorio,
  a.hora_recordatorio,
  a.created_at AS fecha_evento
FROM public.actividades_op a
LEFT JOIN public.oportunidades o ON o.id = a.oportunidad_id
LEFT JOIN public.usuarios u ON u.id = a.usuario_id;

GRANT SELECT ON public.v_timeline_cliente TO authenticated;

-- ============================================================================
-- 4. DEPRECACIÓN SEGURA DE TABLAS LEGADAS SIN USO
-- ============================================================================
DO $$
DECLARE
  v_tbl text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'ventas',
    'pedidos_proveedor',
    'proyectos_planificacion',
    'ordenes_reventa'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_tbl
    ) THEN
      EXECUTE format(
        'COMMENT ON TABLE public.%I IS %L',
        v_tbl,
        'DEPRECATED (Fase 5 CRM Unificación): Tabla histórica reemplazada por oportunidades, ordenes_compra y eventos_produccion_logistica. Solo lectura.'
      );
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated', v_tbl);
    END IF;
  END LOOP;
END $$;
