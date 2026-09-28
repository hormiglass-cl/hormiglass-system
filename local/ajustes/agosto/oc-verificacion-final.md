# Verificacion final modulo Ordenes de Compra

Fecha: 2026-08-21 America/Santiago

## Alcance del plan

- Modelo Supabase para `ordenes_compra` y `orden_compra_items`.
- Tipos TypeScript para OC, items y proveedor extendido.
- Vista principal `/ordenes-compra`.
- Formulario `/ordenes-compra/nuevo`.
- Modal de creacion/edicion rapida.
- Preview/impresion con formato oficial Hormiglass.
- Integracion con menu lateral, proveedores y oportunidades.
- Reglas adicionales: no duplicar OC, versionado tipo cotizaciones, y no permitir que una OC quede asociada a ambas ramas.

## Evidencia automatica

- `npm run build`: aprobado.
- Lint enfocado en OC/auth/tipos/logger: aprobado.
- Ruta local `/login`: responde `200 OK`.
- Ruta protegida `/ordenes-compra` sin sesion: redirige a `/login` con `307`.
- Supabase remoto lista migraciones `0016_restrict_internal_function_execute` y `0017_harden_legacy_helper_functions`.
- Supabase remoto:
  - `duplicate_numero_oc`: 0.
  - `codex_test_oc_leftovers`: 0.
  - `orphan_oc_items`: 0.
  - `ordenes_compra_numero_oc_key`: constraint UNIQUE activa.
  - `orden_compra_items_orden_compra_id_fkey`: `ON DELETE CASCADE`.

## Validacion manual reportada por el usuario

- Login con usuario real: aprobado.
- Bloqueo de OC duplicada por mismo codigo: aprobado.
- Edicion sobrescribiendo version actual: aprobado.
- Edicion creando nueva version: aprobado.
- Cambio de rama con OC vinculada: aprobado; el mensaje aparece y permite desvincular.
- Plantilla/preview PDF: aprobado.

## Ajustes posteriores a la validacion manual

- Articulos de OC: se agrego encabezado de columnas para identificar codigo, descripcion, cantidad, precio unitario CLP, total CLP y quitar.
- Montos en creacion de OC: los campos monetarios muestran prefijo CLP y los calculos usan formato de peso chileno.
- Mensaje de duplicado: queda sin prefijo generico, por ejemplo `Ya existe una orden de compra con el numero IMC-240.`
- Oportunidades: se quitaron los textos visibles `Seccion 1/2/3` de titulos y grupos.
- Oportunidades: `Rama Activa` y los bloques OC de Produccion/Reventa dependen de la etapa actual (`prod_` o `rev_`), no del `rama_destino` historico. Al volver a Venta, ninguna rama queda marcada activa por la ultima rama usada.
- Pipeline: la vista tablero se dividio en pestanas por seccion; dentro de cada seccion se visualizan sus etapas como columnas.
- Pipeline: se quitaron badges de seccion, descripciones y varios elementos tipo pastilla en lista/tablero para dejar una lectura mas sobria; en lista se mantuvieron los circulos de estado.
- Oportunidad: produccion y reventa/logistica tienen activador persistente `activo`, similar a visita terreno.
- Oportunidad: los bloques internos de produccion, bitacora, OC de produccion, reventa y OC de reventa quedaron contraibles.
- Oportunidad: los elementos internos de produccion usan morado y los de reventa/logistica usan indigo, alineados con el color de cada seccion.
- Oportunidad: produccion y reventa/logistica usan el mismo estilo de header, switch y enlaces operativos que visita terreno/comercial.
- Mensajes visibles: se reemplazaron mensajes tecnicos/originales de Supabase por textos de usuario reescritos.
- Error `local/errors/errors-9.md`: el duplicado de OC ya no lanza un `Error` ni genera Console Error; ahora queda como validacion controlada en el formulario.
- Produccion y Logistica: se reemplazo el antiguo concepto visible de calendario de obra/fabricacion por `Produccion y Logistica`.
- Produccion y Logistica: se agrego tabla `eventos_produccion_logistica` para registrar multiples eventos por oportunidad, separados por calendario `obra`, `logistica` o `produccion`.
- Oportunidad: el registro de eventos de Produccion y Logistica ahora funciona como visitas a terreno: boton `Agregar Evento`, formulario inline y lista de eventos registrados.
- Calendario `Produccion y Logistica`: muestra los nuevos eventos multiples por fecha y mantiene los hitos antiguos de planificacion como compatibilidad.
- Oportunidad: el switch habilitado/deshabilitado aplica solo a eventos; los datos de Produccion y Logistica y los datos de Reventa y Logistica quedan editables al desplegar.
- Reventa y Logistica: se agrego el mismo funcionamiento de eventos con calendario, switch, formulario inline y lista de eventos registrados.
- Eventos: Produccion usa sus estados existentes; Obra y Logistica usan estados predeterminados mientras se define el flujo final.
- Oportunidad: se ocultaron las secciones internas `Datos de Produccion y Logistica` y `Datos de Logistica & Reventa`; el uso operativo queda concentrado en eventos.
- Responsables: se agrego tabla `responsables_calendarios` con seleccion multiple de calendarios (`obra`, `logistica`, `produccion`).
- Eventos: los responsables ahora se seleccionan desde `responsables_calendarios` filtrando por el calendario elegido; se agrego `responsable_calendario_id` sin eliminar el campo historico `responsable_id`.
- Calendario `Produccion y Logistica`: permite agregar responsables y asignarlos a uno o varios calendarios desde la pantalla del calendario.

