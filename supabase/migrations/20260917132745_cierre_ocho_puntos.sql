-- Cierre operativo: excepciones auditadas, calendario, entrega y cobranza.
ALTER TABLE public.oportunidades ADD COLUMN fecha_vencimiento_cobro date;
ALTER TABLE public.guias_despacho ADD COLUMN costo_real_confirmado boolean NOT NULL DEFAULT false;
ALTER TABLE public.eventos_produccion_logistica
  ADD COLUMN orden_compra_id uuid REFERENCES public.ordenes_compra(id) ON DELETE SET NULL,
  ADD COLUMN conflicto_confirmado_motivo text;
CREATE INDEX eventos_oc_idx ON public.eventos_produccion_logistica(orden_compra_id)
  WHERE orden_compra_id IS NOT NULL;

CREATE TABLE public.operacion_excepciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('exceso_produccion','firma_entrega','entrega_manual')),
  oportunidad_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  orden_produccion_id uuid REFERENCES public.ordenes_produccion(id) ON DELETE CASCADE,
  cotizacion_item_id uuid REFERENCES public.cotizacion_items(id),
  guia_despacho_id uuid REFERENCES public.guias_despacho(id) ON DELETE CASCADE,
  cantidad_excedente numeric(12,2),
  motivo text NOT NULL CHECK (length(trim(motivo)) >= 8),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada')),
  solicitado_por uuid NOT NULL REFERENCES public.usuarios(id),
  resuelto_por uuid REFERENCES public.usuarios(id),
  solicitado_at timestamptz NOT NULL DEFAULT now(),
  resuelto_at timestamptz,
  CHECK (
    (tipo = 'exceso_produccion' AND orden_produccion_id IS NOT NULL AND cotizacion_item_id IS NOT NULL AND cantidad_excedente > 0 AND guia_despacho_id IS NULL) OR
    (tipo = 'firma_entrega' AND guia_despacho_id IS NOT NULL AND orden_produccion_id IS NULL AND cantidad_excedente IS NULL) OR
    (tipo = 'entrega_manual' AND guia_despacho_id IS NULL AND orden_produccion_id IS NULL AND cantidad_excedente IS NULL)
  ),
  CHECK ((estado = 'pendiente' AND resuelto_por IS NULL AND resuelto_at IS NULL) OR
         (estado <> 'pendiente' AND resuelto_por IS NOT NULL AND resuelto_at IS NOT NULL))
);
CREATE INDEX operacion_excepciones_venta_idx ON public.operacion_excepciones(oportunidad_id, tipo, estado);
ALTER TABLE public.operacion_excepciones ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.operacion_excepciones TO authenticated;
CREATE POLICY operacion_excepciones_select ON public.operacion_excepciones
  FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY operacion_excepciones_insert ON public.operacion_excepciones
  FOR INSERT TO authenticated WITH CHECK (public.has_role('user','mano_obra') AND estado = 'pendiente' AND solicitado_por = public.current_usuario_id());
CREATE POLICY operacion_excepciones_update ON public.operacion_excepciones
  FOR UPDATE TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

