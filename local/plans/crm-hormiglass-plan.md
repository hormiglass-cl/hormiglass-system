# CRM propio para Hormiglass

## Contexto

Hormiglass (Sociedad Comercial y de Transportes Valverde e Hijos Ltda., prefabricados de hormigón + aluminio/vidrio, San Bernardo) actualmente gestiona ventas, producción y logística con Excel + WhatsApp, y está probando ClickUp en paralelo. El usuario decidió construir un **CRM propio** (Next.js + Supabase + Vercel) que **reemplace ClickUp** como sistema definitivo de clientes, ventas y caja.

La carpeta `context/` ya documenta a fondo el proceso de negocio:
- `funciones-esperadas/20-07-2026.md` — spec explícita de 7 módulos requeridos.
- `context/2-...md` (PR-VENT-001) — flujo formal Ventas → Finanzas → Supervisión de Sucursal → Programación, con la ficha de traspaso interno (campos de cliente/venta) y estados de facturación.
- `context/1-...md` y `3-...md` — proceso actual vs. propuesto, y brecha entre ambos.
- `context/4-research_hormiglass.md` — perfil de negocio (productos, clientes B2C/B2B, herramientas actuales: WooCommerce, Transbank, WhatsApp Business).
- `ajustes/20-07-2026.md` — notas de ClickUp (automatización WhatsApp→leads, Gantt con horario) que sirven de referencia de funcionalidad deseada (notificaciones, calendario de programación), no como sistema a integrar.

Decisiones ya tomadas con el usuario:
- **MVP simple primero**: pipeline de venta con estados básicos (no todas las aprobaciones formales de PR-VENT-001 desde el día 1).
- **El CRM reemplaza ClickUp** por completo.
- **Roles**: Ventas, Finanzas, Supervisión, Programación, Admin (Supabase RLS por rol).

## Stack técnico

- **Next.js (App Router, TS)** + **Tailwind + shadcn/ui** para la interfaz.
- **Supabase**: Postgres + Auth (email/password, roles vía tabla `usuarios` + RLS policies) + Storage (comprobantes de pago, fotos) + Realtime (notificaciones).
- **Vercel** para deploy/hosting, integrado con el repo git.
- No se necesita boilerplate multi-tenant (es una sola empresa) — RLS se usa para **permisos por rol**, no por tenant.

## Modelo de datos (Supabase/Postgres)

- `usuarios` (id, nombre, email, rol: ventas/finanzas/supervision/programacion/admin)
- `clientes` (id, nombre, apellido/razón social, rut, tipo_cliente: natural/juridica, teléfono, correo, dirección, comuna)
- `notas_actividad` (id, cliente_id, usuario_id, contenido, fecha) — timeline visible en la ficha del cliente
- `cotizaciones` (id, cliente_id, usuario_id, estado: borrador/enviada/aprobada/rechazada, fecha, total)
- `cotizacion_items` (id, cotizacion_id, producto, cantidad, precio_unitario)
- `ventas` (id, cotizacion_id, cliente_id, tipo_venta: directa/programacion, modalidad: retiro/despacho/instalacion, condicion_pago: total/abono50, medio_pago, monto_total, monto_abonado, documento: boleta/factura/factura_anticipo, estado_pipeline, fecha_solicitada, asignado_a)
- `proveedores` (id, nombre, rut, contacto, teléfono, correo)
- `pedidos_proveedor` (id, proveedor_id, venta_id opcional, descripción, monto, estado, fecha)
- `caja_movimientos` (id, tipo: ingreso/egreso, monto, categoría, venta_id opcional, fecha, usuario_id) — base para el estado de resultado
- `notificaciones` (id, usuario_id, mensaje, tipo, leido, fecha, entidad_relacionada)
- `asignaciones` (cliente_id o cotizacion_id → usuario_id) — o campo `asignado_a` directo en `clientes`/`cotizaciones`/`ventas`

Estados de `ventas.estado_pipeline` (MVP simple): `nueva → pagada → programada → entregada` (ampliable después a los estados formales de Finanzas/Supervisión del documento PR-VENT-001).

## Fases de implementación

