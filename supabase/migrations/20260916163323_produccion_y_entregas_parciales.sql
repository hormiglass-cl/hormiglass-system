CREATE TABLE public.ordenes_produccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidad_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'planificada' CHECK (estado IN ('planificada', 'en_curso', 'completada', 'cancelada')),
  fecha_inicio date,
  fecha_objetivo date,
  responsable_id uuid REFERENCES public.usuarios(id),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oportunidades
  ADD COLUMN entrega_manual_confirmada boolean NOT NULL DEFAULT false,
  ADD COLUMN entrega_manual_motivo text,
  ADD CONSTRAINT oportunidades_entrega_manual_motivo_check
  CHECK (NOT entrega_manual_confirmada OR nullif(trim(entrega_manual_motivo), '') IS NOT NULL);

CREATE TABLE public.orden_produccion_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_produccion_id uuid NOT NULL REFERENCES public.ordenes_produccion(id) ON DELETE CASCADE,
  cotizacion_item_id uuid REFERENCES public.cotizacion_items(id),
  producto text NOT NULL,
  cantidad_objetivo numeric(12,2) NOT NULL CHECK (cantidad_objetivo > 0),
  unidad text
);

ALTER TABLE public.produccion_diaria
  ADD COLUMN orden_produccion_id uuid REFERENCES public.ordenes_produccion(id) ON DELETE SET NULL;

CREATE TABLE public.guias_despacho (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidad_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  numero_guia text NOT NULL UNIQUE,
  estado text NOT NULL DEFAULT 'planificada' CHECK (estado IN ('planificada', 'cargada', 'entregada', 'cancelada')),
  fecha_salida timestamptz,
  origen text,
  destino text,
  vehiculo text,
  chofer text,
  carga_verificada boolean NOT NULL DEFAULT false,
  entrega_conforme boolean NOT NULL DEFAULT false,
  confirmada_manualmente boolean NOT NULL DEFAULT false,
  entrega_manual_motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT confirmada_manualmente OR nullif(trim(entrega_manual_motivo), '') IS NOT NULL)
);

CREATE TABLE public.guia_despacho_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guia_despacho_id uuid NOT NULL REFERENCES public.guias_despacho(id) ON DELETE CASCADE,
  cotizacion_item_id uuid REFERENCES public.cotizacion_items(id),
  producto text NOT NULL,
  cantidad_planificada numeric(12,2) NOT NULL CHECK (cantidad_planificada > 0),
  cantidad_cargada numeric(12,2) NOT NULL DEFAULT 0 CHECK (cantidad_cargada >= 0),
  cantidad_recibida numeric(12,2) NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0),
  CONSTRAINT guia_despacho_items_cantidades_check CHECK (
    cantidad_recibida <= cantidad_cargada AND cantidad_cargada <= cantidad_planificada
  )
);

CREATE TABLE public.guia_despacho_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guia_despacho_id uuid NOT NULL REFERENCES public.guias_despacho(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('carga', 'firma', 'conformidad', 'otro')),
  nombre text NOT NULL,
  archivo_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eventos_produccion_logistica
  ADD COLUMN guia_despacho_id uuid REFERENCES public.guias_despacho(id) ON DELETE SET NULL;

CREATE INDEX ordenes_produccion_op_idx ON public.ordenes_produccion (oportunidad_id);
CREATE INDEX orden_produccion_items_orden_idx ON public.orden_produccion_items (orden_produccion_id);
CREATE INDEX produccion_diaria_orden_idx ON public.produccion_diaria (orden_produccion_id);
CREATE INDEX guias_despacho_op_idx ON public.guias_despacho (oportunidad_id);
CREATE INDEX guia_despacho_items_guia_idx ON public.guia_despacho_items (guia_despacho_id);
CREATE INDEX guia_despacho_documentos_guia_idx ON public.guia_despacho_documentos (guia_despacho_id);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ordenes_produccion', 'orden_produccion_items', 'guias_despacho', 'guia_despacho_items', 'guia_despacho_documentos']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_active_user())', table_name || '_select', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_role(''user''))', table_name || '_insert', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_role(''user'')) WITH CHECK (public.has_role(''user''))', table_name || '_update', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_role(''user''))', table_name || '_delete', table_name);
  END LOOP;
END;
$$;

-- El bucket `administracion` ya es privado. Se agrega acceso acotado al prefijo de entregas.
CREATE POLICY entregas_documentos_select ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'administracion' AND public.is_active_user() AND
    EXISTS (SELECT 1 FROM public.guias_despacho g WHERE g.id = CASE
      WHEN name ~ '^entregas/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
      THEN split_part(name, '/', 2)::uuid ELSE NULL END)
  );
CREATE POLICY entregas_documentos_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'administracion' AND public.has_role('user') AND
    EXISTS (SELECT 1 FROM public.guias_despacho g WHERE g.id = CASE
      WHEN name ~ '^entregas/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
      THEN split_part(name, '/', 2)::uuid ELSE NULL END)
  );
CREATE POLICY entregas_documentos_update ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'administracion' AND public.has_role('user') AND name LIKE 'entregas/%'
  ) WITH CHECK (
    bucket_id = 'administracion' AND public.has_role('user') AND name LIKE 'entregas/%'
  );
CREATE POLICY entregas_documentos_delete ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'administracion' AND public.has_role('user') AND name LIKE 'entregas/%'
  );
