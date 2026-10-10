-- Migración: Función atómica y segura para reset de datos demo de operación
-- Fecha: 2026-10-10
-- Fase 2: Ajustes Octubre 2026 (Parte 2: Hormiglass CRM)

CREATE OR REPLACE FUNCTION public.reset_datos_operacion(
  p_confirmacion text DEFAULT '',
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conteos jsonb;
  v_trunc_cmd text;
BEGIN
  -- 1. Validar autorización de administrador
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'Acceso denegado: Solo administradores pueden ejecutar el reset de operaciones.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Recolectar conteos de tablas operativas
  v_conteos := jsonb_build_object(
    'clientes', (SELECT count(*) FROM public.clientes),
    'oportunidades', (SELECT count(*) FROM public.oportunidades),
    'cotizaciones', (SELECT count(*) FROM public.cotizaciones),
    'cotizacion_items', (SELECT count(*) FROM public.cotizacion_items),
    'abonos', (SELECT count(*) FROM public.abonos),
    'caja_movimientos', (SELECT count(*) FROM public.caja_movimientos),
    'ordenes_compra', (SELECT count(*) FROM public.ordenes_compra),
    'orden_compra_items', (SELECT count(*) FROM public.orden_compra_items),
    'orden_compra_asignaciones', (SELECT count(*) FROM public.orden_compra_asignaciones),
    'guias_despacho', (SELECT count(*) FROM public.guias_despacho),
    'guia_despacho_items', (SELECT count(*) FROM public.guia_despacho_items),
    'ordenes_produccion', (SELECT count(*) FROM public.ordenes_produccion),
    'orden_produccion_items', (SELECT count(*) FROM public.orden_produccion_items),
    'ordenes_reventa', (SELECT count(*) FROM public.ordenes_reventa),
    'produccion_diaria', (SELECT count(*) FROM public.produccion_diaria),
    'proyectos_planificacion', (SELECT count(*) FROM public.proyectos_planificacion),
    'eventos_produccion_logistica', (SELECT count(*) FROM public.eventos_produccion_logistica),
    'postventa_casos', (SELECT count(*) FROM public.postventa_casos),
    'actividades_op', (SELECT count(*) FROM public.actividades_op),
    'visitas_terreno', (SELECT count(*) FROM public.visitas_terreno),
    'notas_actividad', (SELECT count(*) FROM public.notas_actividad),
    'recordatorios', (SELECT count(*) FROM public.recordatorios),
    'notificaciones', (SELECT count(*) FROM public.notificaciones)
  );

  -- 3. Modo Dry-Run (Simulación)
  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'mensaje', 'Simulación de reset ejecutada con éxito. No se modificó ningún dato.',
      'conteos', v_conteos
    );
  END IF;

  -- 4. Validación de frase estricta
  IF trim(p_confirmacion) <> 'BORRAR OPERACION HORMIGLASS' THEN
    RAISE EXCEPTION 'Frase de confirmación inválida. Para proceder debe ingresar exactamente: BORRAR OPERACION HORMIGLASS'
      USING ERRCODE = '22023';
  END IF;

  -- 5. Ejecutar borrado seguro mediante TRUNCATE CASCADE
  v_trunc_cmd := 'TRUNCATE TABLE '
    || 'public.clientes, '
    || 'public.oportunidades, '
    || 'public.cotizaciones, '
    || 'public.ordenes_compra, '
    || 'public.guias_despacho, '
    || 'public.ordenes_produccion, '
    || 'public.ordenes_reventa, '
    || 'public.pedidos_proveedor, '
    || 'public.proyectos_planificacion, '
    || 'public.eventos_produccion_logistica, '
    || 'public.caja_movimientos, '
    || 'public.abonos, '
    || 'public.postventa_casos, '
    || 'public.recordatorios, '
    || 'public.notificaciones, '
    || 'public.produccion_diaria, '
    || 'public.operacion_excepciones, '
    || 'public.cobro_aviso_ciclos '
    || 'CASCADE';

  EXECUTE v_trunc_cmd;

  -- 6. Auditoría del reset
  INSERT INTO public.logs_sistema (
    tipo_accion,
    entidad,
    descripcion,
    usuario_id,
    datos_nuevos
  ) VALUES (
    'eliminacion',
    'sistema',
    'Reset de datos demo de operación completado por administrador',
    public.current_usuario_id(),
    jsonb_build_object(
      'conteos_eliminados', v_conteos,
      'fecha_reset', now()
    )
  );

  RETURN jsonb_build_object(
    'dry_run', false,
    'mensaje', 'Reset completado con éxito. Todas las tablas operativas han sido reiniciadas a 0.',
    'conteos_eliminados', v_conteos
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_datos_operacion(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_datos_operacion(text, boolean) TO authenticated;
