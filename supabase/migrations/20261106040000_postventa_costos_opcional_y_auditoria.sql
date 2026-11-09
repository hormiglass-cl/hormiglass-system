-- Postventa: costos opcionales para cerrar + historial de auditoría de estados.

-- 1. Regla de cierre sin la exigencia de costos (D). Se mantienen A, B y C.
CREATE OR REPLACE FUNCTION public.validar_cierre_postventa()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    IF NEW.estado IN ('cerrado', 'resuelto') AND (OLD.estado NOT IN ('cerrado', 'resuelto')) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.postventa_evidencias
            WHERE caso_id = NEW.id AND tipo_evidencia IN ('despues', 'conformidad')
        ) THEN
            RAISE EXCEPTION 'No se puede cerrar el caso %: se requieren fotografías finales de trabajo terminado o conformidad.', NEW.folio;
        END IF;

        IF NOT (NEW.conformidad_cliente = true OR EXISTS (
            SELECT 1 FROM public.postventa_evidencias
            WHERE caso_id = NEW.id AND tipo_evidencia = 'conformidad'
        )) THEN
            RAISE EXCEPTION 'No se puede cerrar el caso %: se requiere registrar la confirmación o conformidad del cliente.', NEW.folio;
        END IF;

        IF NEW.causa_raiz IS NULL OR NEW.causa_raiz = 'Sin determinar' OR TRIM(NEW.causa_raiz) = '' THEN
            RAISE EXCEPTION 'No se puede cerrar el caso %: se debe clasificar la causa raíz del problema.', NEW.folio;
        END IF;

        NEW.fecha_cierre := COALESCE(NEW.fecha_cierre, now());
    END IF;

    RETURN NEW;
END;
$fn$;

-- 2. Historial de auditoría de cada caso
CREATE TABLE IF NOT EXISTS public.postventa_historial (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    caso_id uuid NOT NULL REFERENCES public.postventa_casos(id) ON DELETE CASCADE,
    usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    evento text NOT NULL CHECK (evento IN ('creado', 'estado', 'cierre', 'reapertura', 'conformidad')),
    estado_anterior text,
    estado_nuevo text,
    detalle text,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_postventa_historial_caso ON public.postventa_historial (caso_id, created_at DESC);

ALTER TABLE public.postventa_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "postventa_historial_select" ON public.postventa_historial;
CREATE POLICY "postventa_historial_select" ON public.postventa_historial
    FOR SELECT TO authenticated USING (is_active_user());

GRANT SELECT ON public.postventa_historial TO authenticated;

-- 3. Trigger que registra los cambios (solo él escribe en la tabla)
CREATE OR REPLACE FUNCTION public.registrar_historial_postventa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_usuario uuid := public.current_usuario_id();
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.postventa_historial (caso_id, usuario_id, evento, estado_nuevo)
        VALUES (NEW.id, v_usuario, 'creado', NEW.estado);
        RETURN NEW;
    END IF;

    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
        INSERT INTO public.postventa_historial (caso_id, usuario_id, evento, estado_anterior, estado_nuevo)
        VALUES (
            NEW.id,
            v_usuario,
            CASE
                WHEN NEW.estado IN ('cerrado', 'resuelto') AND OLD.estado NOT IN ('cerrado', 'resuelto') THEN 'cierre'
                WHEN OLD.estado IN ('cerrado', 'resuelto') AND NEW.estado NOT IN ('cerrado', 'resuelto') THEN 'reapertura'
                ELSE 'estado'
            END,
            OLD.estado,
            NEW.estado
        );
    END IF;

    IF NEW.conformidad_cliente IS DISTINCT FROM OLD.conformidad_cliente THEN
        INSERT INTO public.postventa_historial (caso_id, usuario_id, evento, detalle)
        VALUES (
            NEW.id,
            v_usuario,
            'conformidad',
            CASE WHEN NEW.conformidad_cliente THEN 'Conformidad del cliente registrada' ELSE 'Conformidad del cliente quitada' END
        );
    END IF;

    RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.registrar_historial_postventa() FROM anon, public;

DROP TRIGGER IF EXISTS trg_historial_postventa ON public.postventa_casos;
CREATE TRIGGER trg_historial_postventa
AFTER INSERT OR UPDATE OF estado, conformidad_cliente ON public.postventa_casos
FOR EACH ROW
EXECUTE FUNCTION public.registrar_historial_postventa();
