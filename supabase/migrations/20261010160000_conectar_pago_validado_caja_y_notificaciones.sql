-- ==============================================================================
-- Migración: Conectar Pago Validado con Caja, Notificaciones Bidireccionales
-- y Normalización de Razón Social Inmobiliaria
-- Fecha: 2026-10-10
--
-- 1. Normaliza razón social de la inmobiliaria a 'Sociedad Inmobiliaria Hormiglass SpA'
-- 2. Conecta validar_abono con auto-transición de la oportunidad a 'pagada'
-- 3. Notificaciones bidireccionales:
--    - Ventas -> Finanzas al crear abono con enlace profundo a Caja (?tab=validacion&abono=ID)
--    - Finanzas -> Ventas (creador y comercial asignado) al validar o rechazar abono
-- 4. Reversión segura de 'pagada' a 'nueva' en rechazar_abono si no quedan abonos validados
-- ==============================================================================

-- 1. Normalización de razón social en catálogo de empresas
UPDATE public.empresas
SET razon_social = 'Sociedad Inmobiliaria Hormiglass SpA',
    updated_at = now()
WHERE slug = 'inmobiliaria';

-- 2. RPC validar_abono con auto-transición a 'pagada' y notificaciones bidireccionales
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
  v_nuevo_estado TEXT;
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

  -- Determinar si avanza automáticamente a 'pagada' ("Pago Validado")
  v_nuevo_estado := v_op.estado_pipeline;
  IF v_op.estado_pipeline = 'nueva' THEN
    v_nuevo_estado := 'pagada';
    UPDATE public.oportunidades SET
      monto_abonado = v_total_validado,
      comprobantes_pago = v_pagos_json,
      estado_pipeline = 'pagada',
      updated_at = now()
    WHERE id = v_op.id;

    -- Registrar actividad de cambio de etapa
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
      'etapa',
      'Oportunidad avanzada automáticamente a "Pago Validado" tras conciliación del abono en Caja.'
    );
  ELSE
    UPDATE public.oportunidades SET
      monto_abonado = v_total_validado,
      comprobantes_pago = v_pagos_json,
      updated_at = now()
    WHERE id = v_op.id;
  END IF;

  -- Registrar actividad del abono en la oportunidad
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
    'Abono de $' || v_abono.monto::text || ' VALIDADO por ' || v_usuario_nombre || ' e ingresado a ' || coalesce(v_cuenta.alias, v_cuenta.banco) || '. Total validado: $' || v_total_validado::text
  );

  -- Notificar bidireccionalmente a los comerciales involucrados (quien subió el comprobante y el asignado)
  INSERT INTO public.notificaciones (
    usuario_id,
    mensaje,
    tipo,
    leido,
    entidad_relacionada,
    fecha,
    link_url
  )
  SELECT DISTINCT
    dest.uid,
    'Abono de $' || v_abono.monto::text || ' para ' || coalesce(v_op.codigo, 'la venta') || ' fue VALIDADO en Caja (' || coalesce(v_cuenta.alias, v_cuenta.banco) || '). Etapa: Pago Validado.',
    'info',
    false,
    'abono',
    now(),
    '/ventas/' || v_op.id::text
  FROM (
    SELECT v_abono.creado_por_id AS uid
    UNION
    SELECT v_op.asignado_a AS uid
  ) dest
  JOIN public.usuarios u ON u.id = dest.uid
  WHERE dest.uid IS NOT NULL AND dest.uid <> v_usuario_id AND u.activo = true;

  RETURN jsonb_build_object(
    'abono_id', p_abono_id,
    'estado', 'validado',
    'caja_movimiento_id', v_mov_id,
    'monto_abonado', v_total_validado,
    'cuenta_bancaria_alias', v_cuenta.alias,
    'estado_pipeline', v_nuevo_estado
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_abono(UUID, UUID) TO authenticated;

-- 3. RPC rechazar_abono con reversión a 'nueva' si no quedan abonos validados
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
  v_nuevo_estado TEXT;
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

  -- Si la oportunidad estaba en 'pagada' y no le quedan otros abonos validados, revertir a 'nueva'
  v_nuevo_estado := v_op.estado_pipeline;
  IF v_op.estado_pipeline = 'pagada' AND v_total_validado = 0 THEN
    v_nuevo_estado := 'nueva';
    UPDATE public.oportunidades SET
      monto_abonado = 0,
      comprobantes_pago = v_pagos_json,
      estado_pipeline = 'nueva',
      updated_at = now()
    WHERE id = v_op.id;

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
      'etapa',
      'Oportunidad devuelta a "Nueva Oportunidad" al ser rechazado su abono sin otros pagos validados.'
    );
  ELSE
    UPDATE public.oportunidades SET
      monto_abonado = v_total_validado,
      comprobantes_pago = v_pagos_json,
      updated_at = now()
    WHERE id = v_op.id;
  END IF;

  -- Registrar actividad del rechazo
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

  -- Notificar a quien subió el abono y al comercial asignado
  INSERT INTO public.notificaciones (
    usuario_id,
    mensaje,
    tipo,
    leido,
    entidad_relacionada,
    fecha,
    link_url
  )
  SELECT DISTINCT
    dest.uid,
    'El comprobante de abono ($' || v_abono.monto::text || ') para ' || coalesce(v_op.codigo, 'la venta') || ' fue RECHAZADO en Caja: ' || trim(p_motivo),
    'warning',
    false,
    'abono',
    now(),
    '/ventas/' || v_op.id::text
  FROM (
    SELECT v_abono.creado_por_id AS uid
    UNION
    SELECT v_op.asignado_a AS uid
  ) dest
  JOIN public.usuarios u ON u.id = dest.uid
  WHERE dest.uid IS NOT NULL AND dest.uid <> v_usuario_id AND u.activo = true;

  RETURN jsonb_build_object(
    'abono_id', p_abono_id,
    'estado', 'rechazado',
    'monto_abonado', v_total_validado,
    'estado_pipeline', v_nuevo_estado
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rechazar_abono(UUID, TEXT) TO authenticated;

-- 4. RPC registrar_abono_atomico con enlace profundo a Caja en la notificación
CREATE OR REPLACE FUNCTION public.registrar_abono_atomico(
  p_oportunidad_id UUID,
  p_pago JSONB,
  p_operacion TEXT DEFAULT 'crear'::text
)
RETURNS JSONB
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

    INSERT INTO public.actividades_op (
      oportunidad_id, usuario_id, usuario_nombre, tipo, contenido
    ) VALUES (
      p_oportunidad_id, v_usuario_id, v_usuario_nombre, 'abono',
      'Nuevo abono registrado por $' || v_monto::text || ' (pendiente de validación en Caja)'
    );

    -- Notificar a finanzas y administradores con enlace profundo
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
      'Nuevo abono de $' || v_monto::text || ' en ' || coalesce(v_op.codigo, 'NV') || ' (' || coalesce(v_op.titulo, 'Venta') || ') pendiente de validar en Caja',
      'info',
      false,
      'abono',
      now(),
      '/caja?tab=validacion&abono=' || v_id::text
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

  SELECT coalesce(SUM(monto), 0) INTO v_total_validado
  FROM public.abonos
  WHERE oportunidad_id = p_oportunidad_id AND estado = 'validado';

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