CREATE FUNCTION public.validar_excepcion_operativa() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE linked_sale uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'pendiente' OR NEW.solicitado_por <> public.current_usuario_id() THEN
      RAISE EXCEPTION 'La solicitud debe registrarse pendiente por el usuario actual';
    END IF;
    IF NEW.tipo = 'exceso_produccion' THEN
      SELECT oportunidad_id INTO linked_sale FROM public.ordenes_produccion WHERE id = NEW.orden_produccion_id;
      IF linked_sale IS DISTINCT FROM NEW.oportunidad_id OR NOT EXISTS (
        SELECT 1 FROM public.orden_produccion_items WHERE orden_produccion_id = NEW.orden_produccion_id AND cotizacion_item_id = NEW.cotizacion_item_id
      ) THEN RAISE EXCEPTION 'Orden o producto no corresponde a la venta'; END IF;
    ELSIF NEW.tipo = 'firma_entrega' THEN
      SELECT oportunidad_id INTO linked_sale FROM public.guias_despacho WHERE id = NEW.guia_despacho_id;
      IF linked_sale IS DISTINCT FROM NEW.oportunidad_id THEN RAISE EXCEPTION 'Guía no corresponde a la venta'; END IF;
    END IF;
  ELSE
    IF NOT public.has_role('admin') OR OLD.estado <> 'pendiente' OR NEW.estado = 'pendiente' OR
       NEW.id IS DISTINCT FROM OLD.id OR NEW.tipo IS DISTINCT FROM OLD.tipo OR
       NEW.oportunidad_id IS DISTINCT FROM OLD.oportunidad_id OR NEW.orden_produccion_id IS DISTINCT FROM OLD.orden_produccion_id OR
       NEW.cotizacion_item_id IS DISTINCT FROM OLD.cotizacion_item_id OR NEW.guia_despacho_id IS DISTINCT FROM OLD.guia_despacho_id OR
       NEW.cantidad_excedente IS DISTINCT FROM OLD.cantidad_excedente OR NEW.motivo IS DISTINCT FROM OLD.motivo OR
       NEW.solicitado_por IS DISTINCT FROM OLD.solicitado_por OR NEW.solicitado_at IS DISTINCT FROM OLD.solicitado_at THEN
      RAISE EXCEPTION 'Solo el administrador puede resolver una solicitud pendiente';
    END IF;
    NEW.resuelto_por := public.current_usuario_id();
    NEW.resuelto_at := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validar_excepcion_operativa BEFORE INSERT OR UPDATE ON public.operacion_excepciones
  FOR EACH ROW EXECUTE FUNCTION public.validar_excepcion_operativa();
REVOKE ALL ON FUNCTION public.validar_excepcion_operativa() FROM PUBLIC;

CREATE FUNCTION public.avisar_excepcion_operativa() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE manager_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR manager_id IN SELECT id FROM public.usuarios WHERE rol = 'admin' AND activo LOOP
      INSERT INTO public.notificaciones(usuario_id,mensaje,tipo,entidad_relacionada,link_url)
        VALUES(manager_id,'Excepción operativa pendiente: ' || NEW.tipo || '. Motivo: ' || NEW.motivo,
          'excepcion_pendiente',NEW.oportunidad_id::text,'/ventas/' || NEW.oportunidad_id::text || '/operacion');
    END LOOP;
  ELSE
    INSERT INTO public.notificaciones(usuario_id,mensaje,tipo,entidad_relacionada,link_url)
      VALUES(NEW.solicitado_por,'Tu excepción ' || NEW.tipo || ' fue ' || NEW.estado || '.',
        'excepcion_resuelta',NEW.oportunidad_id::text,'/ventas/' || NEW.oportunidad_id::text || '/operacion');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER avisar_excepcion_operativa AFTER INSERT OR UPDATE OF estado ON public.operacion_excepciones
  FOR EACH ROW EXECUTE FUNCTION public.avisar_excepcion_operativa();
REVOKE ALL ON FUNCTION public.avisar_excepcion_operativa() FROM PUBLIC;

