-- Datos ficticios y repetibles para el piloto. No ejecutar en un proyecto productivo.
INSERT INTO public.catalogo_productos(codigo,nombre,categoria,unidad,precio_referencia,costo_referencia,descripcion,es_demo) VALUES
('DEMO-HG-001','Adoquín de hormigón gris','producto','m²',69500,42000,'Producto ficticio para pruebas',true),
('DEMO-HG-002','Pastelón de hormigón texturado','producto','m²',87900,54000,'Producto ficticio para pruebas',true),
('DEMO-HG-003','Adoquín de color a pedido','producto','m²',245000,151000,'Producto ficticio para pruebas',true),
('DEMO-HG-004','Baldosa de hormigón exterior','producto','m²',49900,28000,'Producto ficticio para pruebas',true),
('DEMO-HG-005','Cemento para fabricación','insumo','saco',10900,6100,'Insumo ficticio sin inventario automático',true),
('DEMO-HG-006','Arena lavada','insumo','m³',15900,8900,'Insumo ficticio sin inventario automático',true),
('DEMO-HG-007','Desmoldante','insumo','litro',12900,7400,'Insumo ficticio sin inventario automático',true),
('DEMO-HG-008','Instalación en obra','servicio','jornada',180000,120000,'Servicio ficticio para pruebas',true)
ON CONFLICT (codigo) DO UPDATE SET nombre=excluded.nombre,categoria=excluded.categoria,unidad=excluded.unidad,precio_referencia=excluded.precio_referencia,costo_referencia=excluded.costo_referencia,descripcion=excluded.descripcion,es_demo=true;

DO $$
DECLARE
  v_cliente uuid;
  v_cliente_2 uuid;
  v_proveedor uuid;
  v_vendedor uuid;
  v_op uuid;
  v_cot uuid;
  v_item uuid;
  v_orden uuid;
  v_guia uuid;
  v_oc uuid;
  v_oc_item uuid;
  v_ops uuid[] := ARRAY[]::uuid[];
  v_i integer;
  v_product uuid;
  v_names text[] := ARRAY[
    'Instalación fabricada en obra demo',
    'Suministro con tres despachos demo',
    'Reventa con compra a proveedor demo',
    'Suministro con retiro de cliente demo',
    'Captación WhatsApp demo',
    'Captación visita demo',
    'Fabricación para obra adicional A demo',
    'Fabricación para obra adicional B demo'
  ];
  v_prices numeric[] := ARRAY[245000,69500,87900,49900,0,0,49900,49900];
  v_qty numeric[] := ARRAY[2,100,20,8,0,0,40,60];
