# Plan: Cierre de brechas de seguridad + Supabase como fuente única de verdad

**Estado:** Diseño completo, listo para ejecutar. Bloqueado en Fase 0 hasta autorizar el MCP de Supabase.
**Fecha de diseño:** 2026-08-05

## Contexto

El CRM de Hormiglass corre 100% cliente→Supabase (sin `app/api/`, sin `middleware.ts`, sin cliente server-side). Dos auditorías (seguridad y flujo de datos) más lectura directa de código confirmaron:

- **El login no valida contraseña.** `app/login/page.tsx` acepta cualquier email que exista en la tabla `usuarios`, ignorando el campo password por completo.
- **La sesión es un email en `localStorage`**, falsificable desde devtools para impersonar a cualquier usuario/rol.
- **RLS está "activado" pero es totalmente permisivo**: las 10 tablas documentadas en `supabase/schema.sql` y el bucket `cotizaciones-pdf` tienen políticas `USING (true) WITH CHECK (true)` — cualquiera con la anon key pública (que vive en el bundle del navegador por diseño) puede leer/escribir/borrar toda la base.
- **No hay ninguna capa de autorización server-side.** Los "gates" de UI (ej. `configuracion` solo-admin) esconden botones pero no protegen los datos.
- **`supabase/schema.sql` está desincronizado con la base real**: la app usa 7+ tablas (`oportunidades`, `visitas_terreno`, `proyectos_planificacion`, `ordenes_reventa`, `actividades_op`, `campos_personalizados`, `logs_sistema`) que no existen en el archivo versionado — sus políticas RLS reales son inauditables desde el código.
- **La mayoría de las páginas SÍ están conectadas a Supabase en tiempo real** (Realtime channels ya implementados en 9 páginas) — el objetivo 2 del usuario es mayormente cierre de huecos puntuales, no una reconstrucción desde cero.

Decisiones ya tomadas por el usuario (vinculantes para este plan):
- **A)** Migrar a Supabase Auth real (no parchear el login actual).
- **B)** Modelo de acceso: lectura abierta entre roles para usuarios activos autenticados; escritura restringida por rol según CLAUDE.md.
- **C)** Reconciliar el schema real vía MCP de Supabase antes de escribir cualquier política (Fase 0 bloqueante).
- **D)** Rollout de usuarios existentes vía invitación/reset por correo (Supabase Auth), no por creación manual de passwords.

Objetivo final: cerrar cada hueco de seguridad crítico, y que todo dato que el sistema muestra, crea o edita viva en Supabase y se refleje en tiempo real.

---

## Correcciones verificadas antes de planear

1. **`documentos` es un bucket de Storage, no una tabla** (`app/ventas/page.tsx:1398,1400,2651,2653`, vía `supabase.storage.from('documentos')`). No existe en `schema.sql`. Usa `getPublicUrl()` — **los comprobantes de pago son legibles por cualquiera con la URL, sin autenticación.** Hueco no listado originalmente.
2. **`app/configuracion/page.tsx`** no solo lee antes del gate admin — su `useEffect` (~línea 128-176) hace **upsert** del seed por defecto si el fetch falla o viene vacío (línea ~145). Un no-admin (o un llamado anónimo directo) puede disparar escrituras a la tabla de configuración.
3. **`app/clientes/page.tsx:186`** escribe en `campos_personalizados` desde el flujo de ventas (actualiza opciones de "nicho"). Esa tabla no puede ser limpiamente "solo admin escribe" sin una política con excepción o un cambio de código.
4. **`upsert` con `onConflict`** en `proyectos_planificacion` y `ordenes_reventa` (usado desde `app/ventas/page.tsx` y las páginas de programación) requiere **tanto** política INSERT como UPDATE para el mismo rol — un `upsert` es `INSERT ... ON CONFLICT DO UPDATE`. Es la causa más probable de regresiones "se rompió después de aplicar RLS".
5. **`campos_personalizados.id` parece ser TEXT** (se usan ids como `'sys-cli-1'`), no UUID — confirmar en Fase 0.
6. **`lib/logger.ts:34`** acepta `usuario_id: null` en el log de auditoría hoy.
7. `.mcp.json` ya declara el servidor Supabase MCP apuntando a `jvenwcupdllcqbxixcuo` — pendiente de autorización del usuario.

---

## Fase 0 — Reconciliación de esquema en vivo (BLOQUEANTE)

