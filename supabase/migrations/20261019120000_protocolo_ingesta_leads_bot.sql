-- ==============================================================================
-- Migración: Protocolo de Ingesta Autónoma de Leads (Bot / ClickUp / Webhook)
-- Fecha: 19 de Octubre 2026
-- Objetivo: Permitir la creación atómica de prospectos y oportunidades sin
--           dependencia de intermediación manual, con soporte para WhatsApp bot,
--           ClickUp webhooks y formularios externos.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.registrar_lead_externo(
  p_nombre text,
  p_telefono text DEFAULT NULL,
  p_correo text DEFAULT NULL,
  p_rut text DEFAULT NULL,
  p_direccion text DEFAULT NULL,
  p_comuna text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_origen text DEFAULT 'WhatsApp Bot',
  p_tipo_venta text DEFAULT 'Instalación',
  p_modalidad_requerimiento text DEFAULT 'instalacion',
  p_titulo text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_ejecutivo_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
  v_op_id uuid;
  v_codigo text;
  v_titulo text;
  v_ejecutivo_id uuid := p_ejecutivo_id;
  v_notas_arr jsonb := '[]'::jsonb;
  v_admin_id uuid;
  v_tipo_cliente text;
BEGIN
  IF p_nombre IS NULL OR trim(p_nombre) = '' THEN
    RAISE EXCEPTION 'El nombre del cliente o prospecto es obligatorio.';
  END IF;

  -- Determinar tipo_cliente ('natural' o 'juridica')
  IF p_nombre ~* '(spa|ltda|s\.a|eirl|sociedad|inversiones|constructora)' OR (p_rut IS NOT NULL AND p_rut ~ '^(7|8|9)[0-9]') THEN
    v_tipo_cliente := 'juridica';
  ELSE
    v_tipo_cliente := 'natural';
  END IF;

  -- 1. Buscar si ya existe el cliente por teléfono, correo o RUT
  SELECT id INTO v_cliente_id
  FROM public.clientes
  WHERE (p_rut IS NOT NULL AND trim(p_rut) <> '' AND rut = trim(p_rut))
     OR (p_telefono IS NOT NULL AND trim(p_telefono) <> '' AND telefono = trim(p_telefono))
     OR (p_correo IS NOT NULL AND trim(p_correo) <> '' AND lower(correo) = lower(trim(p_correo)))
  LIMIT 1;

  -- Si no existe, crearlo
  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (
      nombre,
      apellido_razon_social,
      rut,
      telefono,
      correo,
      direccion,
      comuna,
      region,
      tipo_cliente,
      tipo_venta
    ) VALUES (
      trim(p_nombre),
      trim(p_nombre),
      NULLIF(trim(p_rut), ''),
      NULLIF(trim(p_telefono), ''),
      NULLIF(lower(trim(p_correo)), ''),
      NULLIF(trim(p_direccion), ''),
      NULLIF(trim(p_comuna), ''),
      COALESCE(NULLIF(trim(p_region), ''), 'Región Metropolitana'),
      v_tipo_cliente,
      COALESCE(NULLIF(trim(p_tipo_venta), ''), 'Instalación')
    )
    RETURNING id INTO v_cliente_id;
  ELSE
    -- Si ya existe pero no tenía dirección o comuna, complementarlo
    UPDATE public.clientes
    SET direccion = COALESCE(direccion, NULLIF(trim(p_direccion), '')),
        comuna = COALESCE(comuna, NULLIF(trim(p_comuna), '')),
        region = COALESCE(region, NULLIF(trim(p_region), ''))
    WHERE id = v_cliente_id;
  END IF;

  -- 2. Resolver ejecutivo comercial si no vino especificado
  IF v_ejecutivo_id IS NULL THEN
    SELECT id INTO v_ejecutivo_id
    FROM public.usuarios
    WHERE activo = true AND rol IN ('user', 'admin')
    ORDER BY (CASE WHEN rol = 'user' THEN 1 ELSE 2 END), created_at ASC
    LIMIT 1;
  END IF;

  -- 3. Generar código único correlativo
  v_codigo := 'OP-2026-' || lpad(floor(random() * 9000 + 1000)::text, 4, '0');
  v_titulo := COALESCE(NULLIF(trim(p_titulo), ''), 'Prospecto ' || COALESCE(p_origen, 'Bot') || ' - ' || trim(p_nombre));

  IF p_notas IS NOT NULL AND trim(p_notas) <> '' THEN
    v_notas_arr := jsonb_build_array(
      jsonb_build_object(
        'fecha', NOW(),
        'texto', trim(p_notas),
        'autor', 'Bot Ingestion (' || COALESCE(p_origen, 'ClickUp/WhatsApp') || ')'
      )
    );
  END IF;

  -- 4. Crear oportunidad en etapa nueva
  INSERT INTO public.oportunidades (
    codigo,
    titulo,
    cliente_id,
    estado_pipeline,
    fecha_inicio,
    tipo_venta,
    modalidad_requerimiento,
    origen,
    monto_abonado,
    monto_estimado,
    asignado_a,
    prioridad,
    productos,
    notas_venta,
    comision_porcentaje,
    comision_estado
  ) VALUES (
    v_codigo,
    v_titulo,
    v_cliente_id,
    'nueva',
    CURRENT_DATE,
    COALESCE(NULLIF(trim(p_tipo_venta), ''), 'Instalación'),
    COALESCE(NULLIF(trim(p_modalidad_requerimiento), ''), 'instalacion'),
    COALESCE(NULLIF(trim(p_origen), ''), 'WhatsApp Bot'),
    0,
    0,
    v_ejecutivo_id,
    'media',
    '[]'::jsonb,
    v_notas_arr,
    3.00,
    'pendiente'
  )
  RETURNING id INTO v_op_id;

  -- 5. Crear notificación interna para el equipo comercial
  FOR v_admin_id IN SELECT id FROM public.usuarios WHERE activo = true AND rol IN ('admin', 'user') LOOP
    INSERT INTO public.notificaciones (
      usuario_id,
      mensaje,
      tipo,
      leido,
      entidad_relacionada,
      fecha,
      link_url
    ) VALUES (
      v_admin_id,
      'Nuevo prospecto recibido: ' || v_titulo || ' (' || v_codigo || ')',
      'sistema',
      false,
      'oportunidad',
      NOW(),
      '/ventas/' || v_op_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'cliente_id', v_cliente_id,
    'oportunidad_id', v_op_id,
    'codigo', v_codigo,
    'titulo', v_titulo,
    'estado_pipeline', 'nueva'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_lead_externo(text, text, text, text, text, text, text, text, text, text, text, text, uuid) TO anon, authenticated, service_role;
