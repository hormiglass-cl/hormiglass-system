-- Migración: Empresas, Cuentas Bancarias y Rol Finanzas (Fase 1)
-- Fecha: 2026-10-07

-- 1. Ampliar check de roles en public.usuarios para incluir 'finanzas'
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_rol_check 
  CHECK (rol IN ('admin', 'user', 'mano_obra', 'finanzas'));

-- 2. Crear tabla empresas
CREATE TABLE IF NOT EXISTS public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  razon_social TEXT NOT NULL,
  rut TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Sembrar las 3 empresas de Hormiglass manteniendo los slugs actuales
INSERT INTO public.empresas (slug, razon_social, rut, activo)
VALUES
  ('comercial', 'Soc Comercial Hormiglass', '76.391.215-9', true),
  ('transportes', 'Soc Transportes Hormiglass', '77.148.997-4', true),
  ('inmobiliaria', 'Soc Inmobiliaria Hormiglass', '77.615.313-3', true)
ON CONFLICT (slug) DO UPDATE
SET razon_social = EXCLUDED.razon_social,
    rut = EXCLUDED.rut,
    activo = EXCLUDED.activo;

-- 3. Crear tabla cuentas_bancarias
CREATE TABLE IF NOT EXISTS public.cuentas_bancarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  banco TEXT NOT NULL,
  tipo_cuenta TEXT NOT NULL DEFAULT 'corriente',
  numero_cuenta TEXT,
  alias TEXT NOT NULL,
  saldo_inicial NUMERIC(14,2) NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Sembrar las cuentas iniciales asociadas a las 3 empresas (borrador de las 8 cuentas)
DO $$
DECLARE
  v_emp_comercial UUID;
  v_emp_transportes UUID;
  v_emp_inmobiliaria UUID;
BEGIN
  SELECT id INTO v_emp_comercial FROM public.empresas WHERE slug = 'comercial';
  SELECT id INTO v_emp_transportes FROM public.empresas WHERE slug = 'transportes';
  SELECT id INTO v_emp_inmobiliaria FROM public.empresas WHERE slug = 'inmobiliaria';

  -- Comercial: Santander, Mercado Pago, Efectivo
  IF NOT EXISTS (SELECT 1 FROM public.cuentas_bancarias WHERE alias = 'Santander Comercial') THEN
    INSERT INTO public.cuentas_bancarias (empresa_id, banco, tipo_cuenta, numero_cuenta, alias, saldo_inicial, activo)
    VALUES (v_emp_comercial, 'Banco Santander', 'corriente', '', 'Santander Comercial', 0, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cuentas_bancarias WHERE alias = 'Mercado Pago Comercial') THEN
    INSERT INTO public.cuentas_bancarias (empresa_id, banco, tipo_cuenta, numero_cuenta, alias, saldo_inicial, activo)
    VALUES (v_emp_comercial, 'Mercado Pago', 'mercado_pago', '', 'Mercado Pago Comercial', 0, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cuentas_bancarias WHERE alias = 'Caja Chica Efectivo') THEN
    INSERT INTO public.cuentas_bancarias (empresa_id, banco, tipo_cuenta, numero_cuenta, alias, saldo_inicial, activo)
    VALUES (v_emp_comercial, 'Efectivo / Caja Chica', 'efectivo', '', 'Caja Chica Efectivo', 0, true);
  END IF;

  -- Transportes: Scotiabank, Santander
  IF NOT EXISTS (SELECT 1 FROM public.cuentas_bancarias WHERE alias = 'Scotiabank Transportes') THEN
    INSERT INTO public.cuentas_bancarias (empresa_id, banco, tipo_cuenta, numero_cuenta, alias, saldo_inicial, activo)
    VALUES (v_emp_transportes, 'Scotiabank', 'corriente', '', 'Scotiabank Transportes', 0, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cuentas_bancarias WHERE alias = 'Santander Transportes') THEN
    INSERT INTO public.cuentas_bancarias (empresa_id, banco, tipo_cuenta, numero_cuenta, alias, saldo_inicial, activo)
    VALUES (v_emp_transportes, 'Banco Santander', 'corriente', '', 'Santander Transportes', 0, true);
  END IF;

  -- Inmobiliaria: Scotiabank, Santander, Banco de Chile
  IF NOT EXISTS (SELECT 1 FROM public.cuentas_bancarias WHERE alias = 'Scotiabank Inmobiliaria') THEN
    INSERT INTO public.cuentas_bancarias (empresa_id, banco, tipo_cuenta, numero_cuenta, alias, saldo_inicial, activo)
    VALUES (v_emp_inmobiliaria, 'Scotiabank', 'corriente', '', 'Scotiabank Inmobiliaria', 0, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cuentas_bancarias WHERE alias = 'Santander Inmobiliaria') THEN
    INSERT INTO public.cuentas_bancarias (empresa_id, banco, tipo_cuenta, numero_cuenta, alias, saldo_inicial, activo)
    VALUES (v_emp_inmobiliaria, 'Banco Santander', 'corriente', '', 'Santander Inmobiliaria', 0, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cuentas_bancarias WHERE alias = 'Banco Chile Inmobiliaria') THEN
    INSERT INTO public.cuentas_bancarias (empresa_id, banco, tipo_cuenta, numero_cuenta, alias, saldo_inicial, activo)
    VALUES (v_emp_inmobiliaria, 'Banco de Chile', 'corriente', '', 'Banco Chile Inmobiliaria', 0, true);
  END IF;
