-- Isolated prerequisite fixture, NOT a reconstruction of deployed Supabase.
-- Source: schema.sql clientes/usuarios/oportunidades/notificaciones;
-- 20260916165716 and 20261007200000 for required Postventa relation/checks/folio.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE usuarios (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text NOT NULL, email text NOT NULL UNIQUE, rol text NOT NULL CHECK (rol IN ('admin','user','mano_obra','finanzas')), activo boolean NOT NULL DEFAULT true);
CREATE TABLE clientes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text NOT NULL, apellido_razon_social text, rut text NOT NULL, telefono text, tipo_cliente text DEFAULT 'juridica' CHECK (tipo_cliente IN ('natural','juridica')), asignado_a uuid REFERENCES usuarios(id));
CREATE TABLE oportunidades (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), codigo text NOT NULL UNIQUE, titulo text NOT NULL, cliente_id uuid REFERENCES clientes(id), asignado_a uuid REFERENCES usuarios(id), estado_pipeline text DEFAULT 'nueva', monto_abonado numeric DEFAULT 0, monto_estimado numeric DEFAULT 0, notas_venta jsonb DEFAULT '[]', productos jsonb DEFAULT '[]', origen text, modalidad_requerimiento text NOT NULL DEFAULT 'instalacion' CHECK (modalidad_requerimiento IN ('solo_material','instalacion')));
CREATE TABLE notificaciones (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id uuid REFERENCES usuarios(id), mensaje text NOT NULL, tipo text DEFAULT 'info', leido boolean DEFAULT false, entidad_relacionada text, link_url text, fecha timestamptz DEFAULT now());
CREATE TABLE postventa_casos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), oportunidad_id uuid NOT NULL REFERENCES oportunidades(id), tipo text NOT NULL CHECK (tipo IN ('producto_defectuoso','problema_fabricacion','problema_instalacion','dano_transporte','uso_incorrecto','movimiento_terreno','trabajo_adicional','dano_terceros','faltante','defecto','cantidad_adicional','otro')), estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('recibido','en_revision','visita_programada','reparacion_programada','cerrado','abierto','programado','en_curso','resuelto','cancelado')), descripcion text NOT NULL, responsable_id uuid REFERENCES usuarios(id), vendedor_id uuid REFERENCES usuarios(id), cliente_id uuid REFERENCES clientes(id), folio text UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
-- Representative trigger: explicit integration folios must bypass the shared generator.
CREATE FUNCTION fixture_folio() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.folio IS NULL THEN RAISE EXCEPTION 'shared generator must not be used'; END IF; RETURN NEW; END $$;
CREATE TRIGGER postventa_folio BEFORE INSERT ON postventa_casos FOR EACH ROW EXECUTE FUNCTION fixture_folio();
GRANT SELECT, INSERT, UPDATE ON clientes, oportunidades, usuarios, notificaciones, postventa_casos TO service_role;
INSERT INTO usuarios (id,nombre,email,rol) VALUES ('10000000-0000-4000-8000-000000000001','Seller','test@example.invalid','user'), ('10000000-0000-4000-8000-000000000002','Worker','worker@example.invalid','mano_obra');