BEGIN
  SELECT id INTO v_vendedor FROM public.usuarios WHERE rol IN ('admin','user') AND activo = true ORDER BY created_at LIMIT 1;
  SELECT id INTO v_cliente FROM public.clientes WHERE rut = 'DEMO-CLIENTE-01' LIMIT 1;
  IF v_cliente IS NULL THEN
    INSERT INTO public.clientes(nombre,rut,tipo_cliente) VALUES ('DEMO Constructora Andina','DEMO-CLIENTE-01','juridica') RETURNING id INTO v_cliente;
  END IF;
  SELECT id INTO v_cliente_2 FROM public.clientes WHERE rut = 'DEMO-CLIENTE-02' LIMIT 1;
  IF v_cliente_2 IS NULL THEN
    INSERT INTO public.clientes(nombre,rut,tipo_cliente) VALUES ('DEMO Vidriería Central','DEMO-CLIENTE-02','juridica') RETURNING id INTO v_cliente_2;
  END IF;
  SELECT id INTO v_proveedor FROM public.proveedores WHERE rut = 'DEMO-PROVEEDOR-01' LIMIT 1;
  IF v_proveedor IS NULL THEN
    INSERT INTO public.proveedores(nombre,rut) VALUES ('DEMO Proveedor de Vidrios','DEMO-PROVEEDOR-01') RETURNING id INTO v_proveedor;
  END IF;

  FOR v_i IN 1..8 LOOP
    SELECT id INTO v_op FROM public.oportunidades WHERE codigo = 'DEMO-OP-0' || v_i;
    IF v_op IS NULL THEN
      INSERT INTO public.oportunidades(codigo,titulo,cliente_id,asignado_a,tipo_venta,estado_pipeline,rama_destino,abastecimiento,forma_entrega,origen)
      VALUES ('DEMO-OP-0' || v_i,v_names[v_i],CASE WHEN v_i <= 2 THEN v_cliente ELSE v_cliente_2 END,v_vendedor,
        CASE WHEN v_i = 1 THEN 'Instalación' WHEN v_i = 3 THEN 'Reventa de Material' ELSE 'Suministro' END,
        CASE WHEN v_i <= 4 OR v_i IN (7,8) THEN 'entregada' ELSE 'nueva' END,
        CASE WHEN v_i IN (1,2,7,8) THEN 'produccion' WHEN v_i IN (3,4) THEN 'reventa' ELSE NULL END,
        CASE WHEN v_i IN (1,2,7,8) THEN 'fabricar' WHEN v_i = 3 THEN 'compra_proveedor' ELSE 'stock' END,
        CASE WHEN v_i = 4 THEN 'retiro_cliente' ELSE 'despacho_propio' END,
        CASE WHEN v_i = 5 THEN 'whatsapp' WHEN v_i = 6 THEN 'visita' ELSE 'manual' END)
      RETURNING id INTO v_op;
    END IF;
    v_ops := array_append(v_ops,v_op);
    IF v_i <= 4 OR v_i IN (7,8) THEN
      SELECT id INTO v_cot FROM public.cotizaciones WHERE numero_cotizacion = 'DEMO-COT-0' || v_i;
      IF v_cot IS NULL THEN
        INSERT INTO public.cotizaciones(numero_cotizacion,cliente_id,oportunidad_id,estado,subtotal,monto_iva,monto_total)
        VALUES ('DEMO-COT-0' || v_i,CASE WHEN v_i <= 2 THEN v_cliente ELSE v_cliente_2 END,v_op,'aprobada',
          v_prices[v_i]*v_qty[v_i],round(v_prices[v_i]*v_qty[v_i]*0.19),round(v_prices[v_i]*v_qty[v_i]*1.19))
        RETURNING id INTO v_cot;
      END IF;
      UPDATE public.oportunidades SET cotizacion_actual_id=v_cot WHERE id=v_op;
      SELECT id INTO v_item FROM public.cotizacion_items WHERE cotizacion_id=v_cot LIMIT 1;
      IF v_item IS NULL THEN
        SELECT id INTO v_product FROM public.catalogo_productos WHERE codigo=CASE v_i WHEN 1 THEN 'DEMO-HG-003' WHEN 2 THEN 'DEMO-HG-001' WHEN 3 THEN 'DEMO-HG-002' ELSE 'DEMO-HG-004' END;
        INSERT INTO public.cotizacion_items(cotizacion_id,producto,cantidad,precio_unitario,total_item,producto_catalogo_id)
        VALUES(v_cot,(SELECT nombre FROM public.catalogo_productos WHERE id=v_product),v_qty[v_i],v_prices[v_i],v_qty[v_i]*v_prices[v_i],v_product)
        RETURNING id INTO v_item;
      END IF;
      IF v_i IN (1,2,7,8) THEN
        SELECT id INTO v_orden FROM public.ordenes_produccion WHERE oportunidad_id=v_op LIMIT 1;
        IF v_orden IS NULL THEN
          INSERT INTO public.ordenes_produccion(oportunidad_id,fecha_inicio,fecha_objetivo,estado)
          VALUES(v_op,current_date,current_date+5,CASE WHEN v_i=1 THEN 'en_curso' ELSE 'planificada' END)
          RETURNING id INTO v_orden;
          INSERT INTO public.orden_produccion_items(orden_produccion_id,cotizacion_item_id,producto,cantidad_objetivo)
          VALUES(v_orden,v_item,(SELECT producto FROM public.cotizacion_items WHERE id=v_item),v_qty[v_i]);
        END IF;
      END IF;
      IF v_i IN (2,4) THEN
        SELECT id INTO v_guia FROM public.guias_despacho WHERE numero_guia='DEMO-GUIA-0'||v_i||'-1' LIMIT 1;
        IF v_guia IS NULL THEN
          INSERT INTO public.guias_despacho(oportunidad_id,numero_guia,estado,origen,destino,vehiculo,chofer,carga_verificada,recibido_por,costo_estimado,costo_real,tipo_transporte)
          VALUES(v_op,'DEMO-GUIA-0'||v_i||'-1','entregada','Bodega demo',CASE WHEN v_i=4 THEN 'Retiro por cliente demo' ELSE 'Obra demo' END,
            'Vehículo demo','Chofer demo',true,'Receptor demo',25000,23000,CASE WHEN v_i=4 THEN 'retiro_cliente' ELSE 'propio' END)
          RETURNING id INTO v_guia;
          INSERT INTO public.guia_despacho_items(guia_despacho_id,cotizacion_item_id,producto,cantidad_planificada,cantidad_cargada,cantidad_recibida)
          VALUES(v_guia,v_item,(SELECT producto FROM public.cotizacion_items WHERE id=v_item),CASE WHEN v_i=2 THEN 33 ELSE 8 END,CASE WHEN v_i=2 THEN 33 ELSE 8 END,CASE WHEN v_i=2 THEN 33 ELSE 8 END);
        END IF;
      END IF;
    END IF;
  END LOOP;

  SELECT id INTO v_oc FROM public.ordenes_compra WHERE numero_oc='DEMO-OC-001' LIMIT 1;
  IF v_oc IS NULL THEN
    INSERT INTO public.ordenes_compra(numero_oc,proveedor_id,tipo_compra,subtotal,monto_iva,monto_total)
    VALUES('DEMO-OC-001',v_proveedor,'insumos_fabricacion',1000000,190000,1190000) RETURNING id INTO v_oc;
    INSERT INTO public.orden_compra_items(orden_compra_id,descripcion,cantidad,precio_unitario,total_item,producto_catalogo_id)
    SELECT v_oc,'DEMO Cemento para fabricación',1000,1000,1000000,id FROM public.catalogo_productos WHERE codigo='DEMO-HG-005'
    RETURNING id INTO v_oc_item;
    INSERT INTO public.orden_compra_asignaciones(orden_compra_id,orden_compra_item_id,oportunidad_id,cantidad,costo_asignado,unidad,notas)
    SELECT v_oc,v_oc_item,v_ops[n],250,250000,'saco','Asignación ficticia para piloto' FROM unnest(ARRAY[1,2,7,8]) AS n;
  END IF;
