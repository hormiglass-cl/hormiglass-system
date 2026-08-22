-- 0013: Restrict table grants for ordenes de compra

REVOKE ALL ON TABLE public.ordenes_compra FROM anon, authenticated;
REVOKE ALL ON TABLE public.orden_compra_items FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordenes_compra TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orden_compra_items TO authenticated;