**Por qué primero:** no se pueden escribir políticas RLS para tablas que no se han visto. 7 de 17 tablas que usa la app no están en `schema.sql`, y las 10 que sí están tienen columnas desalineadas. Escribir políticas desde `schema.sql` tal cual produciría políticas que no hacen nada (nombres de tabla/columna equivocados) o que rompen flujos que sí funcionan hoy.

### 0.1 Extraer el schema real (Supabase MCP, proyecto `jvenwcupdllcqbxixcuo`)
Para **cada** tabla en `public`: columnas/tipos/nullability/defaults, constraints (PK/UNIQUE/FK/CHECK — necesario para confirmar los targets de `onConflict`), políticas RLS existentes (`SELECT * FROM pg_policies WHERE schemaname='public'`), funciones existentes (`get_current_user_role` y otras), triggers, buckets de Storage y sus políticas, conteo de `auth.users` vs emails en `public.usuarios`, y membresía de la publicación de Realtime (`pg_publication_tables WHERE pubname='supabase_realtime'`).

### 0.2 Responder preguntas puntuales que cambian el trabajo siguiente

| Pregunta | Si existe/es cierto | Si no |
|---|---|---|
| ¿Existe tabla `abonos`? | Agregar a schema.sql + RLS (finanzas escribe). Ojo: nada en la app escribe ahí hoy | **Quitar el embed `abonos(*)`** de `planificacion/page.tsx:85` y `reventa/page.tsx:83`; usar `comprobantes_pago` como ya hace `ventas/page.tsx:1032` |
| ¿`logs_sistema.usuario_id` es nullable? | Diseñar política append-only | Crear la tabla |
| ¿`campos_personalizados.id` es TEXT? | Mantener | El seed upsert está roto hoy |
| ¿Hay UNIQUE en `proyectos_planificacion.oportunidad_id` / `ordenes_reventa.oportunidad_id`? | ok | Cada cambio de estado inserta una fila duplicada — corrupción silenciosa, arreglar antes de RLS |
| ¿Está poblada `ventas`? | Mantener + RLS deny-all, marcar deprecated | Eliminar |
| ¿Existe bucket `documentos`, es público? | Decidir URL pública vs firmada (ver Fase 3.7) | Crearlo |
| ¿Falta alguna de las 17 tablas en la publicación `supabase_realtime`? | ok | `ALTER PUBLICATION supabase_realtime ADD TABLE ...` |

### 0.3 Producir los artefactos autoritativos
- Reescribir `supabase/schema.sql` como un dump fiel y completo de la base real + las columnas que la app ya usa (agregar explícitamente: `clientes.nicho, tipo_venta, correos_secundarios, region`; `cotizaciones.oportunidad_id, version, fecha_inicio_compromiso, fecha_limite_compromiso`; `notificaciones.link_url`).
- Crear `supabase/migrations/` con migraciones numeradas e idempotentes:
  - `0001_reconcile_schema.sql`, `0002_auth_link.sql`, `0003_rls_helpers.sql`, `0004_rls_policies.sql`, `0005_storage_policies.sql`, `0006_data_integrity.sql`
- Actualizar `supabase/seed.sql` manteniendo la nota de que las cuentas de auth vienen de `signUp`/`admin.createUser`.

**Gate de entrega:** un diff tabla-por-tabla (real vs `schema.sql` vs uso en la app) revisado por el usuario antes de escribir ninguna política.

**Regla:** donde la base real y `lib/types.ts` discrepen, **gana la base real** y se actualiza el tipo TypeScript — así se aplica "Supabase como fuente única de verdad" también a la capa de tipos.

---

## Fase 1 — Migración a Supabase Auth real

1. **`lib/supabase/server.ts`** (nuevo) — cliente server-side con `createServerClient` de `@supabase/ssr` + `cookies()` de `next/headers` (async en Next 16, usar `await`).
2. **`middleware.ts`** (nuevo, raíz del repo) — el gate real:
   - `await supabase.auth.getUser()` (nunca `getSession()` en middleware — `getUser()` sí revalida el JWT contra el Auth server).
   - Sin usuario y ruta protegida → redirect a `/login`. Con usuario y en `/login` → redirect a `/`.
   - Verificar `activo` contra `public.usuarios` por `auth_id`; si falta o `activo=false` → `signOut()` + redirect con error. (Alternativa si la latencia molesta: custom access-token hook que inyecta `rol`/`activo` como claims del JWT — ver riesgos.)
   - Devolver la respuesta con las cookies refrescadas (no una `NextResponse` nueva) o se producen logouts aleatorios.
   - `matcher` excluyendo assets estáticos.
