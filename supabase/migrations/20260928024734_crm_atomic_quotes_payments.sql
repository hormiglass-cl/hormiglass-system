-- Guardar cabecera e ítems en una sola transacción, con importes calculados en DB.
CREATE OR REPLACE FUNCTION public.guardar_cotizacion_atomica(
  p_cotizacion jsonb,
  p_items jsonb,
  p_cotizacion_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_cot_id uuid;
  v_cliente_id uuid;
  v_op_id uuid;
  v_op_cliente_id uuid;
  v_version integer;
  v_numero text;
  v_item jsonb;
  v_producto text;
  v_catalogo uuid;
  v_cantidad numeric;
  v_precio numeric;
  v_descuento_pct numeric;
  v_base numeric;
  v_item_total numeric;
  v_subtotal numeric := 0;
  v_descuento numeric := 0;
  v_iva numeric;
  v_total numeric;
  v_usuario_id uuid;
  v_actual public.cotizaciones%ROWTYPE;
BEGIN
  IF NOT public.has_role('user') THEN
    RAISE EXCEPTION 'No autorizado para guardar cotizaciones' USING ERRCODE = '42501';
  END IF;
  IF p_cotizacion IS NULL OR jsonb_typeof(p_cotizacion) <> 'object'
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Cotización o ítems inválidos';
  END IF;

  v_usuario_id := public.current_usuario_id();
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuario activo requerido' USING ERRCODE = '42501';
  END IF;
  v_numero := nullif(trim(p_cotizacion->>'numero_cotizacion'), '');
  IF v_numero IS NULL THEN
    RAISE EXCEPTION 'Número de cotización requerido';
  END IF;

  IF p_cotizacion_id IS NOT NULL THEN
    SELECT * INTO v_actual FROM public.cotizaciones
    WHERE id = p_cotizacion_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
    IF v_actual.estado <> 'borrador' THEN
      RAISE EXCEPTION 'Solo puede editarse una cotización en borrador';
    END IF;
    v_cot_id := p_cotizacion_id;
    v_cliente_id := v_actual.cliente_id;
    v_op_id := v_actual.oportunidad_id;
    v_version := v_actual.version;
    IF (p_cotizacion ? 'cliente_id' AND (p_cotizacion->>'cliente_id')::uuid IS DISTINCT FROM v_cliente_id)
       OR (p_cotizacion ? 'oportunidad_id' AND (p_cotizacion->>'oportunidad_id')::uuid IS DISTINCT FROM v_op_id)
       OR (p_cotizacion ? 'version' AND (p_cotizacion->>'version')::integer IS DISTINCT FROM v_version) THEN
      RAISE EXCEPTION 'No se puede reasignar cliente, oportunidad ni versión de un borrador';
    END IF;
  ELSE
    v_cliente_id := (p_cotizacion->>'cliente_id')::uuid;
    v_op_id := nullif(p_cotizacion->>'oportunidad_id', '')::uuid;
    v_version := coalesce((p_cotizacion->>'version')::integer, 1);
    IF v_cliente_id IS NULL OR v_version < 1 THEN
      RAISE EXCEPTION 'Cliente y versión válidos requeridos';
    END IF;
    IF v_op_id IS NOT NULL THEN
      SELECT cliente_id INTO v_op_cliente_id FROM public.oportunidades
      WHERE id = v_op_id FOR UPDATE;
      IF NOT FOUND OR v_op_cliente_id IS DISTINCT FROM v_cliente_id THEN
        RAISE EXCEPTION 'La oportunidad no corresponde al cliente';
      END IF;
      IF v_version <> (SELECT coalesce(max(version), 0) + 1
                       FROM public.cotizaciones WHERE oportunidad_id = v_op_id) THEN
        RAISE EXCEPTION 'La versión cambió; recargue la oportunidad';
      END IF;
    END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Ítem de cotización inválido';
    END IF;
    v_producto := nullif(trim(v_item->>'producto'), '');
    v_catalogo := nullif(v_item->>'producto_catalogo_id', '')::uuid;
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_precio := (v_item->>'precio_unitario')::numeric;
    v_descuento_pct := coalesce((v_item->>'descuento_porcentaje')::numeric, 0);
    IF v_producto IS NULL OR v_cantidad IS NULL OR v_cantidad <= 0
       OR v_precio IS NULL OR v_precio < 0
       OR v_descuento_pct NOT BETWEEN 0 AND 100
       OR v_cantidad::text IN ('NaN', 'Infinity', '-Infinity')
       OR v_precio::text IN ('NaN', 'Infinity', '-Infinity')
       OR v_descuento_pct::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Cantidad, precio o descuento inválidos';
    END IF;
    v_base := round(v_cantidad * v_precio);
    v_item_total := round(v_cantidad * v_precio * (1 - v_descuento_pct / 100));
    v_subtotal := v_subtotal + v_item_total;
    v_descuento := v_descuento + v_base - v_item_total;
  END LOOP;
  v_iva := round(v_subtotal * 0.19);
  v_total := v_subtotal + v_iva;

  IF p_cotizacion_id IS NULL THEN
    INSERT INTO public.cotizaciones (
      numero_cotizacion, cliente_id, usuario_id, oportunidad_id, version, estado,
      referencia_cliente, fecha_validez, subtotal, descuento, iva_porcentaje,
      monto_iva, monto_total, plazo_entrega, fecha_inicio_compromiso,
      fecha_limite_compromiso, condiciones_pago, observaciones, comentario_publico
    ) VALUES (
      v_numero, v_cliente_id, v_usuario_id, v_op_id, v_version, 'borrador',
      nullif(p_cotizacion->>'referencia_cliente', ''),
      nullif(p_cotizacion->>'fecha_validez', '')::date,
      v_subtotal, v_descuento, 19, v_iva, v_total,
      nullif(p_cotizacion->>'plazo_entrega', ''),
      nullif(p_cotizacion->>'fecha_inicio_compromiso', '')::date,
      nullif(p_cotizacion->>'fecha_limite_compromiso', '')::date,
      p_cotizacion->>'condiciones_pago', p_cotizacion->>'observaciones',
      p_cotizacion->>'comentario_publico'
    ) RETURNING id INTO v_cot_id;
  ELSE
    UPDATE public.cotizaciones SET
      numero_cotizacion = v_numero,
      referencia_cliente = nullif(p_cotizacion->>'referencia_cliente', ''),
      fecha_validez = nullif(p_cotizacion->>'fecha_validez', '')::date,
      subtotal = v_subtotal, descuento = v_descuento, iva_porcentaje = 19,
      monto_iva = v_iva, monto_total = v_total,
      plazo_entrega = nullif(p_cotizacion->>'plazo_entrega', ''),
      fecha_inicio_compromiso = nullif(p_cotizacion->>'fecha_inicio_compromiso', '')::date,
      fecha_limite_compromiso = nullif(p_cotizacion->>'fecha_limite_compromiso', '')::date,
      condiciones_pago = p_cotizacion->>'condiciones_pago',
      observaciones = p_cotizacion->>'observaciones',
      comentario_publico = p_cotizacion->>'comentario_publico'
    WHERE id = v_cot_id;
    DELETE FROM public.cotizacion_items WHERE cotizacion_id = v_cot_id;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_catalogo := nullif(v_item->>'producto_catalogo_id', '')::uuid;
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_precio := (v_item->>'precio_unitario')::numeric;
    v_descuento_pct := coalesce((v_item->>'descuento_porcentaje')::numeric, 0);
    INSERT INTO public.cotizacion_items (
      cotizacion_id, producto, producto_catalogo_id, cantidad, precio_unitario,
      descuento_porcentaje, total_item
    ) VALUES (
      v_cot_id, trim(v_item->>'producto'), v_catalogo, v_cantidad, v_precio,
      v_descuento_pct, round(v_cantidad * v_precio * (1 - v_descuento_pct / 100))
    );
  END LOOP;
  RETURN v_cot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_cotizacion_atomica(jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_cotizacion_atomica(jsonb, jsonb, uuid) TO authenticated;

-- Un borrador no sustituye la cotización comercial vigente.
CREATE OR REPLACE FUNCTION public.sync_cotizacion_actual() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  affected_op uuid;
  previous_op uuid;
  next_op uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN previous_op := OLD.oportunidad_id; END IF;
  IF TG_OP <> 'DELETE' THEN next_op := NEW.oportunidad_id; END IF;
  FOR affected_op IN
    SELECT DISTINCT id FROM (
      SELECT previous_op AS id UNION ALL SELECT next_op AS id
    ) AS opportunities WHERE id IS NOT NULL
  LOOP
    UPDATE public.oportunidades AS op
    SET cotizacion_actual_id = (
      SELECT c.id FROM public.cotizaciones AS c
      WHERE c.oportunidad_id = affected_op
        AND c.estado IN ('enviada', 'aprobada')
      ORDER BY c.version DESC NULLS LAST, c.created_at DESC, c.id DESC
      LIMIT 1
    ) WHERE op.id = affected_op;
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_cotizacion_actual_after_change ON public.cotizaciones;
CREATE TRIGGER sync_cotizacion_actual_after_change
  AFTER INSERT OR UPDATE OF oportunidad_id, version, estado OR DELETE
  ON public.cotizaciones FOR EACH ROW
  EXECUTE FUNCTION public.sync_cotizacion_actual();

-- El saldo histórico puede incluir abonos sin monto por comprobante. Se modifica
-- por delta bajo bloqueo de fila, sin recalcularlo desde el JSON incompleto.
CREATE OR REPLACE FUNCTION public.registrar_abono_atomico(
  p_oportunidad_id uuid,
  p_pago jsonb,
  p_operacion text DEFAULT 'crear'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_op public.oportunidades%ROWTYPE;
  v_pagos jsonb;
  v_pago jsonb;
  v_nuevo jsonb;
  v_id text;
  v_operacion text := lower(trim(p_operacion));
  v_indice integer := -1;
  v_indice_actual integer := 0;
  v_coincidencias integer := 0;
  v_monto_anterior numeric := 0;
  v_monto_nuevo numeric := 0;
  v_total numeric;
  v_usuario_id uuid;
  v_usuario_nombre text;
  v_path text;
  v_nombre text;
  v_nota text;
BEGIN
  IF NOT public.has_role('user') THEN
    RAISE EXCEPTION 'No autorizado para registrar abonos' USING ERRCODE = '42501';
  END IF;
  IF p_pago IS NULL OR jsonb_typeof(p_pago) <> 'object'
     OR v_operacion IS NULL
     OR v_operacion NOT IN ('crear', 'editar', 'eliminar') THEN
    RAISE EXCEPTION 'Operación o pago inválido';
  END IF;
  v_usuario_id := public.current_usuario_id();
  SELECT nombre INTO v_usuario_nombre FROM public.usuarios
  WHERE id = v_usuario_id AND activo = true;
  IF v_usuario_nombre IS NULL THEN
    RAISE EXCEPTION 'Usuario activo requerido' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_op FROM public.oportunidades
  WHERE id = p_oportunidad_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oportunidad no encontrada'; END IF;
  v_pagos := coalesce(v_op.comprobantes_pago, '[]'::jsonb);
  IF jsonb_typeof(v_pagos) <> 'array' THEN
    RAISE EXCEPTION 'Historial de comprobantes inválido';
  END IF;
  v_id := nullif(trim(p_pago->>'id'), '');
  IF v_operacion = 'crear' AND v_id IS NULL THEN
    v_id := gen_random_uuid()::text;
  END IF;
  IF v_id IS NULL OR length(v_id) > 100 THEN
    RAISE EXCEPTION 'Identificador de abono inválido';
  END IF;

  FOR v_pago IN SELECT value FROM jsonb_array_elements(v_pagos)
  LOOP
    IF v_pago->>'id' = v_id THEN
      v_coincidencias := v_coincidencias + 1;
      v_indice := v_indice_actual;
      IF v_pago->>'monto' IS NOT NULL THEN
        v_monto_anterior := (v_pago->>'monto')::numeric;
      END IF;
    END IF;
    v_indice_actual := v_indice_actual + 1;
  END LOOP;
  IF v_operacion = 'crear' AND v_coincidencias <> 0 THEN
    RAISE EXCEPTION 'Ya existe un abono con ese identificador';
  ELSIF v_operacion <> 'crear' AND
        (v_coincidencias <> 1 OR v_monto_anterior <= 0) THEN
    RAISE EXCEPTION 'Abono editable no encontrado o duplicado';
  END IF;

  IF v_operacion <> 'eliminar' THEN
    v_monto_nuevo := (p_pago->>'monto')::numeric;
    IF v_monto_nuevo IS NULL OR v_monto_nuevo <= 0
       OR v_monto_nuevo::text IN ('NaN', 'Infinity', '-Infinity')
       OR v_monto_nuevo <> trunc(v_monto_nuevo) THEN
      RAISE EXCEPTION 'El abono debe ser un monto positivo en CLP';
    END IF;
  END IF;
  v_total := coalesce(v_op.monto_abonado, 0)
             + v_monto_nuevo - v_monto_anterior;
  IF v_total < 0 THEN
    RAISE EXCEPTION 'El saldo abonado resultante no puede ser negativo';
  END IF;

  IF v_operacion = 'crear' THEN
    v_path := nullif(trim(p_pago->>'comprobante_url'), '');
    v_nombre := nullif(trim(p_pago->>'comprobante_nombre'), '');
    IF v_path IS NULL OR v_nombre IS NULL
       OR (v_path NOT LIKE ('abonos/' || p_oportunidad_id::text || '/%')
           AND v_path NOT LIKE ('comprobantes/' || p_oportunidad_id::text || '/%')) THEN
      RAISE EXCEPTION 'Se requiere un comprobante privado de esta oportunidad';
    END IF;
    v_nota := coalesce(nullif(trim(p_pago->>'nota'), ''), 'Abono registrado');
    v_nuevo := jsonb_build_object(
      'id', v_id, 'monto', v_monto_nuevo,
      'fecha_iso', now(),
      'fecha', to_char(now() AT TIME ZONE 'America/Santiago', 'DD-MM-YYYY HH24:MI'),
      'nota', v_nota, 'creado_por', v_usuario_nombre,
      'comprobante_nombre', v_nombre, 'comprobante_url', v_path
    );
    v_pagos := v_pagos || jsonb_build_array(v_nuevo);
  ELSIF v_operacion = 'editar' THEN
    v_nuevo := v_pagos->v_indice;
    v_nota := coalesce(nullif(trim(p_pago->>'nota'), ''),
                       v_nuevo->>'nota', 'Abono registrado');
    v_nuevo := v_nuevo || jsonb_build_object('monto', v_monto_nuevo, 'nota', v_nota);
    v_pagos := jsonb_set(v_pagos, ARRAY[v_indice::text], v_nuevo);
  ELSE
    v_pagos := v_pagos - v_indice;
  END IF;

  UPDATE public.oportunidades SET
    comprobantes_pago = v_pagos, monto_abonado = v_total
  WHERE id = p_oportunidad_id;

  INSERT INTO public.actividades_op (
    oportunidad_id, usuario_id, usuario_nombre, tipo, contenido
  ) VALUES (
    p_oportunidad_id, v_usuario_id, v_usuario_nombre, 'abono',
    CASE v_operacion
      WHEN 'crear' THEN 'Abono registrado por $' || v_monto_nuevo::text
      WHEN 'editar' THEN 'Abono editado de $' || v_monto_anterior::text ||
                         ' a $' || v_monto_nuevo::text
      ELSE 'Abono eliminado por $' || v_monto_anterior::text
    END || '. Total acumulado: $' || v_total::text
  );
  RETURN jsonb_build_object(
    'comprobantes_pago', v_pagos, 'monto_abonado', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_abono_atomico(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_abono_atomico(uuid, jsonb, text) TO authenticated;