**Fase 0 — Documentación del proyecto**
- Crear `CLAUDE.md` en `hormiglass-system/` con: resumen del negocio, stack, estructura de carpetas del código, comandos de desarrollo, convenciones, y referencia a los docs de `context/`.
- Crear memoria persistente (`project_hormiglass_crm.md` + entrada en `MEMORY.md`) con el estado del build, decisiones tomadas (MVP simple, reemplaza ClickUp, 5 roles) y qué falta — actualizable en cada sesión futura.

**Fase 1 — Setup del proyecto**
- Scaffold Next.js (TS, App Router, Tailwind, shadcn/ui) dentro de `hormiglass-system/app/` (o carpeta a definir).
- Crear proyecto Supabase, definir esquema inicial (migraciones SQL), conectar con `@supabase/supabase-js` y `@supabase/ssr`.
- Conectar repo a Vercel para deploy automático.

**Fase 2 — Auth y roles**
- Supabase Auth (login por email/password para los 5 roles).
- Tabla `usuarios` + políticas RLS por rol (ej. Finanzas ve caja, Programación ve pipeline de programación).

**Fase 3 — Clientes**
- CRUD de clientes con los campos de la spec (nombre, apellido, RUT, tipo persona natural/jurídica, contacto).
- Ficha de cliente con historial de actividad y notas (`notas_actividad`).
- Asignación de usuario responsable por cliente.

**Fase 4 — Cotizaciones**
- Creador de cotizaciones (plantilla a definir con el usuario — placeholder inicial basado en campos de PR-VENT-001: cliente, producto, cantidad, monto, condición de pago, documento).
- Estados simples de cotización y vínculo a cliente.

**Fase 5 — Pipeline de ventas (MVP simple)**
- Conversión cotización → venta, con los 4 estados básicos y campos de la ficha de traspaso (modalidad, medio de pago, monto abonado/saldo, documento).
- Asignación de usuario a la venta.

**Fase 6 — Proveedores y pedidos**
- CRUD de proveedores y registro de pedidos asociados a producción/stock.

**Fase 7 — Caja / estado de resultado**
- Registro de movimientos (ingresos por ventas, egresos por pedidos/gastos) y vista de estado de resultado simple (totales por periodo).

**Fase 8 — Notificaciones y recordatorios**
- Notificaciones in-app (Supabase Realtime) para asignaciones, cambios de estado y recordatorios de fecha comprometida.

## Addendum (2026-07-20) — insumos entregados por el usuario

- **Plantilla de cotización real**: `context/cotizaciones/cotizacion-ejemplo.pdf`. Campos: encabezado Hormiglass, referencia cliente, fecha cotización/vencimiento, datos cliente, tabla de ítems (descripción, IVA%, P.U. neto, cantidad, descuento%, base imponible), plazo de entrega, términos de pago, totales (neto, descuento, sin IVA, IVA, total). **Pendiente confirmar con el usuario**: el PDF specimen usa 20% de IVA; en Chile el IVA real es 19% — hay que confirmar cuál usar en el sistema.
- **Branding**: `branding/branding-dna.md` — colores #F7931F (naranjo Hormiglass), #FFFFFF, #363636. Usar como paleta base de la UI (shadcn/ui theme).
- **MCP y config ya creados** (no es parte de "ejecutar el plan", son archivos de configuración de Claude Code, no código de la app):
  - `.mcp.json` en la raíz del proyecto con servidores `supabase` y `github-mcp-server`.
  - `.claude/settings.json` con permisos base.
  - `CLAUDE.md` en la raíz del proyecto.
  - ⚠️ `config/mcp_config.json` (entregado por el usuario) tiene un GitHub PAT en texto plano — no debe commitearse así; recomendar rotarlo y exportarlo como variable de entorno (`GITHUB_PERSONAL_ACCESS_TOKEN`) en vez de dejarlo en un archivo del repo.

## Verificación

- `npm run dev` local contra un proyecto Supabase de desarrollo; probar login por rol y que RLS bloquea/permite correctamente.
- Crear un cliente → cotización → venta de punta a punta y confirmar que aparece en caja y notificaciones.
- Deploy a Vercel (preview) y validar que las variables de entorno de Supabase están configuradas ahí.
- Revisar que `CLAUDE.md` y la memoria queden escritos y reflejen el estado real del proyecto.
