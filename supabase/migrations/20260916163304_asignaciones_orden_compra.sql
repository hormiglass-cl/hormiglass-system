ALTER TABLE public.ordenes_compra
  ADD COLUMN tipo_compra text NOT NULL DEFAULT 'reventa'
  CHECK (tipo_compra IN ('reventa', 'insumos_fabricacion'));

UPDATE public.ordenes_compra AS oc
SET tipo_compra = 'insumos_fabricacion'
FROM public.oportunidades AS op
WHERE oc.oportunidad_id = op.id AND op.rama_destino = 'produccion';

CREATE TABLE public.orden_compra_asignaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_compra_id uuid NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  orden_compra_item_id uuid NOT NULL REFERENCES public.orden_compra_items(id) ON DELETE CASCADE,
  oportunidad_id uuid NOT NULL REFERENCES public.oportunidades(id),
  cantidad numeric(12,2) NOT NULL CHECK (cantidad > 0),
  costo_asignado numeric(12,2) NOT NULL DEFAULT 0 CHECK (costo_asignado >= 0),
  unidad text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (orden_compra_item_id, oportunidad_id)
);

CREATE INDEX orden_compra_asignaciones_oc_idx ON public.orden_compra_asignaciones (orden_compra_id);
CREATE INDEX orden_compra_asignaciones_op_idx ON public.orden_compra_asignaciones (oportunidad_id);

CREATE FUNCTION public.validar_asignacion_oc() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  item public.orden_compra_items%ROWTYPE;
  usado_cantidad numeric;
  usado_costo numeric;
BEGIN
  SELECT * INTO item FROM public.orden_compra_items
  WHERE id = NEW.orden_compra_item_id FOR UPDATE;
  IF NOT FOUND OR item.orden_compra_id <> NEW.orden_compra_id THEN
    RAISE EXCEPTION 'El ítem no pertenece a esta orden de compra';
  END IF;
  SELECT coalesce(sum(cantidad), 0), coalesce(sum(costo_asignado), 0)
  INTO usado_cantidad, usado_costo
  FROM public.orden_compra_asignaciones
  WHERE orden_compra_item_id = NEW.orden_compra_item_id AND id <> NEW.id;
  IF usado_cantidad + NEW.cantidad > item.cantidad THEN
    RAISE EXCEPTION 'La cantidad asignada supera el ítem de la OC';
  END IF;
  IF usado_costo + NEW.costo_asignado > item.total_item THEN
    RAISE EXCEPTION 'El costo asignado supera el total del ítem de la OC';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validar_asignacion_oc_before_write
  BEFORE INSERT OR UPDATE ON public.orden_compra_asignaciones
  FOR EACH ROW EXECUTE FUNCTION public.validar_asignacion_oc();

INSERT INTO public.orden_compra_asignaciones
  (orden_compra_id, orden_compra_item_id, oportunidad_id, cantidad, costo_asignado)
SELECT oc.id, item.id, oc.oportunidad_id, item.cantidad, item.total_item
FROM public.ordenes_compra AS oc
JOIN public.orden_compra_items AS item ON item.orden_compra_id = oc.id
WHERE oc.oportunidad_id IS NOT NULL AND item.cantidad > 0;

ALTER TABLE public.orden_compra_asignaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orden_compra_asignaciones FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orden_compra_asignaciones TO authenticated;
CREATE POLICY orden_compra_asignaciones_select ON public.orden_compra_asignaciones
  FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY orden_compra_asignaciones_insert ON public.orden_compra_asignaciones
  FOR INSERT TO authenticated WITH CHECK (public.has_role('user'));
CREATE POLICY orden_compra_asignaciones_update ON public.orden_compra_asignaciones
  FOR UPDATE TO authenticated USING (public.has_role('user')) WITH CHECK (public.has_role('user'));
CREATE POLICY orden_compra_asignaciones_delete ON public.orden_compra_asignaciones
  FOR DELETE TO authenticated USING (public.has_role('user'));
REVOKE ALL ON FUNCTION public.validar_asignacion_oc() FROM PUBLIC;