CREATE FUNCTION public.validar_produccion_objetivo() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE target_qty numeric; produced_qty numeric; approved_extra numeric; linked_sale uuid; exclude_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN exclude_id := OLD.id; END IF;
  IF NEW.orden_produccion_id IS NULL OR NEW.cotizacion_item_id IS NULL THEN
    RAISE EXCEPTION 'La producción debe asociarse a una orden y producto';
  END IF;
  SELECT o.oportunidad_id, i.cantidad_objetivo INTO linked_sale, target_qty
    FROM public.ordenes_produccion o JOIN public.orden_produccion_items i ON i.orden_produccion_id = o.id
    WHERE o.id = NEW.orden_produccion_id AND i.cotizacion_item_id = NEW.cotizacion_item_id FOR UPDATE OF i;
  IF target_qty IS NULL OR linked_sale IS DISTINCT FROM NEW.oportunidad_id THEN
    RAISE EXCEPTION 'Producto no pertenece a la orden de esta venta';
  END IF;
  SELECT COALESCE(sum(cantidad_producida),0) INTO produced_qty FROM public.produccion_diaria
    WHERE orden_produccion_id = NEW.orden_produccion_id AND cotizacion_item_id = NEW.cotizacion_item_id
      AND (exclude_id IS NULL OR id <> exclude_id);
  SELECT COALESCE(sum(cantidad_excedente),0) INTO approved_extra FROM public.operacion_excepciones
    WHERE orden_produccion_id = NEW.orden_produccion_id AND cotizacion_item_id = NEW.cotizacion_item_id
      AND tipo = 'exceso_produccion' AND estado = 'aprobada';
  IF produced_qty + NEW.cantidad_producida > target_qty + approved_extra THEN
    RAISE EXCEPTION 'Producción excede el objetivo autorizado; solicita aprobación del excedente';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validar_produccion_objetivo BEFORE INSERT OR UPDATE OF cantidad_producida, orden_produccion_id, cotizacion_item_id
  ON public.produccion_diaria FOR EACH ROW EXECUTE FUNCTION public.validar_produccion_objetivo();
REVOKE ALL ON FUNCTION public.validar_produccion_objetivo() FROM PUBLIC;

CREATE FUNCTION public.validar_guia_entregada() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado = 'entregada' AND NEW.estado <> 'entregada' THEN
    RAISE EXCEPTION 'Una guía entregada no se reabre; registra una corrección en postventa';
  END IF;
  IF NEW.estado = 'entregada' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM NEW.estado) THEN
    IF NOT NEW.carga_verificada OR nullif(trim(NEW.recibido_por),'') IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.guia_despacho_items WHERE guia_despacho_id = NEW.id AND cantidad_recibida > 0
    ) OR EXISTS (
      SELECT 1 FROM public.guia_despacho_items WHERE guia_despacho_id = NEW.id AND cantidad_recibida <= 0
    ) THEN RAISE EXCEPTION 'Verifica carga, cantidades recibidas y nombre de quien recibe'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.guia_despacho_documentos WHERE guia_despacho_id = NEW.id AND tipo = 'firma')
       AND NOT EXISTS (SELECT 1 FROM public.operacion_excepciones WHERE guia_despacho_id = NEW.id AND tipo = 'firma_entrega' AND estado = 'aprobada') THEN
      RAISE EXCEPTION 'Adjunta firma o espera aprobación administrativa de la excepción';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validar_guia_entregada BEFORE INSERT OR UPDATE OF estado ON public.guias_despacho
  FOR EACH ROW EXECUTE FUNCTION public.validar_guia_entregada();
REVOKE ALL ON FUNCTION public.validar_guia_entregada() FROM PUBLIC;

CREATE FUNCTION public.bloquear_cambios_entrega_confirmada() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE guide_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN guide_id := OLD.guia_despacho_id;
  ELSE guide_id := NEW.guia_despacho_id; END IF;
  IF EXISTS (SELECT 1 FROM public.guias_despacho WHERE id = guide_id AND estado = 'entregada') THEN
    RAISE EXCEPTION 'No se modifican cantidades ni respaldos de una guía entregada; registra postventa';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bloquear_items_entregados BEFORE UPDATE OR DELETE ON public.guia_despacho_items
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambios_entrega_confirmada();
CREATE TRIGGER bloquear_documentos_entregados BEFORE UPDATE OR DELETE ON public.guia_despacho_documentos
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambios_entrega_confirmada();
REVOKE ALL ON FUNCTION public.bloquear_cambios_entrega_confirmada() FROM PUBLIC;

