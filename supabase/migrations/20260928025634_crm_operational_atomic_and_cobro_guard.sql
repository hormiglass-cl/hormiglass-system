-- Estado de entrega en lote para las vistas de pipeline y métricas.
CREATE FUNCTION public.estado_entrega_acreditada(p_ventas uuid[])
RETURNS TABLE (venta_id uuid, acreditada boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Usuario activo requerido' USING ERRCODE = '42501';
  END IF;
  IF p_ventas IS NULL OR cardinality(p_ventas) > 500 THEN
    RAISE EXCEPTION 'Lista de ventas inválida';
  END IF;
  RETURN QUERY
    SELECT DISTINCT o.id, public.entrega_acreditada(o.id)
    FROM unnest(p_ventas) AS requested(id)
    JOIN public.oportunidades o ON o.id = requested.id;
END;
$$;
REVOKE ALL ON FUNCTION public.estado_entrega_acreditada(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estado_entrega_acreditada(uuid[]) TO authenticated;

-- Resolver excepción y actualizar la confirmación manual en la misma transacción.
CREATE FUNCTION public.resolver_excepcion_operativa(
  p_excepcion_id uuid,
  p_estado text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_excepcion public.operacion_excepciones%ROWTYPE;
  v_actor uuid;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'Solo administración puede resolver excepciones' USING ERRCODE = '42501';
  END IF;
  IF p_estado NOT IN ('aprobada', 'rechazada') OR p_estado IS NULL THEN
    RAISE EXCEPTION 'Estado de excepción inválido';
  END IF;
  v_actor := public.current_usuario_id();
  SELECT * INTO v_excepcion FROM public.operacion_excepciones
  WHERE id = p_excepcion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Excepción no encontrada'; END IF;
  IF v_excepcion.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La excepción ya fue resuelta';
  END IF;
  UPDATE public.operacion_excepciones SET
    estado = p_estado, resuelto_por = v_actor, resuelto_at = now()
  WHERE id = p_excepcion_id;
  IF v_excepcion.tipo = 'entrega_manual' AND p_estado = 'aprobada' THEN
    UPDATE public.oportunidades SET
      entrega_manual_confirmada = true,
      entrega_manual_motivo = v_excepcion.motivo
    WHERE id = v_excepcion.oportunidad_id;
  END IF;
  RETURN jsonb_build_object(
    'id', p_excepcion_id, 'estado', p_estado,
    'oportunidad_id', v_excepcion.oportunidad_id,
    'entrega_manual_confirmada',
      (v_excepcion.tipo = 'entrega_manual' AND p_estado = 'aprobada')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.resolver_excepcion_operativa(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_excepcion_operativa(uuid, text) TO authenticated;

-- Si existe fecha de compromiso, el caso y su evento se crean juntos.
CREATE FUNCTION public.crear_postventa_con_evento(
  p_caso jsonb,
  p_evento jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_op_id uuid;
  v_rama text;
  v_caso_id uuid;
  v_evento_id uuid;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_tipo text;
  v_descripcion text;
  v_usuario_id uuid;
BEGIN
  IF NOT public.has_role('user', 'mano_obra') THEN
    RAISE EXCEPTION 'No autorizado para registrar postventa' USING ERRCODE = '42501';
  END IF;
  IF p_caso IS NULL OR jsonb_typeof(p_caso) <> 'object'
     OR (p_evento IS NOT NULL AND jsonb_typeof(p_evento) <> 'object') THEN
    RAISE EXCEPTION 'Caso o evento inválido';
  END IF;
  v_usuario_id := public.current_usuario_id();
  v_op_id := (p_caso->>'oportunidad_id')::uuid;
  SELECT rama_destino INTO v_rama FROM public.oportunidades
  WHERE id = v_op_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oportunidad no encontrada'; END IF;
  v_tipo := nullif(trim(p_caso->>'tipo'), '');
  v_descripcion := nullif(trim(p_caso->>'descripcion'), '');
  IF v_tipo NOT IN ('faltante','defecto','cantidad_adicional','otro')
     OR v_descripcion IS NULL THEN
    RAISE EXCEPTION 'Tipo o descripción de postventa inválidos';
  END IF;
  IF v_tipo = 'cantidad_adicional' AND
     (nullif(p_caso->>'cantidad_adicional', '')::numeric IS NULL OR
      nullif(p_caso->>'cantidad_adicional', '')::numeric <= 0 OR
      nullif(trim(p_caso->>'autorizacion_cliente'), '') IS NULL) THEN
    RAISE EXCEPTION 'La cantidad adicional requiere cantidad positiva y autorización';
  END IF;

  IF p_evento IS NOT NULL THEN
    -- La UI envía hora local de Chile sin sufijo UTC.
    v_inicio := (p_evento->>'fecha_inicio')::timestamp AT TIME ZONE 'America/Santiago';
    v_fin := (p_evento->>'fecha_fin')::timestamp AT TIME ZONE 'America/Santiago';
    IF v_inicio IS NULL OR v_fin IS NULL OR v_fin <= v_inicio
       OR nullif(trim(p_evento->>'titulo'), '') IS NULL THEN
      RAISE EXCEPTION 'Fecha y título del evento requeridos';
    END IF;
    INSERT INTO public.eventos_produccion_logistica (
      oportunidad_id, tipo_evento, titulo, fecha_evento, hora_evento,
      responsable_id, estado, observaciones, registrado_por, contexto,
      fecha_inicio, fecha_fin, recurso_vehiculo
    ) VALUES (
      v_op_id, 'postventa', trim(p_evento->>'titulo'),
      (v_inicio AT TIME ZONE 'America/Santiago')::date,
      nullif(p_evento->>'hora_evento', ''),
      nullif(p_evento->>'responsable_id', '')::uuid,
      'por_hacer', v_descripcion, v_usuario_id,
      CASE WHEN v_rama = 'reventa' THEN 'reventa_logistica'
           ELSE 'produccion_logistica' END,
      v_inicio, v_fin, nullif(p_evento->>'recurso_vehiculo', '')
    ) RETURNING id INTO v_evento_id;
  END IF;

  INSERT INTO public.postventa_casos (
    oportunidad_id, tipo, estado, descripcion, cantidad_adicional,
    autorizacion_cliente, fecha_compromiso, responsable_id, evento_id
  ) VALUES (
    v_op_id, v_tipo,
    CASE WHEN v_evento_id IS NULL THEN 'abierto' ELSE 'programado' END,
    v_descripcion, nullif(p_caso->>'cantidad_adicional', '')::numeric,
    nullif(p_caso->>'autorizacion_cliente', ''),
    coalesce(nullif(p_caso->>'fecha_compromiso', '')::date,
             (v_inicio AT TIME ZONE 'America/Santiago')::date),
    nullif(p_caso->>'responsable_id', '')::uuid,
    v_evento_id
  ) RETURNING id INTO v_caso_id;
  RETURN v_caso_id;
END;
$$;
REVOKE ALL ON FUNCTION public.crear_postventa_con_evento(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_postventa_con_evento(jsonb, jsonb) TO authenticated;

-- Cobranza automática solo de entregas acreditadas y por saldo real registrado.
CREATE OR REPLACE FUNCTION public.generar_avisos_cobro(
  p_hoy date DEFAULT (now() AT TIME ZONE 'America/Santiago')::date
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  sale record;
  recipient uuid;
  cycle_number integer;
  total_amount numeric;
  paid_amount numeric;
  inserted_count integer := 0;
BEGIN
  FOR sale IN
    SELECT o.id, o.codigo, o.asignado_a, o.fecha_vencimiento_cobro,
           o.monto_abonado, c.monto_total
    FROM public.oportunidades o
    JOIN public.cotizaciones c ON c.id = o.cotizacion_actual_id
    WHERE o.fecha_vencimiento_cobro <= p_hoy
      AND c.estado IN ('enviada', 'aprobada')
      AND public.entrega_acreditada(o.id)
  LOOP
    paid_amount := greatest(coalesce(sale.monto_abonado, 0), 0);
    total_amount := coalesce(sale.monto_total, 0);
    IF total_amount <= paid_amount THEN CONTINUE; END IF;
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
