-- ============================================================================
-- Inventario de productos terminados alimentado por la bitácora de producción.
-- - catalogo_productos.stock_actual: existencias actuales.
-- - inventario_movimientos: historial (cada tanda fabricada suma stock).
-- - produccion_diaria.producto_catalogo_id: producto del catálogo fabricado.
-- - Trigger sobre produccion_diaria que mantiene stock y movimientos
--   (alta suma, edición ajusta la diferencia, borrado revierte).
-- ============================================================================

ALTER TABLE public.catalogo_productos
  ADD COLUMN IF NOT EXISTS stock_actual numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.produccion_diaria
  ADD COLUMN IF NOT EXISTS producto_catalogo_id uuid
    REFERENCES public.catalogo_productos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_produccion_diaria_producto_catalogo
  ON public.produccion_diaria (producto_catalogo_id);

CREATE TABLE IF NOT EXISTS public.inventario_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_catalogo_id uuid NOT NULL REFERENCES public.catalogo_productos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('produccion', 'ajuste_produccion', 'reverso_produccion', 'ajuste_manual', 'salida')),
  cantidad numeric(14,2) NOT NULL,
  saldo_resultante numeric(14,2) NOT NULL,
  produccion_diaria_id uuid,
  oportunidad_id uuid REFERENCES public.oportunidades(id) ON DELETE SET NULL,
  nota text,
  creado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventario_mov_producto
  ON public.inventario_movimientos (producto_catalogo_id, created_at DESC);

ALTER TABLE public.inventario_movimientos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventario_movimientos FROM anon, authenticated;
GRANT SELECT ON public.inventario_movimientos TO authenticated;
DROP POLICY IF EXISTS inventario_movimientos_select ON public.inventario_movimientos;
CREATE POLICY inventario_movimientos_select ON public.inventario_movimientos
  FOR SELECT TO authenticated USING (public.is_active_user());

CREATE OR REPLACE FUNCTION public.trg_produccion_diaria_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_saldo numeric;
  v_delta numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.producto_catalogo_id IS NOT NULL AND NEW.cantidad_producida > 0 THEN
      UPDATE public.catalogo_productos
         SET stock_actual = stock_actual + NEW.cantidad_producida
       WHERE id = NEW.producto_catalogo_id
       RETURNING stock_actual INTO v_saldo;
      INSERT INTO public.inventario_movimientos
        (producto_catalogo_id, tipo, cantidad, saldo_resultante, produccion_diaria_id, oportunidad_id, nota, creado_por)
      VALUES
        (NEW.producto_catalogo_id, 'produccion', NEW.cantidad_producida, v_saldo, NEW.id, NEW.oportunidad_id,
         'Producción diaria', NEW.registrado_por);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.producto_catalogo_id IS NOT NULL AND OLD.cantidad_producida > 0 THEN
      UPDATE public.catalogo_productos
         SET stock_actual = stock_actual - OLD.cantidad_producida
       WHERE id = OLD.producto_catalogo_id
       RETURNING stock_actual INTO v_saldo;
      INSERT INTO public.inventario_movimientos
        (producto_catalogo_id, tipo, cantidad, saldo_resultante, produccion_diaria_id, oportunidad_id, nota, creado_por)
      VALUES
        (OLD.producto_catalogo_id, 'reverso_produccion', -OLD.cantidad_producida, v_saldo, OLD.id, OLD.oportunidad_id,
         'Registro de producción eliminado', OLD.registrado_por);
    END IF;
    RETURN OLD;

  ELSE -- UPDATE
    IF OLD.producto_catalogo_id IS NOT DISTINCT FROM NEW.producto_catalogo_id THEN
      v_delta := NEW.cantidad_producida - OLD.cantidad_producida;
      IF NEW.producto_catalogo_id IS NOT NULL AND v_delta <> 0 THEN
        UPDATE public.catalogo_productos
           SET stock_actual = stock_actual + v_delta
         WHERE id = NEW.producto_catalogo_id
         RETURNING stock_actual INTO v_saldo;
        INSERT INTO public.inventario_movimientos
          (producto_catalogo_id, tipo, cantidad, saldo_resultante, produccion_diaria_id, oportunidad_id, nota, creado_por)
        VALUES
          (NEW.producto_catalogo_id, 'ajuste_produccion', v_delta, v_saldo, NEW.id, NEW.oportunidad_id,
           'Cantidad de producción corregida', NEW.registrado_por);
      END IF;
    ELSE
      IF OLD.producto_catalogo_id IS NOT NULL AND OLD.cantidad_producida > 0 THEN
        UPDATE public.catalogo_productos
           SET stock_actual = stock_actual - OLD.cantidad_producida
         WHERE id = OLD.producto_catalogo_id
         RETURNING stock_actual INTO v_saldo;
        INSERT INTO public.inventario_movimientos
          (producto_catalogo_id, tipo, cantidad, saldo_resultante, produccion_diaria_id, oportunidad_id, nota, creado_por)
        VALUES
          (OLD.producto_catalogo_id, 'reverso_produccion', -OLD.cantidad_producida, v_saldo, OLD.id, OLD.oportunidad_id,
           'Producto de la producción cambiado', NEW.registrado_por);
      END IF;
      IF NEW.producto_catalogo_id IS NOT NULL AND NEW.cantidad_producida > 0 THEN
        UPDATE public.catalogo_productos
           SET stock_actual = stock_actual + NEW.cantidad_producida
         WHERE id = NEW.producto_catalogo_id
         RETURNING stock_actual INTO v_saldo;
        INSERT INTO public.inventario_movimientos
          (producto_catalogo_id, tipo, cantidad, saldo_resultante, produccion_diaria_id, oportunidad_id, nota, creado_por)
        VALUES
          (NEW.producto_catalogo_id, 'produccion', NEW.cantidad_producida, v_saldo, NEW.id, NEW.oportunidad_id,
           'Producción diaria', NEW.registrado_por);
      END IF;
    END IF;
    RETURN NEW;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_produccion_diaria_stock() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_produccion_diaria_stock ON public.produccion_diaria;
CREATE TRIGGER trg_produccion_diaria_stock
  AFTER INSERT OR UPDATE OF cantidad_producida, producto_catalogo_id OR DELETE
  ON public.produccion_diaria
  FOR EACH ROW EXECUTE FUNCTION public.trg_produccion_diaria_stock();