CREATE FUNCTION public.entrega_acreditada(p_venta uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.operacion_excepciones
    WHERE oportunidad_id = p_venta AND tipo = 'entrega_manual' AND estado = 'aprobada'
  ) OR (
    EXISTS (SELECT 1 FROM public.cotizacion_items ci JOIN public.oportunidades o ON o.cotizacion_actual_id = ci.cotizacion_id WHERE o.id = p_venta)
    AND NOT EXISTS (
      SELECT 1 FROM public.cotizacion_items ci JOIN public.oportunidades o ON o.cotizacion_actual_id = ci.cotizacion_id
      WHERE o.id = p_venta AND ci.cantidad > COALESCE((
        SELECT sum(gi.cantidad_recibida) FROM public.guia_despacho_items gi
        JOIN public.guias_despacho g ON g.id = gi.guia_despacho_id
        WHERE g.oportunidad_id = p_venta AND g.estado = 'entregada' AND gi.cotizacion_item_id = ci.id
          AND (EXISTS (SELECT 1 FROM public.guia_despacho_documentos d WHERE d.guia_despacho_id = g.id AND d.tipo = 'firma')
            OR EXISTS (SELECT 1 FROM public.operacion_excepciones x WHERE x.guia_despacho_id = g.id AND x.tipo = 'firma_entrega' AND x.estado = 'aprobada'))
      ),0)
    )
  );
$$;
REVOKE ALL ON FUNCTION public.entrega_acreditada(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.entrega_acreditada(uuid) TO authenticated;

CREATE FUNCTION public.validar_cierre_venta() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.entrega_manual_confirmada AND NOT OLD.entrega_manual_confirmada AND NOT EXISTS (
    SELECT 1 FROM public.operacion_excepciones WHERE oportunidad_id = NEW.id AND tipo = 'entrega_manual' AND estado = 'aprobada'
  ) THEN RAISE EXCEPTION 'La entrega manual requiere aprobación administrativa'; END IF;
  IF NEW.estado_pipeline IN ('entregada','prod_finalizado','rev_entregado') AND OLD.estado_pipeline IS DISTINCT FROM NEW.estado_pipeline
     AND NOT public.entrega_acreditada(NEW.id) THEN
    RAISE EXCEPTION 'La venta solo puede cerrarse cuando la entrega está acreditada';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validar_cierre_venta BEFORE UPDATE OF estado_pipeline, entrega_manual_confirmada ON public.oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.validar_cierre_venta();
REVOKE ALL ON FUNCTION public.validar_cierre_venta() FROM PUBLIC;

-- Asociación consistente y conflictos confirmados con motivo.
CREATE FUNCTION public.validar_evento_operativo() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE matching_sale uuid;
BEGIN
  IF NEW.guia_despacho_id IS NOT NULL THEN
    SELECT oportunidad_id INTO matching_sale FROM public.guias_despacho WHERE id = NEW.guia_despacho_id;
    IF matching_sale IS DISTINCT FROM NEW.oportunidad_id THEN RAISE EXCEPTION 'Guía no corresponde a la venta del evento'; END IF;
  END IF;
  IF NEW.orden_compra_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.orden_compra_asignaciones WHERE orden_compra_id = NEW.orden_compra_id AND oportunidad_id = NEW.oportunidad_id
  ) THEN RAISE EXCEPTION 'OC no asignada a esta venta'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.fecha_inicio, NEW.fecha_fin) IS DISTINCT FROM (OLD.fecha_inicio, OLD.fecha_fin)
     AND nullif(trim(NEW.motivo_reprogramacion),'') IS NULL THEN
    RAISE EXCEPTION 'Indica el motivo de la reprogramación';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.eventos_produccion_logistica e
    WHERE e.id <> NEW.id AND e.estado NOT IN ('completado','no_realizado')
      AND NEW.fecha_inicio < e.fecha_fin AND e.fecha_inicio < NEW.fecha_fin
      AND ((NEW.responsable_id IS NOT NULL AND NEW.responsable_id = e.responsable_id)
        OR (NEW.recurso_vehiculo IS NOT NULL AND e.recurso_vehiculo IS NOT NULL AND
          upper(regexp_replace(NEW.recurso_vehiculo,'[^[:alnum:]]','','g')) = upper(regexp_replace(e.recurso_vehiculo,'[^[:alnum:]]','','g'))))
  ) AND nullif(trim(NEW.conflicto_confirmado_motivo),'') IS NULL THEN
    RAISE EXCEPTION 'Existe conflicto de recurso: confirma con un motivo';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validar_evento_operativo BEFORE INSERT OR UPDATE OF fecha_inicio,fecha_fin,responsable_id,recurso_vehiculo,guia_despacho_id,orden_compra_id
  ON public.eventos_produccion_logistica FOR EACH ROW EXECUTE FUNCTION public.validar_evento_operativo();
