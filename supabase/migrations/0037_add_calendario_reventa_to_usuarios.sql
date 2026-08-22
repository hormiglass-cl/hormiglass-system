-- ==============================================================================
-- Migración 0037: Agregar columna calendario_reventa a public.usuarios
-- ==============================================================================

ALTER TABLE public.usuarios 
  ADD COLUMN IF NOT EXISTS calendario_reventa BOOLEAN DEFAULT true;