3. **`app/login/page.tsx`** — reemplazar `handleSubmit` por `supabase.auth.signInWithPassword({ email, password })`. Error → mensaje genérico (no revelar si el email existe, evita user enumeration). Éxito → verificar perfil `activo`, `router.replace('/')` + `router.refresh()`.
4. **`lib/context/AuthContext.tsx`** — reescritura:
   - Eliminar: import de `MOCK_USUARIOS`, ambos fallbacks a mock, toda la sesión por `localStorage`, y el fallback sintético en `addUser`.
   - Nuevo flujo: `supabase.auth.getUser()` al montar → si hay usuario, `from('usuarios').select('*').eq('auth_id', user.id).single()`. **Cualquier error → `setCurrentUser(null)`, nunca mock.**
   - `supabase.auth.onAuthStateChange(...)` manejando `SIGNED_IN/SIGNED_OUT/TOKEN_REFRESHED/USER_UPDATED`.
   - `setCurrentUser` deja de exponerse públicamente (es el vector de impersonación actual).
   - `hasPermission()` (hoy código muerto): mantener solo como afordancia cosmética de UI, dejar claro en comentario que la aplicación real es RLS.
5. **`components/AuthGuard.tsx`** — degradar a solo evitar flash de contenido mientras carga; el middleware es la protección real.
6. **Rutas nuevas:** `app/auth/callback/route.ts` (exchangeCodeForSession), `app/auth/actualizar-password/page.tsx`, `app/auth/recuperar/page.tsx`. Middleware debe dejar pasar `/auth/*` sin sesión.
7. **Config:** crear `.env.example`; en `lib/supabase/client.ts` quitar el fallback `|| 'https://placeholder.supabase.co'` y lanzar error si faltan las env vars; configurar Site URL / Redirect URLs en el dashboard de Supabase.

---

## Fase 2 — Rollout de usuarios (auth.users ↔ public.usuarios)

`usuarios.auth_id` ya existe y está sin usar — es el pivote para `auth.uid() → usuarios.id` en todas las políticas (no tocar `usuarios.id` en sí, todas las FKs del resto del sistema apuntan a él).

1. **Migración `0002_auth_link.sql`:**
   - Backfill idempotente `UPDATE usuarios SET auth_id = auth.users.id WHERE lower(email) coincide`.
   - Trigger `handle_new_auth_user()` en `auth.users` (AFTER INSERT, SECURITY DEFINER) que auto-vincula por email, o crea perfil con **rol `ventas` y `activo=false` por defecto** (fail closed) si no hay match.
   - Tras verificar 0 filas sin vincular: `UNIQUE(auth_id)` + `NOT NULL`.
   - Índice en `auth_id` (se consulta en cada chequeo de RLS/middleware).
   - Índice único case-insensitive en `email`.
2. **Invitaciones — recomendado: invitar manualmente desde el dashboard de Supabase Auth** (5 usuarios, una sola vez, sin manejar service key en código). Alternativa si el equipo crece: script Node local con `admin.inviteUserByEmail` (service key solo en el entorno del operador) o una Edge Function si `addUser` debe seguir funcionando desde la UI de configuración a futuro.
3. **Verificación antes de Fase 3:** `SELECT count(*) FROM usuarios WHERE auth_id IS NULL` debe ser 0, y todo `auth.users` debe tener su `usuarios` correspondiente. **No aplicar Fase 3 sin esto** — cualquier fila sin vincular es alguien que queda bloqueado apenas entre RLS.
4. Eliminar el email real hardcodeado en `lib/supabase/mock-data.ts:17-18`.

---

## Fase 3 — RLS: reescritura completa

### 3.1 Funciones helper (reemplazan `get_current_user_role()`, que hoy falla abierto a `'admin'` y tiene un bug de precedencia `OR`/`AND` que salta el chequeo de `activo`)
Todas `SECURITY DEFINER`, `STABLE`, `SET search_path = public, pg_temp`:
- `current_usuario_id()` — retorna el id de `usuarios` para el `auth.uid()` activo, o NULL (falla cerrado).
- `current_rol()` — igual, sin fallback.
- `is_active_user()` — boolean, `COALESCE(..., false)`.
- `has_role(VARIADIC roles text[])` — incluye `OR current_rol() = 'admin'` para que admin siempre pase (una sola vez, no repetido en 40 políticas).
- Revocar ejecución de `get_current_user_role()` de `anon`/`public`; otorgar las nuevas solo a `authenticated`.

