-- ==============================================================================
-- Migración: Ampliación de Catálogo de Productos y Maestro de Proveedores
-- Fecha: 07 de Octubre de 2026
-- Objetivo: Soportar los 340 productos del archivo Maestro_Productos_Hormiglass_Proveedores.xlsx
--           incluyendo origen (fabricación propia vs reventa), códigos de proveedor,
--           atributos técnicos (medidas, color, peso, familia) y flags de revisión OCR.
-- ==============================================================================

-- 1. Ampliar columnas en catalogo_productos para soportar el Maestro de Proveedores
ALTER TABLE public.catalogo_productos
  ADD COLUMN IF NOT EXISTS codigo_proveedor TEXT,
  ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT 'fabricacion_propia',
  ADD COLUMN IF NOT EXISTS familia TEXT,
  ADD COLUMN IF NOT EXISTS subcategoria TEXT,
  ADD COLUMN IF NOT EXISTS medidas TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS peso_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS requiere_revision BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS observaciones TEXT;

-- 2. Índices de optimización de búsqueda y filtrado
CREATE INDEX IF NOT EXISTS idx_catalogo_productos_codigo_proveedor ON public.catalogo_productos(codigo_proveedor);
CREATE INDEX IF NOT EXISTS idx_catalogo_productos_proveedor_id ON public.catalogo_productos(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_productos_origen ON public.catalogo_productos(origen);
CREATE INDEX IF NOT EXISTS idx_catalogo_productos_familia ON public.catalogo_productos(familia);
CREATE INDEX IF NOT EXISTS idx_catalogo_productos_requiere_revision ON public.catalogo_productos(requiere_revision);

-- 3. Asegurar proveedores de reventa en public.proveedores
INSERT INTO public.proveedores (nombre, rut, contacto)
SELECT 'Bottai S.A.', '91.025.000-7', 'Ventas Mayoristas Bottai'
WHERE NOT EXISTS (
  SELECT 1 FROM public.proveedores WHERE nombre ILIKE '%Bottai%'
);

INSERT INTO public.proveedores (nombre, rut, contacto)
SELECT 'Atrio Baldosas', '76.840.120-K', 'Ventas Distribución Atrio'
WHERE NOT EXISTS (
  SELECT 1 FROM public.proveedores WHERE nombre ILIKE '%Atrio%'
);
