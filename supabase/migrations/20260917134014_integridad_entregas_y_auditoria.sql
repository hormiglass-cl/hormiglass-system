-- La firma debe ser un objeto real en la carpeta de la guía.
CREATE FUNCTION public.validar_respaldo_guia() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.tipo = 'firma' AND (
    NEW.archivo_path NOT LIKE 'entregas/' || NEW.guia_despacho_id::text || '/%' OR
    NOT EXISTS (SELECT 1 FROM storage.objects s WHERE s.bucket_id = 'administracion' AND s.name = NEW.archivo_path)
  ) THEN
    RAISE EXCEPTION 'La firma debe estar cargada en la carpeta privada de esta guía';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validar_respaldo_guia BEFORE INSERT OR UPDATE OF tipo, archivo_path, guia_despacho_id
  ON public.guia_despacho_documentos FOR EACH ROW EXECUTE FUNCTION public.validar_respaldo_guia();
REVOKE ALL ON FUNCTION public.validar_respaldo_guia() FROM PUBLIC;

-- La evidencia y las cantidades de una guía entregada no se alteran después del cierre.
DROP TRIGGER bloquear_items_entregados ON public.guia_despacho_items;
CREATE TRIGGER bloquear_items_entregados BEFORE INSERT OR UPDATE OR DELETE ON public.guia_despacho_items
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambios_entrega_confirmada();
CREATE FUNCTION public.bloquear_borrado_guia_entregada() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.estado = 'entregada' THEN RAISE EXCEPTION 'La guía entregada se conserva como evidencia; registra una corrección en postventa'; END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER bloquear_borrado_guia_entregada BEFORE DELETE ON public.guias_despacho
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_borrado_guia_entregada();
REVOKE ALL ON FUNCTION public.bloquear_borrado_guia_entregada() FROM PUBLIC;

-- La cotización vigente no cambia mientras el estado señale entrega cerrada.
CREATE FUNCTION public.bloquear_cambio_cotizacion_cerrada() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.estado_pipeline IN ('entregada','prod_finalizado','rev_entregado')
     AND NEW.cotizacion_actual_id IS DISTINCT FROM OLD.cotizacion_actual_id THEN
    RAISE EXCEPTION 'Reabre la etapa de la venta antes de cambiar su cotización vigente';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bloquear_cambio_cotizacion_cerrada BEFORE UPDATE OF cotizacion_actual_id ON public.oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambio_cotizacion_cerrada();
REVOKE ALL ON FUNCTION public.bloquear_cambio_cotizacion_cerrada() FROM PUBLIC;

-- El historial se conserva aunque un evento programado se elimine.
ALTER TABLE public.evento_reprogramaciones ALTER COLUMN evento_id DROP NOT NULL;
ALTER TABLE public.evento_reprogramaciones DROP CONSTRAINT evento_reprogramaciones_evento_id_fkey;
ALTER TABLE public.evento_reprogramaciones ADD CONSTRAINT evento_reprogramaciones_evento_id_fkey
  FOREIGN KEY (evento_id) REFERENCES public.eventos_produccion_logistica(id) ON DELETE SET NULL;