### 3.2 Bloqueo base (antes de cualquier política por tabla)
```sql
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
```
Defensa en profundidad por debajo de RLS — aunque una política tenga un error de redacción, sin este GRANT no hay forma de que `anon` vea nada. Dado que toda la arquitectura es cliente→Supabase con anon key pública, es probablemente el cambio de mayor impacto de todo el plan. Luego: `ENABLE ROW LEVEL SECURITY` (+ `FORCE` donde aplique) en las 17 tablas, y `DROP POLICY` de todas las `"Acceso total ..."` actuales.

### 3.3 Modelo de lectura (según decisión B del usuario)
Uniforme para toda tabla de negocio: `FOR SELECT TO authenticated USING (is_active_user())`. Dos excepciones propuestas (requieren tu confirmación en la Fase 3.3):
- `logs_sistema`: SELECT solo `admin` (es un log de auditoría con snapshots completos; leerlo abierto lo desvirtúa).
- `caja_movimientos`: por defecto se deja lectura abierta (así es la UX hoy vía sidebar) salvo que prefieras restringirla a finanzas/admin/administracion.

### 3.4 Matriz de escritura por tabla (rol dueño según CLAUDE.md; admin siempre implícito)

| Tabla | INSERT | UPDATE | DELETE | Nota |
|---|---|---|---|---|
| `usuarios` | admin | admin | admin | + política propia: usuario puede actualizar su `nombre`; trigger BEFORE UPDATE bloquea auto-cambio de `rol/activo/auth_id` salvo admin |
| `clientes` | ventas, administracion | ventas, administracion | admin | borrado masivo existente en la UI, alto impacto |
| `notas_actividad` | cualquier activo | admin | admin | `WITH CHECK (usuario_id = current_usuario_id())` |
| `cotizaciones` | ventas | ventas | ventas | |
| `cotizacion_items` | ventas | ventas | ventas | edición hace delete+insert, requiere ambos permisos |
| `oportunidades` | ventas | ventas, finanzas, programacion, administracion | admin | ver 3.5 — tabla ambigua, requiere trigger de transición |
| `actividades_op` | cualquier activo | nadie | admin | append-only, `WITH CHECK (usuario_id = current_usuario_id())` |
| `visitas_terreno` | ventas, programacion | ventas, programacion | ventas, programacion | |
| `proyectos_planificacion` | ventas, programacion | ventas, programacion | admin | ambos INSERT+UPDATE por el patrón `upsert` |
| `ordenes_reventa` | ventas, programacion | ventas, programacion | admin | ídem |
| `proveedores` | administracion, finanzas | administracion, finanzas | admin | |
| `pedidos_proveedor` | administracion, finanzas | administracion, finanzas | admin | |
| `caja_movimientos` | finanzas | admin | admin | ledger inmutable, `WITH CHECK (usuario_id = current_usuario_id())` |
| `notificaciones` | cualquier activo | dueño (`usuario_id = current_usuario_id()`) | dueño o admin | marcar leído es la única escritura normal |
| `campos_personalizados` | admin | admin + excepción ventas en `nicho` (ver 3.6) | admin | |
| `logs_sistema` | cualquier activo (`WITH CHECK` propio) | nadie, ni admin | nadie | requiere arreglar `lib/logger.ts:34` |
| `ventas` (legacy) | — | — | — | RLS activo, cero políticas = deny-all; `COMMENT ON TABLE` deprecated |
| `abonos` (si existe) | finanzas | finanzas | admin | solo si Fase 0 confirma que existe |

Usar siempre `FOR INSERT`/`FOR UPDATE`/`FOR DELETE` explícitos, nunca `FOR ALL` (ese fue justo el patrón que hizo tan permisivas las políticas actuales).

