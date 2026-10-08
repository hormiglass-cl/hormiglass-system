-- ==============================================================================
-- MIGRACIÓN: Módulo de Abonos y Flujo de Validación de Pagos en Caja (Fase 2)
-- Fecha: 2026-10-07
-- Descripción:
--   1. Crea tabla relacional public.abonos para almacenar y validar comprobantes.
--   2. Enlaza public.caja_movimientos con cuenta_bancaria_id y oportunidad_id.
--   3. Migra registros históricos de oportunidades.comprobantes_pago como 'validados'.
--   4. Implementa RPCs public.validar_abono y public.rechazar_abono para aprobación en 1 clic.
--   5. Adapta public.registrar_abono_atomico para insertar con estado 'pendiente'.
--   6. Configura RLS para proteger la integridad financiera.
-- ==============================================================================

-- 1. Crear tabla public.abonos
CREATE TABLE IF NOT EXISTS public.abonos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oportunidad_id UUID NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
    monto NUMERIC NOT NULL CHECK (monto > 0),
    fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
    nota TEXT,
    comprobante_url TEXT,
    comprobante_nombre TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'validado', 'rechazado', 'anulado')),
    motivo_rechazo TEXT,
    cuenta_bancaria_id UUID REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL,
    caja_movimiento_id UUID REFERENCES public.caja_movimientos(id) ON DELETE SET NULL,
    creado_por_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    creado_por_nombre TEXT,
    validado_por_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    validado_por_nombre TEXT,
    validado_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para búsqueda rápida en caja y oportunidades
CREATE INDEX IF NOT EXISTS idx_abonos_oportunidad_id ON public.abonos(oportunidad_id);
CREATE INDEX IF NOT EXISTS idx_abonos_estado ON public.abonos(estado);
CREATE INDEX IF NOT EXISTS idx_abonos_cuenta_bancaria_id ON public.abonos(cuenta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_abonos_fecha ON public.abonos(fecha DESC);

-- 2. Enlazar caja_movimientos con cuenta_bancaria_id y oportunidad_id
ALTER TABLE public.caja_movimientos 
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id UUID REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS oportunidad_id UUID REFERENCES public.oportunidades(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_cuenta_bancaria_id ON public.caja_movimientos(cuenta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_oportunidad_id ON public.caja_movimientos(oportunidad_id);

-- 3. Migrar registros históricos de comprobantes_pago a la tabla abonos (estado 'validado')
INSERT INTO public.abonos (
  id,
  oportunidad_id,
  monto,
  fecha,
  nota,
  comprobante_url,
  comprobante_nombre,
  estado,
  creado_por_nombre,
  validado_at,
  created_at
)
SELECT
  CASE 
    WHEN v->>'id' IS NOT NULL AND (v->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (v->>'id')::uuid
    ELSE gen_random_uuid()
  END AS id,
  o.id AS oportunidad_id,
  coalesce((v->>'monto')::numeric, 0) AS monto,
  coalesce(nullif(v->>'fecha_iso', '')::timestamptz, now()) AS fecha,
  coalesce(v->>'nota', 'Abono histórico') AS nota,
  v->>'comprobante_url',
  v->>'comprobante_nombre',
  'validado' AS estado,
  coalesce(v->>'creado_por', 'Sistema') AS creado_por_nombre,
  now() AS validado_at,
  coalesce(nullif(v->>'fecha_iso', '')::timestamptz, now()) AS created_at
FROM public.oportunidades o,
jsonb_array_elements(CASE WHEN jsonb_typeof(o.comprobantes_pago) = 'array' THEN o.comprobantes_pago ELSE '[]'::jsonb END) v
WHERE coalesce((v->>'monto')::numeric, 0) > 0
ON CONFLICT (id) DO NOTHING;

-- 4. Configurar RLS en public.abonos
ALTER TABLE public.abonos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'abonos' AND policyname = 'abonos_select') THEN
    CREATE POLICY abonos_select ON public.abonos
      FOR SELECT TO authenticated
      USING (is_active_user());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'abonos' AND policyname = 'abonos_insert') THEN
    CREATE POLICY abonos_insert ON public.abonos
      FOR INSERT TO authenticated
      WITH CHECK (is_active_user());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'abonos' AND policyname = 'abonos_update') THEN
    CREATE POLICY abonos_update ON public.abonos
      FOR UPDATE TO authenticated
      USING (has_role(VARIADIC ARRAY['admin'::text, 'finanzas'::text]))
      WITH CHECK (has_role(VARIADIC ARRAY['admin'::text, 'finanzas'::text]));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'abonos' AND policyname = 'abonos_delete') THEN
    CREATE POLICY abonos_delete ON public.abonos
      FOR DELETE TO authenticated
      USING (has_role(VARIADIC ARRAY['admin'::text, 'finanzas'::text]));
  END IF;
