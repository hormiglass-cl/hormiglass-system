-- 0038: Bucket privado para documentos de Administración.
-- A diferencia del bucket `documentos`, este bucket no es público y solo admin
-- puede listar, leer, subir, actualizar o eliminar objetos.

INSERT INTO storage.buckets (id, name, public)
VALUES ('administracion', 'administracion', false)
ON CONFLICT (id) DO UPDATE SET public = false;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "administracion_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "administracion_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "administracion_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "administracion_admin_delete" ON storage.objects;

CREATE POLICY "administracion_admin_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'administracion' AND public.has_role('admin'));

CREATE POLICY "administracion_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'administracion' AND public.has_role('admin'));

CREATE POLICY "administracion_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'administracion' AND public.has_role('admin'))
  WITH CHECK (bucket_id = 'administracion' AND public.has_role('admin'));

CREATE POLICY "administracion_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'administracion' AND public.has_role('admin'));
