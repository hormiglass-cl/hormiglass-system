-- ============================================================================
-- Migración: 20261019113000_comisiones_ventas_y_roles.sql
-- Descripción: Gestión de comisiones del equipo de ventas y asignación de obra
-- 1. Agrega columnas de comisión en public.oportunidades.
-- 2. Trigger automático para transición a 'lista_para_pago' cuando la venta está cerrada y 100% pagada.
-- 3. Función RPC para liquidación y pago de comisiones por Finanzas/Admin.
-- ============================================================================

-- 1. Columnas de comisiones en oportunidades
ALTER TABLE public.oportunidades
ADD COLUMN IF NOT EXISTS comision_porcentaje NUMERIC(5,2) DEFAULT 3.0,
ADD COLUMN IF NOT EXISTS comision_monto NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS comision_estado TEXT DEFAULT 'pendiente' CHECK (comision_estado IN ('pendiente', 'lista_para_pago', 'pagada')),
ADD COLUMN IF NOT EXISTS comision_fecha_pago TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS comision_pagada_por UUID REFERENCES public.usuarios(id) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS comision_notas TEXT DEFAULT NULL;

-- 2. Trigger para cálculo y actualización automática del estado de comisión
CREATE OR REPLACE FUNCTION public.trg_actualizar_estado_comision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_monto_total numeric;
  v_monto_abonado numeric;
  v_es_venta_cerrada boolean;
BEGIN
  NEW.comision_porcentaje := COALESCE(NEW.comision_porcentaje, 3.0);
  v_monto_total := COALESCE(NEW.monto_estimado, 0);
  v_monto_abonado := COALESCE(NEW.monto_abonado, 0);

  -- Calcular monto en CLP
  NEW.comision_monto := ROUND(v_monto_total * (NEW.comision_porcentaje / 100.0));

  -- Venta cerrada o aprobada
  v_es_venta_cerrada := NEW.estado_pipeline IN ('entregada', 'prod_finalizado', 'rev_entregado');

  -- Regla: Si la venta está cerrada y 100% pagada -> pasa a 'lista_para_pago'
  IF NEW.comision_estado IS NULL OR NEW.comision_estado = 'pendiente' THEN
    IF v_es_venta_cerrada AND v_monto_total > 0 AND v_monto_abonado >= v_monto_total THEN
      NEW.comision_estado := 'lista_para_pago';
    ELSE
      NEW.comision_estado := 'pendiente';
    END IF;
  ELSIF NEW.comision_estado = 'lista_para_pago' THEN
    -- Si la condición deja de cumplirse (ej. abono revertido o venta desaprobada)
    IF NOT (v_es_venta_cerrada AND v_monto_total > 0 AND v_monto_abonado >= v_monto_total) THEN
      NEW.comision_estado := 'pendiente';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actualizar_estado_comision_trigger ON public.oportunidades;
CREATE TRIGGER trg_actualizar_estado_comision_trigger
BEFORE INSERT OR UPDATE OF estado_pipeline, monto_estimado, monto_abonado, comision_porcentaje
ON public.oportunidades
FOR EACH ROW
EXECUTE FUNCTION public.trg_actualizar_estado_comision();

-- 3. Función RPC para liquidar/pagar comisiones
CREATE OR REPLACE FUNCTION public.marcar_comision_pagada(
  p_oportunidad_id uuid,
  p_notas text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_caller_role text;
  v_caller_id uuid;
  v_op record;
BEGIN
  SELECT id, rol INTO v_caller_id, v_caller_role
  FROM public.usuarios
  WHERE auth_id = auth.uid() AND activo = true;

  IF v_caller_role NOT IN ('admin', 'finanzas') THEN
    RAISE EXCEPTION 'Solo Administradores y Finanzas pueden liquidar o marcar comisiones como pagadas.';
  END IF;

  SELECT * INTO v_op FROM public.oportunidades WHERE id = p_oportunidad_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oportunidad no encontrada.';
  END IF;

  IF v_op.comision_estado <> 'lista_para_pago' THEN
    RAISE EXCEPTION 'La comisión debe estar en estado "Lista para pago" antes de ser liquidada. Estado actual: %', v_op.comision_estado;
  END IF;

  UPDATE public.oportunidades
  SET comision_estado = 'pagada',
      comision_fecha_pago = now(),
      comision_pagada_por = v_caller_id,
      comision_notas = COALESCE(p_notas, comision_notas)
  WHERE id = p_oportunidad_id;

  INSERT INTO public.logs_sistema (
    tipo_accion,
    entidad,
    entidad_id,
    descripcion,
    usuario_id,
    datos_nuevos
  ) VALUES (
    'actualizar',
    'comisiones',
    p_oportunidad_id::text,
    'Comisión pagada por venta: ' || COALESCE(v_op.codigo, v_op.titulo),
    v_caller_id,
    jsonb_build_object(
      'oportunidad_id', p_oportunidad_id,
      'comision_monto', v_op.comision_monto,
      'asignado_a', v_op.asignado_a
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'oportunidad_id', p_oportunidad_id,
    'comision_estado', 'pagada',
    'comision_monto', v_op.comision_monto
  );
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_comision_pagada(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_comision_pagada(uuid, text) TO authenticated, service_role;
