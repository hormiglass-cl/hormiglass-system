-- La fuente Dolibarr omite RUT en la mayoría de los registros. El RUT sigue
-- validándose cuando se informa; NULL significa que todavía no se obtuvo.
ALTER TABLE public.clientes ALTER COLUMN rut DROP NOT NULL;
ALTER TABLE public.proveedores ALTER COLUMN rut DROP NOT NULL;
ALTER TABLE public.trabajadores ALTER COLUMN rut DROP NOT NULL;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS dolibarr_id TEXT,
  ADD COLUMN IF NOT EXISTS telefonos_secundarios TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vendedor_historico_id UUID REFERENCES public.trabajadores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS canal_origen TEXT,
  ADD COLUMN IF NOT EXISTS estado_dolibarr TEXT,
  ADD COLUMN IF NOT EXISTS codigo_dolibarr TEXT,
  ADD COLUMN IF NOT EXISTS alias TEXT,
  ADD COLUMN IF NOT EXISTS empresa_matriz TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS clientes_dolibarr_id_key
  ON public.clientes(dolibarr_id) WHERE dolibarr_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS clientes_vendedor_historico_idx
  ON public.clientes(vendedor_historico_id);

ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS dolibarr_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS proveedores_dolibarr_id_key
  ON public.proveedores(dolibarr_id) WHERE dolibarr_id IS NOT NULL;

ALTER TABLE public.trabajadores ADD COLUMN IF NOT EXISTS origen_dolibarr BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.notas_actividad
  ADD COLUMN IF NOT EXISTS autor_historico TEXT,
  ADD COLUMN IF NOT EXISTS dolibarr_origen_id TEXT,
  ADD COLUMN IF NOT EXISTS dolibarr_tipo TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS notas_dolibarr_origen_key
  ON public.notas_actividad(dolibarr_origen_id, dolibarr_tipo)
  WHERE dolibarr_origen_id IS NOT NULL;

-- La ficha y otras pantallas consultan también la vista cronológica.
CREATE OR REPLACE VIEW public.v_timeline_cliente
WITH (security_invoker = true)
AS
SELECT
  n.id AS registro_id,
  'cliente'::text AS origen,
  n.cliente_id,
  NULL::uuid AS oportunidad_id,
  NULL::text AS oportunidad_codigo,
  n.usuario_id,
  COALESCE(u.nombre, n.autor_historico, 'Sistema') AS usuario_nombre,
  COALESCE(n.tipo_actividad, 'nota')::text AS tipo,
  n.contenido,
  n.fecha_recordatorio,
  n.hora_recordatorio,
  n.fecha AS fecha_evento
FROM public.notas_actividad n
LEFT JOIN public.usuarios u ON u.id = n.usuario_id
UNION ALL
SELECT
  a.id AS registro_id,
  'oportunidad'::text AS origen,
  COALESCE(a.cliente_id, o.cliente_id) AS cliente_id,
  a.oportunidad_id,
  o.codigo AS oportunidad_codigo,
  a.usuario_id,
  COALESCE(a.usuario_nombre, u.nombre, 'Sistema') AS usuario_nombre,
  COALESCE(a.tipo, 'comentario')::text AS tipo,
  a.contenido,
  a.fecha_recordatorio,
  a.hora_recordatorio,
  a.created_at AS fecha_evento
FROM public.actividades_op a
LEFT JOIN public.oportunidades o ON o.id = a.oportunidad_id
LEFT JOIN public.usuarios u ON u.id = a.usuario_id;
