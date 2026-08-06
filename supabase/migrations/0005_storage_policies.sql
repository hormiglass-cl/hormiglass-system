-- 0005: Políticas de seguridad para buckets de Supabase Storage.

-- Asegurar que existan los buckets de Storage
INSERT INTO storage.buckets (id, name, public)
VALUES
    ('cotizaciones-pdf', 'cotizaciones-pdf', true),
    ('documentos', 'documentos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Habilitar RLS en storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas antiguas de storage
DROP POLICY IF EXISTS "Permitir lectura pública cotizaciones-pdf" ON storage.objects;
DROP POLICY IF EXISTS "Permitir subida autenticada cotizaciones-pdf" ON storage.objects;
DROP POLICY IF EXISTS "Permitir lectura pública documentos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir subida autenticada documentos" ON storage.objects;

-- 1. cotizaciones-pdf
CREATE POLICY "cotizaciones_pdf_public_select" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'cotizaciones-pdf');

CREATE POLICY "cotizaciones_pdf_authenticated_insert" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'cotizaciones-pdf' AND is_active_user());

CREATE POLICY "cotizaciones_pdf_authenticated_update" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'cotizaciones-pdf' AND is_active_user());

CREATE POLICY "cotizaciones_pdf_authenticated_delete" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'cotizaciones-pdf' AND is_active_user());

-- 2. documentos (Comprobantes de Pago y Archivos Adjuntos)
CREATE POLICY "documentos_public_select" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'documentos');

CREATE POLICY "documentos_authenticated_insert" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documentos' AND is_active_user());

CREATE POLICY "documentos_authenticated_update" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'documentos' AND is_active_user());

CREATE POLICY "documentos_authenticated_delete" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'documentos' AND is_active_user());