END;
$$;

UPDATE public.cotizacion_items ci SET producto=p.nombre
FROM public.catalogo_productos p, public.cotizaciones c
WHERE ci.producto_catalogo_id=p.id AND ci.cotizacion_id=c.id AND c.numero_cotizacion LIKE 'DEMO-%';
UPDATE public.orden_produccion_items oi SET producto=ci.producto FROM public.cotizacion_items ci
WHERE oi.cotizacion_item_id=ci.id AND ci.cotizacion_id IN (SELECT id FROM public.cotizaciones WHERE numero_cotizacion LIKE 'DEMO-%');
UPDATE public.guia_despacho_items gi SET producto=ci.producto FROM public.cotizacion_items ci
WHERE gi.cotizacion_item_id=ci.id AND ci.cotizacion_id IN (SELECT id FROM public.cotizaciones WHERE numero_cotizacion LIKE 'DEMO-%');
UPDATE public.orden_compra_items SET descripcion='DEMO Cemento para fabricación'
WHERE orden_compra_id IN (SELECT id FROM public.ordenes_compra WHERE numero_oc='DEMO-OC-001');
UPDATE public.orden_compra_asignaciones SET unidad='saco'
WHERE orden_compra_id IN (SELECT id FROM public.ordenes_compra WHERE numero_oc='DEMO-OC-001');
UPDATE public.orden_compra_asignaciones a SET oportunidad_id=(SELECT id FROM public.oportunidades WHERE codigo='DEMO-OP-07')
WHERE a.orden_compra_id=(SELECT id FROM public.ordenes_compra WHERE numero_oc='DEMO-OC-001')
AND a.oportunidad_id=(SELECT id FROM public.oportunidades WHERE codigo='DEMO-OP-03');
UPDATE public.orden_compra_asignaciones a SET oportunidad_id=(SELECT id FROM public.oportunidades WHERE codigo='DEMO-OP-08')
WHERE a.orden_compra_id=(SELECT id FROM public.ordenes_compra WHERE numero_oc='DEMO-OC-001')
AND a.oportunidad_id=(SELECT id FROM public.oportunidades WHERE codigo='DEMO-OP-04');