## Reglas cubiertas

- Duplicados: bloqueados por validacion en `OrdenCompraModal` y por constraint UNIQUE en Supabase.
- Edicion: si hay cambios, el modal permite sobrescribir version actual o crear nueva version `-vN`, alineado con cotizaciones.
- Cambio de rama: si la oportunidad ya tiene OC vinculada y se cambia a otra rama, se exige desvincular o eliminar la OC antes del cambio.
- Integridad de guardado: si falla la insercion de items en una OC nueva/nueva version, se elimina el encabezado recien creado.
- Borrado OC: restringido en UI y RLS a usuarios admin para la OC principal.
- Items OC: reemplazo valida error de borrado/insercion para evitar inconsistencias silenciosas.

## Riesgos residuales fuera del alcance OC

- El lint completo del proyecto sigue teniendo deuda preexistente fuera de los archivos OC/auth/tipos/logger.
- Supabase advisors aun reportan avisos no especificos de OC:
  - `public.ventas` con RLS habilitado pero sin policies.
  - helpers RLS `current_rol`, `current_usuario_id`, `has_role`, `is_active_user` ejecutables por usuarios autenticados.
  - `create_user_admin` ejecutable por usuarios autenticados, con validacion interna de rol admin.
  - leaked password protection desactivado en Auth.

## Validacion manual pendiente despues de los ultimos ajustes

El usuario debe aceptar o rechazar despues de revalidar:

1. Encabezados de articulos y formato CLP en `/ordenes-compra/nuevo`.
2. Mensaje exacto al intentar repetir numero de OC.
3. Que al volver una oportunidad desde Produccion/Reventa a Venta no quede ninguna rama marcada como activa.
4. Que los titulos ya no muestren `Seccion 1/2/3`.
5. Que el tablero por pestanas permita revisar cada estado con espacio suficiente.
6. Que produccion y reventa/logistica se puedan habilitar/deshabilitar y mantengan ese estado al recargar.
7. Que todos los bloques internos relevantes de la oportunidad se puedan contraer.

## Evidencia adicional 2026-08-21

- `npm run build`: aprobado despues de los cambios de pipeline y activadores.
- Supabase MCP `apply_migration`: aprobado para `0018_add_active_flags_to_operational_branches`.
- Supabase MCP `execute_sql`: confirmo `activo BOOLEAN NOT NULL DEFAULT TRUE` en `proyectos_planificacion` y `ordenes_reventa`.
- Supabase MCP `apply_migration`: aprobado para `0020_rename_produccion_logistica_event_types` y `0021_expand_eventos_produccion_logistica_statuses`.
- Supabase MCP `execute_sql`: confirmo constraints de `eventos_produccion_logistica` con tipos `obra/logistica/produccion` y estados ampliados.
- Supabase MCP `apply_migration`: aprobado para `0022_responsables_calendarios` y `0023_eventos_responsable_calendario_id`.
- Supabase MCP `execute_sql`: confirmo tabla `responsables_calendarios` y columna `eventos_produccion_logistica.responsable_calendario_id`.
- `npm run build`: aprobado despues de mover responsables a la tabla dinamica.
- `npx eslint components/OrdenCompraModal.tsx`: aprobado.
- `npm run build`: aprobado despues del ajuste de tablero por seccion y del error de duplicado OC.
- Supabase MCP `apply_migration`: aprobado para `0019_eventos_produccion_logistica`.
- Supabase MCP `execute_sql`: confirmo que `eventos_produccion_logistica` existe.
- `npm run build`: aprobado despues de agregar eventos multiples de Produccion y Logistica.
- `npx eslint app/ventas/page.tsx components/OrdenCompraModal.tsx`: falla por deuda existente en `app/ventas/page.tsx` (`any`, imports sin uso y reglas historicas); no bloquea build.