### 3.5 `oportunidades` — la tabla ambigua
Cubre las 4 áreas vía `estado_pipeline` (16 estados). Propuesta de dos capas:
- **Capa 1 (RLS):** UPDATE amplio para ventas/finanzas/programacion/administracion (como hoy).
- **Capa 2 (trigger `enforce_oportunidad_transition()`):** qué rol puede mover a qué estado — `nueva→pagada` solo finanzas (validación de pagos); estados `prod_*` y `rev_*` solo programacion (confirmar si reventa es logística o comercial); campos de pago (`monto_abonado`, `comprobantes_pago`) solo finanzas/admin. **Recomendación: lanzar primero en modo auditoría** (loguea violaciones en `logs_sistema` sin bloquear, una semana) antes de pasar a `RAISE EXCEPTION` — forzar transiciones a ciegas es la forma más probable de romper la operación del día uno.

### 3.6 `campos_personalizados` — segunda ambigüedad
`app/clientes/page.tsx:186` necesita escribir ahí desde ventas. Recomendado: política con excepción puntual (`has_role('admin') OR (has_role('ventas') AND campo_supabase='nicho')`) ahora; separar en tabla `catalogo_nichos` como mejora futura. También: mover el `useEffect` de `configuracion/page.tsx` que hace upsert del seed detrás de un guard `if (currentUser?.rol !== 'admin') return;` **dentro del efecto**, no solo en el render.

### 3.7 Storage
- `cotizaciones-pdf`: quitar las 4 políticas públicas actuales (`schema.sql:218-221`, permiten INSERT/UPDATE/DELETE anónimo). Mantener SELECT público (se comparte por link con clientes); INSERT/UPDATE/DELETE solo `authenticated` + rol ventas.
- `documentos` (comprobantes de pago): **no existe en schema.sql, crearlo.** Decisión pendiente del usuario: bucket privado + `createSignedUrl` (requiere cambiar `app/ventas/page.tsx:1400,2653` de `getPublicUrl` a `createSignedUrl` y guardar el path en vez de la URL) vs. mantenerlo público solo restringiendo escritura (riesgo residual aceptado explícitamente).

### 3.8 Seguridad del rollout
Aplicar primero en una base de staging/branch de Supabase (no hay suite de tests automatizada). Verificar especialmente los flujos `upsert`.

---

## Fase 4 — Integridad de datos ("todo dato vive en Supabase")

1. `app/proveedores/page.tsx:137-143` — quitar el fallback local `fallbackPed` que crea una fila falsa si el insert falla; mostrar error real en su lugar.
2. `lib/context/AuthContext.tsx:94-101` — quitar el usuario sintético `usr-${Date.now()}` en `addUser` on error.
3. `app/caja/page.tsx:80` — usar `currentUser.id` en vez de `usuario_id: null` (viola el NOT NULL del schema); importar `useAuth`.
4. `app/caja/page.tsx` — manejar explícitamente el `error` del insert (hoy se ignora).
5. Resolver `abonos(*)` según lo que confirme la Fase 0 (quitar el embed y usar `comprobantes_pago`, o dar de alta la tabla).
6. Marcar `ventas` como deprecated (comentario en SQL + `@deprecated` en `lib/types.ts:211`), borrar `MOCK_VENTAS`.
7. Quitar imports muertos de mock-data en `app/page.tsx:7`, `app/ventas/page.tsx:6`, `app/clientes/page.tsx:6`; borrar `lib/supabase/mock-data.ts` una vez la Fase 1 quite su último uso real (AuthContext).
8. `lib/logger.ts:34` — dejar de escribir `usuario_id: null`; derivarlo de la sesión.
9. Introducir `lib/errors.ts` con un `reportError()` que no imprima detalles internos de Supabase en producción (hoy ~15 archivos hacen `console.error(err)` con mensajes de política/constraint visibles en devtools).
10. Reconciliar `lib/types.ts` con el schema autoritativo de la Fase 0.

---

## Fase 5 — Realtime completo

Patrón a copiar (ya usado en `app/notificaciones/page.tsx:45-64`): `supabase.channel(name).on('postgres_changes', {event:'*', schema:'public', table:'X'}, reload).subscribe()` + `removeChannel` en cleanup.

| Archivo | Cambio |
|---|---|
| `app/page.tsx` (dashboard) | canal sobre `cotizaciones`, `oportunidades`, `clientes` |
| `app/proveedores/page.tsx` | canal sobre `proveedores` + `pedidos_proveedor` |
| `app/caja/page.tsx` | canal sobre `caja_movimientos` |
| `app/configuracion/page.tsx` | canal sobre `campos_personalizados` + `usuarios` |
| `components/Sidebar.tsx:39-58` | quitar el `setInterval` de 8s; suscribir a `notificaciones` con `.eq('usuario_id', currentUser.id)` (hoy cuenta las notificaciones de **todos**, bug + fuga menor de info) |
| `components/Navbar.tsx:51` | conectar el badge de campana (hoy hardcodeado) al conteo real |

