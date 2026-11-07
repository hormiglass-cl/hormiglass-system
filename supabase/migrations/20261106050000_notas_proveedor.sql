-- Bitácora de la ficha de proveedor: notas, reuniones, llamadas, recordatorios (avisos) y reclamos.
CREATE TABLE IF NOT EXISTS public.notas_proveedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  contenido TEXT NOT NULL,
  tipo_actividad TEXT NOT NULL DEFAULT 'nota'
    CHECK (tipo_actividad IN ('nota', 'reunion', 'llamada', 'recordatorio', 'reclamo')),
  fecha_recordatorio DATE,
  hora_recordatorio TIME,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notas_proveedor_proveedor_id ON public.notas_proveedor (proveedor_id);

ALTER TABLE public.notas_proveedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notas_proveedor_select" ON public.notas_proveedor FOR SELECT TO authenticated USING (is_active_user());
CREATE POLICY "notas_proveedor_insert" ON public.notas_proveedor FOR INSERT TO authenticated WITH CHECK (is_active_user());
CREATE POLICY "notas_proveedor_update" ON public.notas_proveedor FOR UPDATE TO authenticated USING (has_role('admin'));
CREATE POLICY "notas_proveedor_delete" ON public.notas_proveedor FOR DELETE TO authenticated USING (has_role('admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.notas_proveedor;
