# Plan de reversion modulo Ordenes de Compra

Fecha: 2026-08-20 23:46 America/Santiago

Este documento define como anular el modulo OC si el usuario rechaza la validacion final.

## Principio

No usar `git reset --hard` ni revertir todo el arbol, porque el workspace contiene cambios preexistentes y adyacentes que no necesariamente pertenecen a OC.

La reversion debe separar:

- Codigo de modulo OC.
- Integraciones OC en pantallas existentes.
- Migraciones/esquema Supabase.
- Datos reales que el usuario haya creado durante pruebas.

## Archivos nuevos OC a eliminar si se rechaza

- `app/ordenes-compra/`
- `components/OrdenCompraModal.tsx`
- `components/OrdenCompraPdfPreviewModal.tsx`
- `supabase/migrations/0008_ordenes_compra.sql`
- `supabase/migrations/0012_ordenes_compra_version.sql`
- `supabase/migrations/0013_restrict_ordenes_compra_grants.sql`
- `supabase/migrations/0014_align_oc_policies_with_user_roles.sql`
- `local/ajustes/oc-verificacion-final.md`
- `local/ajustes/oc-plan-reversion.md`

## Archivos con integracion OC a revertir parcialmente

- `components/Sidebar.tsx`: quitar enlace `Ordenes de Compra`.
- `app/proveedores/page.tsx`: quitar atajos/campos usados para crear OC si el usuario no los quiere conservar.
- `app/ventas/page.tsx`: quitar estado/carga/listado/modal OC, preview OC y bloqueo de cambio de rama por OC.
- `lib/types.ts`: quitar tipos `OrdenCompra`, `OrdenCompraItem`, `EstadoOrdenCompra` y extensiones de `Proveedor` solo si no son usadas por otros ajustes.
- `lib/logger.ts`: quitar entidad `ordenes_compra`.
- `supabase/schema.sql`: volver a snapshot sin tablas OC si se decide revertir base.

## Cambios adyacentes que requieren decision antes de revertir

Estos no son puramente OC o surgieron al cerrar cabos de seguridad/auth:

- `app/login/page.tsx` y `lib/context/AuthContext.tsx`: correccion de carga de sesion/perfil para evitar falso mensaje de cuenta no habilitada.
- `supabase/migrations/0015_fix_new_auth_user_default_role.sql`: nuevos auth users quedan `rol='user'`, `activo=false`.
- `supabase/migrations/0016_restrict_internal_function_execute.sql`: hardening de funciones internas.
- `supabase/migrations/0017_harden_legacy_helper_functions.sql`: hardening de helpers legacy.
- `supabase/migrations/0009_rama_destino.sql`, `0010_personal_terreno.sql`, `0011_produccion_diaria.sql`: cambios de rama/produccion relacionados con ventas, no exclusivamente OC.

## Supabase remoto

Si el usuario rechaza solo el modulo visual/codigo, no borrar tablas remotas automaticamente.

Si el usuario pide revertir tambien DB, confirmar explicitamente porque puede borrar datos reales de pruebas o produccion:

- `orden_compra_items`
- `ordenes_compra`
- columnas de proveedor agregadas para direccion/comuna/region, si no existian antes
- migraciones remotas 0008/0012/0013/0014 relacionadas con OC

La reversión DB debe hacerse con una migracion nueva de rollback, no editando manualmente `supabase_migrations.schema_migrations`.

## Validacion despues de revertir

- `npm run build`.
- Verificar que `/ordenes-compra` ya no exista o redirija segun se defina.
- Verificar que `/ventas` no referencia `OrdenCompra`.
- Verificar que `rg "ordenes_compra|OrdenCompra|orden_compra" app components lib` no reporte referencias runtime.