Notas: Realtime respeta RLS — una vez aplicada la Fase 3, un canal sobre una tabla que el rol no puede leer no entregará nada (verificar en Fase 6). Cada tabla necesita estar en la publicación `supabase_realtime` (chequeado en Fase 0). Consolidar canales duplicados por página donde ya hay dos (`visitas`, `planificacion`, `reventa` tienen 2 cada una; pueden ser 1 con dos `.on()`, como ya hace `ventas/page.tsx:562`).

---

## Fase 6 — Verificación

1. **Auth:** password incorrecta rechazada (hoy pasa); forjar `localStorage` ya no otorga sesión; navegar directo a ruta protegida sin sesión → redirect del middleware sin que se disparen fetchs de datos; desactivar un usuario → la próxima request lo saca.
2. **RLS por REST crudo con la anon key**, por cada uno de los 5 roles: lecturas permitidas (modelo abierto), escrituras fuera de su tabla rechazadas, `anon` sin JWT → todo rechazado (la prueba que hoy fallaría en las 10 tablas), `logs_sistema` inmutable incluso para admin, upload no autenticado a Storage rechazado, y los flujos positivos de `upsert` (INSERT+UPDATE combinados).
3. **Realtime:** dos navegadores/roles, confirmar reflejo en <1s en dashboard/proveedores/caja/configuracion/badge; confirmar que un rol sin SELECT sobre una tabla no recibe sus eventos.
4. **Regresión funcional rol por rol:** flujo completo de cada rol (ventas: cliente→cotización→oportunidad→cierre; finanzas: validar pago→caja; programación: cambios de estado en planificación/reventa; administración: proveedores/pedidos).
5. `npm run build` y `npm run lint`.
6. Actualizar `CLAUDE.md` (hoy su árbol de directorios sigue listando `mock-data.ts` y no menciona `middleware.ts`, `lib/supabase/server.ts`, `app/auth/*`, `supabase/migrations/`, ni las rutas `/ventas`, `/planificacion`, `/reventa`, `/visitas`, `/configuracion` que ya existen).

---

## Riesgos y supuestos abiertos

1. **Todo el plan depende de la Fase 0**, que depende del MCP de Supabase autorizado. Sin él, fallback es exportar el schema manualmente desde el dashboard — pero no se debe pasar a la Fase 3 solo con el `schema.sql` actual.
2. **No hay suite de tests.** Toda verificación de RLS es manual; preferible una base de staging/branch antes de aplicar en producción.
3. **La trampa del `upsert`**: `proyectos_planificacion`/`ordenes_reventa`/`campos_personalizados` necesitan política INSERT y UPDATE para el mismo rol.
4. **Costo del middleware**: chequear `activo` en cada request agrega un round-trip. Alternativa (opcional): custom access token hook con `rol`/`activo` como claims del JWT (hasta 1h de latencia en cambios de rol, a cambio de políticas sin lookup).
5. **Privacidad del bucket `documentos`**: decisión de producto, no técnica — pendiente de tu confirmación.
6. **Trigger de transición de `estado_pipeline`**: puede romper flujos si se aplica sin modo auditoría primero.
7. **`app/ventas/page.tsx` tiene ~4,552 líneas** y toca 8 tablas + el bucket de Storage — el archivo de mayor riesgo en las Fases 3-5, merece una pasada de verificación dedicada.
8. **Dueño de los estados `rev_*`** (reventa): por defecto asignado a `programacion`; confirmar si en realidad es un flujo comercial de `ventas`.

---

## Archivos críticos
- `supabase/schema.sql`, `supabase/migrations/` (nuevo)
- `lib/context/AuthContext.tsx`, `app/login/page.tsx`, `components/AuthGuard.tsx`
- `middleware.ts` (nuevo), `lib/supabase/server.ts` (nuevo), `lib/supabase/client.ts`
- `app/ventas/page.tsx` (mayor superficie de riesgo)
- `lib/types.ts`, `lib/supabase/mock-data.ts` (a eliminar), `lib/logger.ts`
- `app/caja/page.tsx`, `app/proveedores/page.tsx`, `app/configuracion/page.tsx`, `components/Sidebar.tsx`