END $$;

-- 4. Habilitar RLS en empresas y cuentas_bancarias
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY empresas_select ON public.empresas
  FOR SELECT TO authenticated
  USING (public.is_active_user());

CREATE POLICY empresas_write ON public.empresas
  FOR ALL TO authenticated
  USING (public.has_role('admin', 'finanzas'))
  WITH CHECK (public.has_role('admin', 'finanzas'));

CREATE POLICY cuentas_bancarias_select ON public.cuentas_bancarias
  FOR SELECT TO authenticated
  USING (public.is_active_user());

CREATE POLICY cuentas_bancarias_write ON public.cuentas_bancarias
  FOR ALL TO authenticated
  USING (public.has_role('admin', 'finanzas'))
  WITH CHECK (public.has_role('admin', 'finanzas'));

-- 5. Actualizar políticas de caja_movimientos y reportes_vistas
ALTER POLICY caja_movimientos_select ON public.caja_movimientos 
  USING (public.has_role('user', 'finanzas'));

ALTER POLICY caja_movimientos_insert ON public.caja_movimientos 
  WITH CHECK (public.has_role('user', 'finanzas') AND (usuario_id = public.current_usuario_id()));

ALTER POLICY caja_movimientos_update ON public.caja_movimientos 
  USING (public.has_role('admin', 'finanzas')) 
  WITH CHECK (public.has_role('admin', 'finanzas'));

ALTER POLICY caja_movimientos_delete ON public.caja_movimientos 
  USING (public.has_role('admin', 'finanzas'));

ALTER POLICY reportes_vistas_select ON public.reportes_vistas 
  USING ((usuario_id = public.current_usuario_id()) AND public.has_role('user', 'finanzas'));

ALTER POLICY reportes_vistas_insert ON public.reportes_vistas 
  WITH CHECK ((usuario_id = public.current_usuario_id()) AND public.has_role('user', 'finanzas'));

ALTER POLICY reportes_vistas_update ON public.reportes_vistas 
  USING ((usuario_id = public.current_usuario_id()) AND public.has_role('user', 'finanzas'))
  WITH CHECK ((usuario_id = public.current_usuario_id()) AND public.has_role('user', 'finanzas'));

ALTER POLICY reportes_vistas_delete ON public.reportes_vistas 
  USING ((usuario_id = public.current_usuario_id()) AND public.has_role('user', 'finanzas'));