REVOKE ALL ON FUNCTION public.validar_evento_operativo() FROM PUBLIC;

CREATE TABLE public.evento_reprogramaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.eventos_produccion_logistica(id) ON DELETE CASCADE,
  fecha_inicio_anterior timestamptz NOT NULL,
  fecha_fin_anterior timestamptz NOT NULL,
  fecha_inicio_nueva timestamptz NOT NULL,
  fecha_fin_nueva timestamptz NOT NULL,
  motivo text NOT NULL,
  actor_id uuid REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.evento_reprogramaciones ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.evento_reprogramaciones TO authenticated;
CREATE POLICY evento_reprogramaciones_select ON public.evento_reprogramaciones FOR SELECT TO authenticated USING (public.is_active_user());

CREATE FUNCTION public.avisar_reprogramacion() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE recipient record;
BEGIN
  IF (NEW.fecha_inicio,NEW.fecha_fin) IS NOT DISTINCT FROM (OLD.fecha_inicio,OLD.fecha_fin) THEN RETURN NEW; END IF;
  INSERT INTO public.evento_reprogramaciones(evento_id,fecha_inicio_anterior,fecha_fin_anterior,fecha_inicio_nueva,fecha_fin_nueva,motivo,actor_id)
    VALUES(NEW.id,OLD.fecha_inicio,OLD.fecha_fin,NEW.fecha_inicio,NEW.fecha_fin,NEW.motivo_reprogramacion,public.current_usuario_id());
  FOR recipient IN
    SELECT DISTINCT usuario_id, oportunidad_id FROM (
      SELECT o.asignado_a AS usuario_id,o.id AS oportunidad_id FROM public.oportunidades o
      WHERE o.id = NEW.oportunidad_id OR o.id IN (
        SELECT e.oportunidad_id FROM public.eventos_produccion_logistica e
        WHERE e.id <> NEW.id AND e.estado NOT IN ('completado','no_realizado')
          AND (e.oportunidad_id = NEW.oportunidad_id OR
               (NEW.orden_compra_id IS NOT NULL AND e.orden_compra_id = NEW.orden_compra_id) OR
               (NEW.recurso_vehiculo IS NOT NULL AND upper(regexp_replace(e.recurso_vehiculo,'[^[:alnum:]]','','g')) = upper(regexp_replace(NEW.recurso_vehiculo,'[^[:alnum:]]','','g'))))
          AND e.fecha_inicio BETWEEN least(OLD.fecha_inicio,NEW.fecha_inicio) AND greatest(OLD.fecha_fin,NEW.fecha_fin) + interval '7 days'
      )
      UNION ALL SELECT NEW.responsable_id, NEW.oportunidad_id
      UNION ALL SELECT u.id, NEW.oportunidad_id FROM public.usuarios u WHERE u.rol = 'admin' AND u.activo
    ) affected WHERE usuario_id IS NOT NULL
  LOOP
    INSERT INTO public.notificaciones(usuario_id,mensaje,tipo,entidad_relacionada,link_url)
      VALUES(recipient.usuario_id,'Reprogramación que afecta la venta: ' || NEW.titulo || '. Motivo: ' || NEW.motivo_reprogramacion,
        'reprogramacion',recipient.oportunidad_id::text,'/ventas?oportunidad=' || recipient.oportunidad_id::text);
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER avisar_reprogramacion AFTER UPDATE OF fecha_inicio,fecha_fin ON public.eventos_produccion_logistica
  FOR EACH ROW EXECUTE FUNCTION public.avisar_reprogramacion();
