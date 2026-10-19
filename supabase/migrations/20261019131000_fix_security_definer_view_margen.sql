-- ==============================================================================
-- Migración: Corrige vulnerabilidad Security Definer en public.v_margen_por_nv
-- Fecha: 19 de Octubre 2026
-- Objetivo: Configurar security_invoker = true en la vista v_margen_por_nv para
--           respetar las políticas de RLS de las tablas base (oportunidades, abonos,
--           cotizaciones, clientes, etc.) y revocar accesos anónimos.
-- ==============================================================================

-- 1. Establecer security_invoker = true para que la vista ejecute con los permisos
--    y filtros RLS del usuario que realiza la consulta (SECURITY INVOKER)
ALTER VIEW public.v_margen_por_nv SET (security_invoker = true);

-- 2. Restricción de privilegios: Revocar acceso anónimo/público y mantener solo autenticados
REVOKE ALL ON TABLE public.v_margen_por_nv FROM anon, public;
GRANT SELECT ON TABLE public.v_margen_por_nv TO authenticated;
