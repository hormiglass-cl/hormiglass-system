ALTER TABLE public.oportunidades
  ADD COLUMN abastecimiento text CHECK (abastecimiento IN ('fabricar', 'compra_proveedor', 'stock')),
  ADD COLUMN forma_entrega text CHECK (forma_entrega IN ('retiro_cliente', 'retiro_proveedor', 'despacho_propio', 'despacho_subcontratado')),
  ADD COLUMN fecha_prometida date,
  ADD COLUMN fecha_tentativa_produccion date,
  ADD COLUMN fecha_tentativa_entrega date,
  ADD COLUMN direccion_obra text,
  ADD COLUMN transporte text,
  ADD COLUMN responsable_operativo_id uuid REFERENCES public.usuarios(id);

UPDATE public.oportunidades
SET abastecimiento = CASE
  WHEN rama_destino = 'produccion' THEN 'fabricar'
  WHEN rama_destino = 'reventa' THEN 'compra_proveedor'
  ELSE NULL
END,
forma_entrega = CASE
  WHEN modalidad_entrega = 'retiro' THEN 'retiro_cliente'
  WHEN modalidad_entrega IN ('despacho', 'instalacion') THEN 'despacho_propio'
  ELSE NULL
END,
fecha_prometida = fecha_limite;
