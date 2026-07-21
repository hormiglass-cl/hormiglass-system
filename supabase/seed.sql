-- SEEDS DE DATOS INICIALES PARA CRM HORMIGLASS

-- Inserción de usuarios iniciales en la tabla pública usuarios.
-- Nota: En Supabase Auth real, las cuentas se crean primero mediante supabase.auth.signUp() o admin.createUser(),
-- lo que genera un registro en auth.users con un UUID correspondiente.
-- Este script inserta la información de perfil en public.usuarios.

-- Semilla de Clientes de Ejemplo
INSERT INTO public.clientes (id, nombre, apellido_razon_social, rut, tipo_cliente, telefono, correo, direccion, comuna)
VALUES 
  ('a0000000-0000-0000-0000-000000000001', 'Constructora Echeverría Izquierdo', 'Echeverría Izquierdo S.A.', '96.540.000-8', 'juridica', '+56 2 2450 0000', 'contacto@echeverria-izquierdo.cl', 'Av. Apoquindo 3721', 'Las Condes'),
  ('a0000000-0000-0000-0000-000000000002', 'Socovesa Inmobiliaria', 'Socovesa SpA', '89.430.100-5', 'juridica', '+56 2 2800 1200', 'proyectos@socovesa.cl', 'Av. El Bosque Norte 500', 'Las Condes'),
  ('a0000000-0000-0000-0000-000000000003', 'Carlos', 'Mendoza Parra', '15.482.930-4', 'natural', '+56 9 8492 1029', 'cmendoza@gmail.com', 'Pasaje Las Lilas 1420', 'San Bernardo')
ON CONFLICT (id) DO NOTHING;

-- Semilla de Proveedores de Ejemplo
INSERT INTO public.proveedores (id, nombre, rut, contacto, telefono, correo)
VALUES 
  ('b0000000-0000-0000-0000-000000000001', 'Cementos Polpaico S.A.', '90.120.000-4', 'Ventas Industriales', '+56 2 2700 8000', 'ventas@polpaico.cl'),
  ('b0000000-0000-0000-0000-000000000002', 'Melón Hormigones', '91.230.000-1', 'Atención Clientes', '+56 2 2600 5000', 'comercial@melon.cl')
ON CONFLICT (id) DO NOTHING;
