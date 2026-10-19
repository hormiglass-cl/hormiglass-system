-- ============================================================================
-- Migración: 20261019110000_corregir_alta_usuarios_y_trabajadores.sql
-- Descripción: Corrección atómica del alta de usuarios y sincronización con trabajadores
-- 1. Elimina confirmed_at de INSERT INTO auth.users (columna generada automáticamente).
-- 2. Elimina RUT hardcodeado en trigger handle_sync_usuario_to_trabajador().
-- 3. Asigna atómicamente estado activo y los 3 calendarios en public.usuarios.
-- ============================================================================

-- 1. Actualizar trigger handle_sync_usuario_to_trabajador()
CREATE OR REPLACE FUNCTION public.handle_sync_usuario_to_trabajador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.trabajadores WHERE lower(email) = lower(NEW.email)) THEN
      UPDATE public.trabajadores
      SET usuario_id = NEW.id,
          nombre = NEW.nombre,
          activo = NEW.activo,
          cargo = CASE 
            WHEN NEW.rol = 'admin' THEN 'Gerente General & Ventas'
            WHEN NEW.rol = 'mano_obra' THEN 'Operario / Mano de Obra'
            WHEN NEW.rol = 'finanzas' THEN 'Encargado de Finanzas & Caja'
            ELSE 'Ejecutivo Comercial & Ventas'
          END,
          area = CASE 
            WHEN NEW.rol = 'mano_obra' THEN 'Operaciones & Terreno'
            WHEN NEW.rol = 'finanzas' THEN 'Finanzas & Administración'
            ELSE 'Comercial & Ventas'
          END,
          updated_at = now()
      WHERE lower(email) = lower(NEW.email);
    ELSE
      INSERT INTO public.trabajadores (
        usuario_id,
        nombre,
        rut,
        email,
        cargo,
        area,
        tipo_contrato,
        sueldo_base,
        estado_disponibilidad,
        activo,
        fecha_ingreso,
        comuna,
        region
      ) VALUES (
        NEW.id,
        NEW.nombre,
        'PROV-' || UPPER(substr(replace(NEW.id::text, '-', ''), 1, 8)),
        NEW.email,
        CASE 
          WHEN NEW.rol = 'admin' THEN 'Gerente General & Ventas'
          WHEN NEW.rol = 'mano_obra' THEN 'Operario / Mano de Obra'
          WHEN NEW.rol = 'finanzas' THEN 'Encargado de Finanzas & Caja'
          ELSE 'Ejecutivo Comercial & Ventas'
        END,
        CASE 
          WHEN NEW.rol = 'mano_obra' THEN 'Operaciones & Terreno'
          WHEN NEW.rol = 'finanzas' THEN 'Finanzas & Administración'
          ELSE 'Comercial & Ventas'
        END,
        'Indefinido',
        950000,
        'disponible',
        NEW.activo,
        CURRENT_DATE,
        'San Bernardo',
        'Metropolitana de Santiago'
      );
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.trabajadores
    SET nombre = NEW.nombre,
        email = NEW.email,
        activo = NEW.activo,
        cargo = CASE 
          WHEN NEW.rol = 'admin' THEN 'Gerente General & Ventas'
          WHEN NEW.rol = 'mano_obra' THEN 'Operario / Mano de Obra'
          WHEN NEW.rol = 'finanzas' THEN 'Encargado de Finanzas & Caja'
          ELSE 'Ejecutivo Comercial & Ventas'
        END,
        area = CASE 
          WHEN NEW.rol = 'mano_obra' THEN 'Operaciones & Terreno'
          WHEN NEW.rol = 'finanzas' THEN 'Finanzas & Administración'
          ELSE 'Comercial & Ventas'
        END,
        updated_at = now()
    WHERE usuario_id = NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.trabajadores
    SET activo = false,
        updated_at = now()
    WHERE usuario_id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Función RPC create_user_admin (versión completa con 8 argumentos)