END $$;

GRANT ALL ON TABLE public.abonos TO authenticated;

-- 5. RPC public.validar_abono
CREATE OR REPLACE FUNCTION public.validar_abono(
  p_abono_id UUID,
  p_cuenta_bancaria_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_usuario_id UUID;
  v_usuario_nombre TEXT;
  v_es_autorizado BOOLEAN;
  v_abono RECORD;
  v_cuenta RECORD;
  v_op RECORD;
  v_mov_id UUID;
  v_total_validado NUMERIC;
  v_pagos_json JSONB;
BEGIN
  v_usuario_id := public.current_usuario_id();
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado o inactivo' USING ERRCODE = '42501';
  END IF;

  SELECT nombre INTO v_usuario_nombre FROM public.usuarios WHERE id = v_usuario_id;
  v_es_autorizado := public.has_role(VARIADIC ARRAY['admin'::text, 'finanzas'::text]);
  IF NOT v_es_autorizado THEN
    RAISE EXCEPTION 'Solo administradores o encargados de finanzas pueden validar abonos' USING ERRCODE = '42501';
  END IF;

  -- Obtener abono bloqueándolo para concurrencia
  SELECT * INTO v_abono FROM public.abonos WHERE id = p_abono_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Abono no encontrado';
  END IF;

  IF v_abono.estado = 'validado' THEN
    RAISE EXCEPTION 'El abono ya se encuentra validado';
  END IF;

  -- Obtener cuenta bancaria activa
  SELECT c.*, e.razon_social AS empresa_nombre 
  INTO v_cuenta 
  FROM public.cuentas_bancarias c
  LEFT JOIN public.empresas e ON c.empresa_id = e.id
  WHERE c.id = p_cuenta_bancaria_id AND c.activo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta bancaria no encontrada o inactiva';
  END IF;

  -- Obtener oportunidad
  SELECT * INTO v_op FROM public.oportunidades WHERE id = v_abono.oportunidad_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oportunidad de venta no encontrada';
  END IF;

  -- Insertar movimiento de ingreso en caja
  INSERT INTO public.caja_movimientos (
    tipo,
    monto,
    categoria,
    descripcion,
    cuenta_bancaria_id,
    oportunidad_id,
    usuario_id,
    fecha
  ) VALUES (
    'ingreso',
    v_abono.monto,
    'Abono Venta',
    'Abono ' || coalesce(v_op.codigo, 'NV') || ' (' || coalesce(v_op.titulo, 'Venta') || ') - ' || coalesce(v_cuenta.alias, v_cuenta.banco),
    p_cuenta_bancaria_id,
    v_op.id,
    v_usuario_id,
    now()
  ) RETURNING id INTO v_mov_id;

  -- Actualizar el registro del abono
  UPDATE public.abonos SET
    estado = 'validado',
    motivo_rechazo = NULL,
    cuenta_bancaria_id = p_cuenta_bancaria_id,
    caja_movimiento_id = v_mov_id,
    validado_por_id = v_usuario_id,
    validado_por_nombre = v_usuario_nombre,
    validado_at = now(),
    updated_at = now()
  WHERE id = p_abono_id;

  -- Recalcular monto abonado acumulado validado
  SELECT coalesce(SUM(monto), 0) INTO v_total_validado
  FROM public.abonos
  WHERE oportunidad_id = v_op.id AND estado = 'validado';

  -- Snapshot de comprobantes para retrocompatibilidad
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'monto', a.monto,
      'fecha', to_char(a.fecha AT TIME ZONE 'America/Santiago', 'DD-MM-YYYY HH24:MI'),
      'fecha_iso', a.fecha,
      'nota', a.nota,
      'estado', a.estado,
      'cuenta_bancaria_id', a.cuenta_bancaria_id,
      'banco_alias', v_cuenta.alias,
      'comprobante_nombre', a.comprobante_nombre,
      'comprobante_url', a.comprobante_url,
      'creado_por', a.creado_por_nombre,
      'validado_por', a.validado_por_nombre,
      'validado_at', a.validado_at
    ) ORDER BY a.fecha ASC
  ), '[]'::jsonb)
  INTO v_pagos_json
  FROM public.abonos a
  WHERE a.oportunidad_id = v_op.id;

  -- Actualizar la oportunidad
  UPDATE public.oportunidades SET
    monto_abonado = v_total_validado,
    comprobantes_pago = v_pagos_json
  WHERE id = v_op.id;

  -- Registrar actividad en la oportunidad
  INSERT INTO public.actividades_op (
    oportunidad_id,
    usuario_id,
    usuario_nombre,
    tipo,
    contenido
  ) VALUES (
    v_op.id,
    v_usuario_id,
    v_usuario_nombre,
    'abono',
    'Abono de $' || v_abono.monto::text || ' VALIDADO por ' || v_usuario_nombre || ' e ingresado a ' || v_cuenta.alias || '. Total validado: $' || v_total_validado::text
  );

  -- Notificar al usuario creador si es distinto
  IF v_abono.creado_por_id IS NOT NULL AND v_abono.creado_por_id <> v_usuario_id THEN
    INSERT INTO public.notificaciones (
      usuario_id,
      mensaje,
      tipo,
      leido,
      entidad_relacionada,
      fecha,
      link_url
    ) VALUES (
      v_abono.creado_por_id,
      'Tu abono de $' || v_abono.monto::text || ' para ' || coalesce(v_op.codigo, 'la venta') || ' fue validado en Caja (' || v_cuenta.alias || ').',
      'info',
      false,
      'abono',
      now(),
      '/ventas'
    );
  END IF;

  RETURN jsonb_build_object(
    'abono_id', p_abono_id,
    'estado', 'validado',
    'caja_movimiento_id', v_mov_id,
    'monto_abonado', v_total_validado,
    'cuenta_bancaria_alias', v_cuenta.alias
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_abono(UUID, UUID) TO authenticated;

-- 6. RPC public.rechazar_abono
CREATE OR REPLACE FUNCTION public.rechazar_abono(
  p_abono_id UUID,
  p_motivo TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_usuario_id UUID;
  v_usuario_nombre TEXT;
  v_es_autorizado BOOLEAN;
  v_abono RECORD;
  v_op RECORD;
  v_total_validado NUMERIC;
  v_pagos_json JSONB;
BEGIN
  v_usuario_id := public.current_usuario_id();
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado o inactivo' USING ERRCODE = '42501';
  END IF;

  SELECT nombre INTO v_usuario_nombre FROM public.usuarios WHERE id = v_usuario_id;
  v_es_autorizado := public.has_role(VARIADIC ARRAY['admin'::text, 'finanzas'::text]);
  IF NOT v_es_autorizado THEN
    RAISE EXCEPTION 'Solo administradores o encargados de finanzas pueden rechazar abonos' USING ERRCODE = '42501';
  END IF;

  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Debes indicar el motivo del rechazo del comprobante';
  END IF;

  SELECT * INTO v_abono FROM public.abonos WHERE id = p_abono_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Abono no encontrado';
  END IF;

  -- Si tenía movimiento en caja previo, eliminarlo
  IF v_abono.caja_movimiento_id IS NOT NULL THEN
    DELETE FROM public.caja_movimientos WHERE id = v_abono.caja_movimiento_id;
  END IF;

  -- Obtener oportunidad
  SELECT * INTO v_op FROM public.oportunidades WHERE id = v_abono.oportunidad_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oportunidad de venta no encontrada';
  END IF;

  -- Actualizar el abono a rechazado
  UPDATE public.abonos SET
    estado = 'rechazado',
    motivo_rechazo = trim(p_motivo),
    caja_movimiento_id = NULL,
    cuenta_bancaria_id = NULL,
    validado_por_id = v_usuario_id,
    validado_por_nombre = v_usuario_nombre,
    validado_at = now(),
    updated_at = now()
  WHERE id = p_abono_id;

  -- Recalcular monto validado
  SELECT coalesce(SUM(monto), 0) INTO v_total_validado
  FROM public.abonos
  WHERE oportunidad_id = v_op.id AND estado = 'validado';

  -- Snapshot de comprobantes para retrocompatibilidad
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'monto', a.monto,
      'fecha', to_char(a.fecha AT TIME ZONE 'America/Santiago', 'DD-MM-YYYY HH24:MI'),
      'fecha_iso', a.fecha,
      'nota', a.nota,
      'estado', a.estado,
      'motivo_rechazo', a.motivo_rechazo,
      'comprobante_nombre', a.comprobante_nombre,
      'comprobante_url', a.comprobante_url,
      'creado_por', a.creado_por_nombre,
      'validado_por', a.validado_por_nombre,
      'validado_at', a.validado_at
    ) ORDER BY a.fecha ASC
  ), '[]'::jsonb)
  INTO v_pagos_json
  FROM public.abonos a
  WHERE a.oportunidad_id = v_op.id;

  -- Actualizar oportunidad
  UPDATE public.oportunidades SET
    monto_abonado = v_total_validado,
    comprobantes_pago = v_pagos_json
  WHERE id = v_op.id;

  -- Registrar actividad
  INSERT INTO public.actividades_op (
    oportunidad_id,
    usuario_id,
    usuario_nombre,
    tipo,
    contenido
  ) VALUES (
    v_op.id,
    v_usuario_id,
    v_usuario_nombre,
    'abono',
    'Abono de $' || v_abono.monto::text || ' RECHAZADO por ' || v_usuario_nombre || '. Motivo: ' || trim(p_motivo)
  );

  -- Notificar a quien subió el abono
  IF v_abono.creado_por_id IS NOT NULL THEN
    INSERT INTO public.notificaciones (
      usuario_id,
      mensaje,
      tipo,
      leido,
      entidad_relacionada,
      fecha,
      link_url
    ) VALUES (
      v_abono.creado_por_id,
      'El comprobante de abono ($' || v_abono.monto::text || ') para ' || coalesce(v_op.codigo, 'la venta') || ' fue rechazado en Caja: ' || trim(p_motivo),
      'alerta',
      false,
      'abono',
      now(),
      '/ventas'
    );
  END IF;

  RETURN jsonb_build_object(
    'abono_id', p_abono_id,
    'estado', 'rechazado',
    'motivo_rechazo', trim(p_motivo),
    'monto_abonado', v_total_validado
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rechazar_abono(UUID, TEXT) TO authenticated;

-- 7. Actualizar public.registrar_abono_atomico
CREATE OR REPLACE FUNCTION public.registrar_abono_atomico(
  p_oportunidad_id UUID,
  p_pago JSONB,
  p_operacion TEXT DEFAULT 'crear'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_usuario_id UUID;
  v_usuario_nombre TEXT;
  v_op RECORD;
  v_operacion TEXT := lower(trim(coalesce(p_operacion, '')));
  v_id UUID;
  v_monto NUMERIC;
  v_path TEXT;
  v_nombre TEXT;
  v_nota TEXT;
  v_total_validado NUMERIC;
  v_pagos_json JSONB;
BEGIN
  IF v_operacion NOT IN ('crear', 'editar', 'eliminar') THEN
    RAISE EXCEPTION 'Operación no soportada (crear, editar, eliminar)';
  END IF;

  v_usuario_id := public.current_usuario_id();
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado o inactivo' USING ERRCODE = '42501';
  END IF;

  SELECT nombre INTO v_usuario_nombre FROM public.usuarios
  WHERE id = v_usuario_id AND activo = true;

  SELECT * INTO v_op FROM public.oportunidades
  WHERE id = p_oportunidad_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oportunidad no encontrada';
  END IF;

  IF v_operacion = 'crear' THEN
    v_id := coalesce(nullif(trim(p_pago->>'id'), '')::uuid, gen_random_uuid());
    v_monto := (p_pago->>'monto')::numeric;
    IF v_monto IS NULL OR v_monto <= 0 THEN
      RAISE EXCEPTION 'El monto debe ser un valor positivo en CLP';
    END IF;

    v_path := nullif(trim(p_pago->>'comprobante_url'), '');
    v_nombre := nullif(trim(p_pago->>'comprobante_nombre'), '');
    IF v_path IS NULL OR v_nombre IS NULL THEN
      RAISE EXCEPTION 'Se requiere adjuntar el comprobante de pago';
    END IF;

    v_nota := coalesce(nullif(trim(p_pago->>'nota'), ''), 'Abono registrado');

    -- Insertar en tabla abonos con estado 'pendiente'
    INSERT INTO public.abonos (
      id,
      oportunidad_id,
      monto,
      fecha,
      nota,
      comprobante_url,
      comprobante_nombre,
      estado,
      creado_por_id,
      creado_por_nombre,
      created_at
    ) VALUES (
      v_id,
      p_oportunidad_id,
      v_monto,
      now(),
      v_nota,
      v_path,
      v_nombre,
      'pendiente',
      v_usuario_id,
      v_usuario_nombre,
      now()
    );

    -- Registrar actividad
    INSERT INTO public.actividades_op (
      oportunidad_id, usuario_id, usuario_nombre, tipo, contenido
    ) VALUES (
      p_oportunidad_id, v_usuario_id, v_usuario_nombre, 'abono',
      'Nuevo abono registrado por $' || v_monto::text || ' (pendiente de validación en Caja)'
    );

    -- Notificar a finanzas y administradores
    INSERT INTO public.notificaciones (
      usuario_id,
      mensaje,
      tipo,
      leido,
      entidad_relacionada,
      fecha,
      link_url
    )
    SELECT
      u.id,
      'Nuevo abono de $' || v_monto::text || ' en ' || coalesce(v_op.codigo, 'NV') || ' pendiente de validar en Caja',
      'info',
      false,
      'abono',
      now(),
      '/caja'
    FROM public.usuarios u
    WHERE u.activo = true AND u.rol IN ('admin', 'finanzas') AND u.id <> v_usuario_id;

  ELSIF v_operacion = 'editar' THEN
    v_id := (p_pago->>'id')::uuid;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Identificador de abono requerido'; END IF;

    v_monto := (p_pago->>'monto')::numeric;
    IF v_monto IS NULL OR v_monto <= 0 THEN
      RAISE EXCEPTION 'El monto debe ser positivo';
    END IF;

    v_nota := coalesce(nullif(trim(p_pago->>'nota'), ''), 'Abono editado');

    UPDATE public.abonos SET
      monto = v_monto,
      nota = v_nota,
      updated_at = now()
    WHERE id = v_id AND oportunidad_id = p_oportunidad_id;

    INSERT INTO public.actividades_op (
      oportunidad_id, usuario_id, usuario_nombre, tipo, contenido
    ) VALUES (
      p_oportunidad_id, v_usuario_id, v_usuario_nombre, 'abono',
      'Abono editado a $' || v_monto::text
    );

  ELSE -- 'eliminar'
    v_id := (p_pago->>'id')::uuid;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Identificador de abono requerido'; END IF;

    UPDATE public.abonos SET
      estado = 'anulado',
      updated_at = now()
    WHERE id = v_id AND oportunidad_id = p_oportunidad_id;

    INSERT INTO public.actividades_op (
      oportunidad_id, usuario_id, usuario_nombre, tipo, contenido
    ) VALUES (
      p_oportunidad_id, v_usuario_id, v_usuario_nombre, 'abono',
      'Abono anulado por ' || v_usuario_nombre
    );
  END IF;

  -- Recalcular monto total validado
  SELECT coalesce(SUM(monto), 0) INTO v_total_validado
  FROM public.abonos
  WHERE oportunidad_id = p_oportunidad_id AND estado = 'validado';

  -- Snapshot de comprobantes
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'monto', a.monto,
      'fecha', to_char(a.fecha AT TIME ZONE 'America/Santiago', 'DD-MM-YYYY HH24:MI'),
      'fecha_iso', a.fecha,
      'nota', a.nota,
      'estado', a.estado,
      'motivo_rechazo', a.motivo_rechazo,
      'cuenta_bancaria_id', a.cuenta_bancaria_id,
      'comprobante_nombre', a.comprobante_nombre,
      'comprobante_url', a.comprobante_url,
      'creado_por', a.creado_por_nombre,
      'validado_por', a.validado_por_nombre,
      'validado_at', a.validado_at
    ) ORDER BY a.fecha ASC
  ), '[]'::jsonb)
  INTO v_pagos_json
  FROM public.abonos a
  WHERE a.oportunidad_id = p_oportunidad_id AND a.estado <> 'anulado';

  -- Actualizar la oportunidad
  UPDATE public.oportunidades SET
    monto_abonado = v_total_validado,
    comprobantes_pago = v_pagos_json
  WHERE id = p_oportunidad_id;

  RETURN jsonb_build_object(
    'comprobantes_pago', v_pagos_json,
    'monto_abonado', v_total_validado
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_abono_atomico(UUID, JSONB, TEXT) TO authenticated;
