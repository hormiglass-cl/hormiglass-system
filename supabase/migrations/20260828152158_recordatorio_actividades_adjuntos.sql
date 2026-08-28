-- 0043: Adjuntos en el feed de actividad de tasks administrativas.

ALTER TABLE public.recordatorio_actividades
  ADD COLUMN IF NOT EXISTS archivo_bucket TEXT,
  ADD COLUMN IF NOT EXISTS archivo_path TEXT,
  ADD COLUMN IF NOT EXISTS archivo_nombre TEXT,
  ADD COLUMN IF NOT EXISTS archivo_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS archivo_size_bytes BIGINT CHECK (archivo_size_bytes IS NULL OR archivo_size_bytes >= 0);

ALTER TABLE public.recordatorio_actividades
  DROP CONSTRAINT IF EXISTS recordatorio_actividades_tipo_check;

ALTER TABLE public.recordatorio_actividades
  ADD CONSTRAINT recordatorio_actividades_tipo_check
  CHECK (tipo IN ('comentario', 'creacion', 'estado_cambiado', 'urgencia_cambiada', 'actualizacion', 'archivo'))
  NOT VALID;

UPDATE public.recordatorio_actividades
SET tipo = 'actualizacion'
WHERE tipo NOT IN ('comentario', 'creacion', 'estado_cambiado', 'urgencia_cambiada', 'actualizacion', 'archivo');

ALTER TABLE public.recordatorio_actividades
  VALIDATE CONSTRAINT recordatorio_actividades_tipo_check;

DROP POLICY IF EXISTS "recordatorios_adjuntos_select" ON storage.objects;
DROP POLICY IF EXISTS "recordatorios_adjuntos_insert" ON storage.objects;

CREATE POLICY "recordatorios_adjuntos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'administracion'
    AND EXISTS (
      SELECT 1
      FROM public.recordatorios r
      WHERE r.id = CASE
          WHEN storage.objects.name ~ '^recordatorios/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
            THEN split_part(storage.objects.name, '/', 2)::uuid
          ELSE NULL
        END
        AND (r.asignado_a_id = public.current_usuario_id() OR public.has_role('admin'))
    )
  );

CREATE POLICY "recordatorios_adjuntos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'administracion'
    AND EXISTS (
      SELECT 1
      FROM public.recordatorios r
      WHERE r.id = CASE
          WHEN storage.objects.name ~ '^recordatorios/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
            THEN split_part(storage.objects.name, '/', 2)::uuid
          ELSE NULL
        END
        AND (r.asignado_a_id = public.current_usuario_id() OR public.has_role('admin'))
    )
  );

COMMENT ON COLUMN public.recordatorio_actividades.archivo_path IS 'Ruta privada del adjunto asociado a una actividad de task.';
