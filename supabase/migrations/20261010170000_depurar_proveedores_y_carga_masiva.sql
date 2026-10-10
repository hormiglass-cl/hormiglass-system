-- Migración Fase 5: Depurar proveedores demo, normalizar nombres, agregar campos y función de carga masiva
-- 10 de octubre de 2026

-- 1. Eliminar proveedor demo residual si existe
DELETE FROM public.proveedores
WHERE rut = 'DEMO-PROVEEDOR-01'
   OR id = 'b3eae417-db43-43f0-9803-c1df45776fd9';

-- 2. Normalizar nombre del proveedor Macbal a su razón social oficial
UPDATE public.proveedores
SET nombre = 'MACBAL S.A.'
WHERE id = '56aa5c16-59a4-4361-955c-e59b7ad2629a'
   OR nombre ILIKE '%MAC-BAL SA CODEX TEST%';

-- 3. Columnas opcionales para mayor completitud del catálogo de proveedores
ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS rubro text,
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- 4. Índice único sobre el RUT normalizado (sin puntos, guiones ni espacios)
CREATE UNIQUE INDEX IF NOT EXISTS uq_proveedores_rut_norm
  ON public.proveedores (lower(regexp_replace(rut, '[^0-9kK]', '', 'g')));

-- 5. Función RPC para carga masiva y upsert de proveedores
CREATE OR REPLACE FUNCTION public.upsert_proveedores_masivo(
  p_proveedores jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_rut text;
  v_rut_norm text;
  v_nombre text;
  v_contacto text;
  v_telefono text;
  v_correo text;
  v_direccion text;
  v_comuna text;
  v_region text;
  v_rubro text;
  v_inserted int := 0;
  v_updated int := 0;
  v_existing_id uuid;
BEGIN
  -- Validar permisos: rol activo con privilegios de gestión
  IF NOT (
    public.has_role('admin'::text) OR 
    public.has_role('user'::text) OR 
    public.has_role('finanzas'::text)
  ) THEN
    RAISE EXCEPTION 'Permiso denegado: solo usuarios autorizados pueden importar proveedores.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_proveedores)
  LOOP
    v_rut := trim(COALESCE(v_item->>'rut', ''));
    v_nombre := trim(COALESCE(v_item->>'nombre', ''));
    v_contacto := nullif(trim(COALESCE(v_item->>'contacto', '')), '');
    v_telefono := nullif(trim(COALESCE(v_item->>'telefono', '')), '');
    v_correo := nullif(trim(COALESCE(v_item->>'correo', '')), '');
    v_direccion := nullif(trim(COALESCE(v_item->>'direccion', '')), '');
    v_comuna := nullif(trim(COALESCE(v_item->>'comuna', '')), '');
    v_region := nullif(trim(COALESCE(v_item->>'region', '')), '');
    v_rubro := nullif(trim(COALESCE(v_item->>'rubro', '')), '');

    -- Saltar registros sin RUT o sin Nombre
    IF v_rut = '' OR v_nombre = '' THEN
      CONTINUE;
    END IF;

    v_rut_norm := lower(regexp_replace(v_rut, '[^0-9kK]', '', 'g'));

    -- Buscar si ya existe por RUT normalizado
    SELECT id INTO v_existing_id
    FROM public.proveedores
    WHERE lower(regexp_replace(rut, '[^0-9kK]', '', 'g')) = v_rut_norm
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Actualizar datos preservando ID para no romper llaves foráneas existentes
      UPDATE public.proveedores
      SET
        nombre = v_nombre,
        contacto = COALESCE(v_contacto, contacto),
        telefono = COALESCE(v_telefono, telefono),
        correo = COALESCE(v_correo, correo),
        direccion = COALESCE(v_direccion, direccion),
        comuna = COALESCE(v_comuna, comuna),
        region = COALESCE(v_region, region),
        rubro = COALESCE(v_rubro, rubro),
        activo = true
      WHERE id = v_existing_id;

      v_updated := v_updated + 1;
    ELSE
      -- Insertar nuevo proveedor
      INSERT INTO public.proveedores (
        nombre,
        rut,
        contacto,
        telefono,
        correo,
        direccion,
        comuna,
        region,
        rubro,
        activo
      ) VALUES (
        v_nombre,
        v_rut,
        v_contacto,
        v_telefono,
        v_correo,
        v_direccion,
        v_comuna,
        v_region,
        v_rubro,
        true
      );

      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  -- Registrar en log del sistema si la tabla existe
  INSERT INTO public.logs_sistema (
    usuario_id,
    evento,
    detalles
  ) VALUES (
    auth.uid(),
    'carga_masiva_proveedores',
    jsonb_build_object(
      'insertados', v_inserted,
      'actualizados', v_updated,
      'total_procesados', (v_inserted + v_updated)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'insertados', v_inserted,
    'actualizados', v_updated,
    'total', (v_inserted + v_updated)
  );
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.upsert_proveedores_masivo(jsonb) TO authenticated;