REVOKE ALL ON FUNCTION public.avisar_reprogramacion() FROM PUBLIC;

-- Libro de avisos: único por venta, destinatario, vencimiento y semana.
CREATE TABLE public.cobro_aviso_ciclos (
  oportunidad_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  fecha_vencimiento date NOT NULL,
  ciclo integer NOT NULL CHECK (ciclo >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(oportunidad_id,usuario_id,fecha_vencimiento,ciclo)
);
ALTER TABLE public.cobro_aviso_ciclos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.cobro_aviso_ciclos TO authenticated;
CREATE POLICY cobro_aviso_ciclos_select ON public.cobro_aviso_ciclos FOR SELECT TO authenticated
  USING (usuario_id = public.current_usuario_id() OR public.has_role('admin'));

CREATE FUNCTION public.generar_avisos_cobro(p_hoy date DEFAULT (now() AT TIME ZONE 'America/Santiago')::date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sale record; recipient uuid; cycle_number integer; total_amount numeric; paid_amount numeric; inserted_count integer := 0;
BEGIN
  FOR sale IN SELECT o.id,o.codigo,o.asignado_a,o.fecha_vencimiento_cobro,o.comprobantes_pago,c.monto_total
    FROM public.oportunidades o JOIN public.cotizaciones c ON c.id = o.cotizacion_actual_id
    WHERE o.fecha_vencimiento_cobro <= p_hoy AND c.estado IN ('enviada','aprobada')
  LOOP
    SELECT COALESCE(sum((v.value->>'monto')::numeric),0) INTO paid_amount
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(sale.comprobantes_pago)='array' THEN sale.comprobantes_pago ELSE '[]'::jsonb END) v(value)
      WHERE v.value ? 'monto' AND (v.value->>'monto') ~ '^[0-9]+(\.[0-9]+)?$';
    total_amount := COALESCE(sale.monto_total,0);
    IF total_amount <= paid_amount THEN CONTINUE; END IF;
    cycle_number := (p_hoy - sale.fecha_vencimiento_cobro) / 7;
    FOR recipient IN SELECT DISTINCT id FROM public.usuarios WHERE activo AND (id = sale.asignado_a OR rol = 'admin')
    LOOP
      INSERT INTO public.cobro_aviso_ciclos(oportunidad_id,usuario_id,fecha_vencimiento,ciclo)
        VALUES(sale.id,recipient,sale.fecha_vencimiento_cobro,cycle_number) ON CONFLICT DO NOTHING;
      IF FOUND THEN
        INSERT INTO public.notificaciones(usuario_id,mensaje,tipo,entidad_relacionada,link_url)
          VALUES(recipient,'Cobro vencido de la venta ' || sale.codigo || '. Saldo pendiente: $' || (total_amount-paid_amount)::text,
            'cobro_vencido',sale.id::text,'/ventas?oportunidad=' || sale.id::text);
        inserted_count := inserted_count + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN inserted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.generar_avisos_cobro(date) FROM PUBLIC, anon, authenticated;
-- Programar la ejecución diaria después de la revisión del despliegue.

-- El catálogo real solo lo administra el rol administrador.
DROP POLICY IF EXISTS catalogo_productos_insert ON public.catalogo_productos;
DROP POLICY IF EXISTS catalogo_productos_update ON public.catalogo_productos;
CREATE POLICY catalogo_productos_insert ON public.catalogo_productos FOR INSERT TO authenticated WITH CHECK (public.has_role('admin'));
CREATE POLICY catalogo_productos_update ON public.catalogo_productos FOR UPDATE TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