-- Completa los cuatro recorridos operativos del piloto.
DO $$
DECLARE
  v_op uuid; v_cot_item uuid; v_prod uuid; v_guia uuid; v_oc uuid; v_oc_item uuid; v_proveedor uuid;
  v_ordinal integer; v_qty numeric;
BEGIN
  SELECT id INTO v_op FROM public.oportunidades WHERE codigo='DEMO-OP-01';
  SELECT id INTO v_prod FROM public.ordenes_produccion WHERE oportunidad_id=v_op LIMIT 1;
  SELECT id INTO v_cot_item FROM public.cotizacion_items WHERE cotizacion_id=(SELECT cotizacion_actual_id FROM public.oportunidades WHERE id=v_op) LIMIT 1;
  IF NOT EXISTS(SELECT 1 FROM public.produccion_diaria WHERE oportunidad_id=v_op) THEN
    INSERT INTO public.produccion_diaria(oportunidad_id,orden_produccion_id,cotizacion_item_id,producto,cantidad_producida,fecha_produccion)
    SELECT v_op,v_prod,v_cot_item,producto,2,current_date FROM public.cotizacion_items WHERE id=v_cot_item;
  END IF;
  UPDATE public.ordenes_produccion SET estado='completada' WHERE id=v_prod;
  IF NOT EXISTS(SELECT 1 FROM public.guias_despacho WHERE numero_guia='DEMO-GUIA-01-1') THEN
    INSERT INTO public.guias_despacho(oportunidad_id,numero_guia,estado,origen,destino,carga_verificada,recibido_por,tipo_transporte,costo_real)
    VALUES(v_op,'DEMO-GUIA-01-1','entregada','Bodega demo','Obra de instalación demo',true,'Receptor demo','propio',18000) RETURNING id INTO v_guia;
    INSERT INTO public.guia_despacho_items(guia_despacho_id,cotizacion_item_id,producto,cantidad_planificada,cantidad_cargada,cantidad_recibida)
    SELECT v_guia,id,producto,2,2,2 FROM public.cotizacion_items WHERE id=v_cot_item;
  END IF;

  SELECT id INTO v_op FROM public.oportunidades WHERE codigo='DEMO-OP-02';
  SELECT id INTO v_cot_item FROM public.cotizacion_items WHERE cotizacion_id=(SELECT cotizacion_actual_id FROM public.oportunidades WHERE id=v_op) LIMIT 1;
  FOR v_ordinal IN 2..3 LOOP
    v_qty := CASE WHEN v_ordinal=2 THEN 33 ELSE 34 END;
    IF NOT EXISTS(SELECT 1 FROM public.guias_despacho WHERE numero_guia='DEMO-GUIA-02-'||v_ordinal) THEN
      INSERT INTO public.guias_despacho(oportunidad_id,numero_guia,estado,origen,destino,carga_verificada,recibido_por,tipo_transporte,costo_real)
      VALUES(v_op,'DEMO-GUIA-02-'||v_ordinal,'entregada','Bodega demo','Obra demo',true,'Receptor demo','propio',23000) RETURNING id INTO v_guia;
      INSERT INTO public.guia_despacho_items(guia_despacho_id,cotizacion_item_id,producto,cantidad_planificada,cantidad_cargada,cantidad_recibida)
      SELECT v_guia,id,producto,v_qty,v_qty,v_qty FROM public.cotizacion_items WHERE id=v_cot_item;
    END IF;
  END LOOP;

  SELECT id INTO v_op FROM public.oportunidades WHERE codigo='DEMO-OP-03';
  SELECT id INTO v_proveedor FROM public.proveedores WHERE rut='DEMO-PROVEEDOR-01';
  SELECT id INTO v_cot_item FROM public.cotizacion_items WHERE cotizacion_id=(SELECT cotizacion_actual_id FROM public.oportunidades WHERE id=v_op) LIMIT 1;
  SELECT id INTO v_oc FROM public.ordenes_compra WHERE numero_oc='DEMO-OC-REVENTA' LIMIT 1;
  IF v_oc IS NULL THEN
    INSERT INTO public.ordenes_compra(numero_oc,proveedor_id,tipo_compra,subtotal,monto_iva,monto_total)
    VALUES('DEMO-OC-REVENTA',v_proveedor,'reventa',1080000,205200,1285200) RETURNING id INTO v_oc;
    INSERT INTO public.orden_compra_items(orden_compra_id,descripcion,cantidad,precio_unitario,total_item,producto_catalogo_id)
    SELECT v_oc,nombre,20,54000,1080000,id FROM public.catalogo_productos WHERE codigo='DEMO-HG-002'
    RETURNING id INTO v_oc_item;
    INSERT INTO public.orden_compra_asignaciones(orden_compra_id,orden_compra_item_id,oportunidad_id,cantidad,costo_asignado,unidad)
    VALUES(v_oc,v_oc_item,v_op,20,1080000,'m²');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.guias_despacho WHERE numero_guia='DEMO-GUIA-03-1') THEN
    INSERT INTO public.guias_despacho(oportunidad_id,numero_guia,estado,origen,destino,carga_verificada,recibido_por,tipo_transporte,costo_real)
    VALUES(v_op,'DEMO-GUIA-03-1','entregada','Proveedor demo','Cliente demo',true,'Receptor demo','externo',34000) RETURNING id INTO v_guia;
    INSERT INTO public.guia_despacho_items(guia_despacho_id,cotizacion_item_id,producto,cantidad_planificada,cantidad_cargada,cantidad_recibida)
    SELECT v_guia,id,producto,20,20,20 FROM public.cotizacion_items WHERE id=v_cot_item;
  END IF;

  -- Eventos de calendario de ambos contextos y una postventa programada.
  IF NOT EXISTS(SELECT 1 FROM public.eventos_produccion_logistica WHERE titulo='DEMO Fabricación para instalación') THEN
    INSERT INTO public.eventos_produccion_logistica(oportunidad_id,tipo_evento,titulo,fecha_evento,fecha_inicio,fecha_fin,contexto,estado)
    SELECT id,'produccion','DEMO Fabricación para instalación',current_date+1,(current_date+1)::timestamp+time '09:00',(current_date+1)::timestamp+time '13:00','produccion_logistica','por_hacer'
    FROM public.oportunidades WHERE codigo='DEMO-OP-01';
    INSERT INTO public.eventos_produccion_logistica(oportunidad_id,tipo_evento,titulo,fecha_evento,fecha_inicio,fecha_fin,contexto,estado)
    SELECT id,'instalacion','DEMO Instalación en obra',current_date+2,(current_date+2)::timestamp+time '09:00',(current_date+2)::timestamp+time '12:00','produccion_logistica','por_hacer'
    FROM public.oportunidades WHERE codigo='DEMO-OP-01';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.eventos_produccion_logistica WHERE titulo='DEMO Retiro a proveedor') THEN
    INSERT INTO public.eventos_produccion_logistica(oportunidad_id,tipo_evento,titulo,fecha_evento,fecha_inicio,fecha_fin,contexto,estado,recurso_vehiculo)
    SELECT id,'retiro_proveedor','DEMO Retiro a proveedor',current_date+3,(current_date+3)::timestamp+time '09:00',(current_date+3)::timestamp+time '10:00','reventa_logistica','por_hacer','Camión demo'
    FROM public.oportunidades WHERE codigo='DEMO-OP-03';
    INSERT INTO public.eventos_produccion_logistica(oportunidad_id,tipo_evento,titulo,fecha_evento,fecha_inicio,fecha_fin,contexto,estado,recurso_vehiculo)
    SELECT id,'despacho_cliente','DEMO Despacho reventa',current_date+3,(current_date+3)::timestamp+time '11:00',(current_date+3)::timestamp+time '12:00','reventa_logistica','por_hacer','Camión demo'
    FROM public.oportunidades WHERE codigo='DEMO-OP-03';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.postventa_casos WHERE descripcion='DEMO limpieza de instalación') THEN
    INSERT INTO public.postventa_casos(oportunidad_id,tipo,estado,descripcion,fecha_compromiso)
    SELECT id,'otro','programado','DEMO limpieza de instalación',current_date+7 FROM public.oportunidades WHERE codigo='DEMO-OP-01';
  END IF;
END;
$$;

-- Se dispara el aviso de saldo después de cargar ítems y confirmar la entrega.
UPDATE public.guias_despacho SET estado='entregada' WHERE numero_guia LIKE 'DEMO-GUIA-%' AND estado='entregada';