CREATE OR REPLACE FUNCTION public.create_user_admin(
  p_email text,
  p_password text,
  p_nombre text DEFAULT NULL::text,
  p_rol text DEFAULT 'user'::text,
  p_cal_visitas boolean DEFAULT true,
  p_cal_produccion boolean DEFAULT true,
  p_cal_reventa boolean DEFAULT true,
  p_rut text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_caller_role text;
  v_new_user_id uuid := gen_random_uuid();
  v_new_identity_id uuid := gen_random_uuid();
  v_nombre text;
  v_email text;
BEGIN
  -- 1. Verificar que el usuario activo sea admin
  SELECT rol INTO v_caller_role 
  FROM public.usuarios 
  WHERE auth_id = auth.uid() AND activo = true;

  IF v_caller_role IS NULL OR v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'No tienes permisos de administrador para crear usuarios.';
  END IF;

  v_email := lower(trim(p_email));

  -- 2. Validar que el correo no exista en auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'El correo % ya se encuentra registrado en el sistema.', v_email;
  END IF;

  v_nombre := COALESCE(nullif(trim(p_nombre), ''), split_part(v_email, '@', 1));

  -- 3. Crear usuario en auth.users (sin confirmed_at ya que es columna generada en Postgres)
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    phone_change,
    phone_change_token,
    email_change_token_current,
    reauthentication_token,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    is_sso_user,
    is_anonymous
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nombre', v_nombre),
    now(),
    now(),
    false,
    false
  );

  -- 4. Crear identidad en auth.identities
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_new_identity_id,
    v_new_user_id,
    jsonb_build_object('sub', v_new_user_id::text, 'email', v_email, 'email_verified', true),
    'email',
    v_new_user_id::text,
    now(),
    now(),
    now()
  );

  -- 5. Actualizar rol, activo y preferencias de los 3 calendarios en public.usuarios
  UPDATE public.usuarios
  SET rol = COALESCE(p_rol, 'user'),
      activo = true,
      calendario_visitas = COALESCE(p_cal_visitas, true),
      calendario_produccion = COALESCE(p_cal_produccion, true),
      calendario_reventa = COALESCE(p_cal_reventa, true),
      nombre = v_nombre
  WHERE auth_id = v_new_user_id;

  -- 6. Si se especificó un RUT explícito, sincronizarlo en trabajadores
  IF p_rut IS NOT NULL AND trim(p_rut) <> '' THEN
    UPDATE public.trabajadores
    SET rut = trim(p_rut)
    WHERE usuario_id = (SELECT id FROM public.usuarios WHERE auth_id = v_new_user_id);
  END IF;

  -- 7. Registro de auditoría en logs_sistema
  INSERT INTO public.logs_sistema (
    tipo_accion,
    entidad,
    entidad_id,
    descripcion,
    usuario_id,
    datos_nuevos
  ) VALUES (
    'crear',
    'usuarios',
    v_new_user_id::text,
    'Usuario registrado en sistema: ' || v_email,
    (SELECT id FROM public.usuarios WHERE auth_id = auth.uid()),
    jsonb_build_object(
      'email', v_email,
      'nombre', v_nombre,
      'rol', COALESCE(p_rol, 'user'),
      'cal_visitas', COALESCE(p_cal_visitas, true),
      'cal_produccion', COALESCE(p_cal_produccion, true),
      'cal_reventa', COALESCE(p_cal_reventa, true)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_new_user_id,
    'email', v_email
  );
END;
$$;

-- 3. Delegación de la firma de 4 argumentos para compatibilidad histórica
CREATE OR REPLACE FUNCTION public.create_user_admin(
  p_email text,
  p_password text,
  p_nombre text DEFAULT NULL::text,
  p_rol text DEFAULT 'user'::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN public.create_user_admin(p_email, p_password, p_nombre, p_rol, true, true, true, NULL);
END;
$$;

-- Permisos seguros
REVOKE ALL ON FUNCTION public.create_user_admin(text, text, text, text, boolean, boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_user_admin(text, text, text, text, boolean, boolean, boolean, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_user_admin(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_user_admin(text, text, text, text) TO authenticated, service_role;
