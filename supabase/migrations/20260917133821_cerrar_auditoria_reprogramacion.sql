-- El historial es de solo lectura para usuarios. El trigger necesita privilegios
-- del propietario para insertar su registro sin abrir escritura directa.
ALTER FUNCTION public.avisar_reprogramacion() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.avisar_reprogramacion() FROM PUBLIC, anon, authenticated;
