# Inventario de secciones del CRM — auditoría y checklist de rediseño por fases

Regla: una fase a la vez. Al terminar una fase se muestra evidencia (build/lint + capturas antes/después) y se espera confirmación antes de la siguiente. Referencia de estilo: Fase A (Acceso), calificada 10/10 por el usuario. Se mantienen los tokens de `app/globals.css` y los componentes de `components/ui`.

Fuera de alcance: documentos generados (PDF de cotización, PDF de orden de compra, guía de despacho, impresiones).

**Auditoría re-hecha el 2026-11-06**, después de que otra IA depurara varias secciones. Tamaño = líneas del archivo.

## Qué cambió respecto al inventario anterior

La otra IA reestructuró la navegación. Estas rutas **ya no tienen interfaz propia** (solo redirigen):

| Ruta retirada | Ahora va a |
|---|---|
| `/planificacion` | `/ventas?rama=produccion` |
| `/reventa` | `/ventas?rama=reventa` |
| `/visitas` | `/calendarios/general?contexto=visitas` |
| `/planificacion/calendario` | `/calendarios/general?contexto=produccion_logistica` |
| `/reventa/calendario` | `/calendarios/general?contexto=reventa_logistica` |
| `/cotizaciones/nuevo` | `/cotizaciones?nueva=1` (modal) |
| `/ordenes-compra/nuevo` | `/ordenes-compra?nueva=1` (modal) |
| `/ventas/[id]/operacion` | `/ventas/[id]?tab=operacion` |
| `/usuarios` | `/configuracion` |
| `/recordatorios` | `/administracion` |

Menú lateral de Calendarios: pasó de 5 ítems a 2 (Calendario operativo, Programa semanal).
`/ventas/[id]` creció de 885 a 2908 líneas (absorbió operación; 4 pestañas: resumen, cotizaciones, abastecimiento, operación). `/ventas` bajó de 6584 a 5093.
Componente nuevo: `components/VisitasTerrenoCalendar.tsx` (773).

## Estado de salud medido hoy

- Tipos (`tsc`): sin errores.
- Tokens de diseño en `app/` y `components/`: 0 colores hex y 0 clases `gray/slate` sueltas en las pantallas. La migración de color ya está hecha; la deuda restante es de **estructura y coherencia**, no de color. (Excepciones esperadas: PDF, `SearchableSelect`, `AuthShell`.)
- Lint: **44 errores, 118 avisos** (antes 88 errores). Errores: 19 `any`, 12 `setState` dentro de efecto, 7 `purity`, 3 `immutability`, 2 `preserve-manual-memoization`, 1 `refs`. **29 de los 44 están en `app/ventas/page.tsx`.**
- Ventanas emergentes propias (`fixed inset-0`) que no usan `Dialog`/`Sheet` de `components/ui`: 5 en `app/ventas/page.tsx`, 1 en `app/clientes/page.tsx`, y las de `CotizacionModal`, `OrdenCompraModal`, `PdfPreviewModal`, `OrdenCompraPdfPreviewModal` (las de PDF quedan fuera).
- Hallazgos de coherencia: enlaces a rutas retiradas (funcionan por redirección, pero dan un salto extra):
  - `app/page.tsx:887` y `:1200` → `/planificacion/calendario`
  - `components/dashboard/TasksActivityCard.tsx:174` → `/planificacion/calendario`
  - `components/Navbar.tsx:18-19` títulos de `/ordenes-compra/nuevo` y `/cotizaciones/nuevo` (ya no son páginas)
  - `components/AuthGuard.tsx:29-33` lista del rol `mano_obra` con rutas retiradas
- `app/ventas/[id]/operacion/page.tsx` es una pantalla de “Redirigiendo…” hecha con efecto de cliente; las demás usan `redirect()` de servidor.
- Base de datos: hay 2 migraciones locales sin versionar (`20261106010000_unificar_personal_y_usuarios`, `20261106020000_normalizar_abonos_visitas_y_bitacora`). **No pude verificar si están aplicadas**: el acceso Supabase de esta sesión no tiene permiso sobre el proyecto.

## Fase A — Acceso
| Sección | Ruta | Archivo | Líneas |
|---|---|---|---|
| Inicio de sesión / registro | `/login` | app/login/page.tsx | 264 |
| Recuperar contraseña (código de 6 dígitos) | `/auth/recuperar` | app/auth/recuperar/page.tsx | 276 |
| Definir nueva contraseña | `/auth/actualizar-password` | app/auth/actualizar-password/page.tsx | 89 |

## Fase B — Estructura (shell)
| Sección | Archivo | Líneas | Pendiente |
|---|---|---|---|
| Barra lateral | components/Sidebar.tsx | 245 | 1 error de lint (efecto) |
| Cabecera, migas, usuario, buscador ⌘K | components/Navbar.tsx | 304 | títulos de rutas retiradas |
| Contenedor y guardia | components/AppShell.tsx, AuthGuard.tsx | 48 / 61 | 1 error de lint; lista `mano_obra` |
| Navegación (fuente única) | lib/navigation.ts | — | revisar nombres tras la fusión de calendarios |

## Fase C — Inicio y pipeline
| Sección | Ruta | Archivo | Líneas | Pendiente |
|---|---|---|---|---|
| Panel operativo | `/` | app/page.tsx + components/dashboard/* | 1394 + ~1350 | 2 enlaces rotos; 1 error de lint |
| Pipeline de ventas (kanban/tabla, ramas producción y reventa) | `/ventas` | app/ventas/page.tsx + KanbanCard | 5093 | 29 errores de lint; 5 ventanas propias; archivo muy grande |
| Ficha maestra de venta (4 pestañas) | `/ventas/[id]` | app/ventas/[id]/page.tsx | 2908 | archivo muy grande |

## Fase D — Comercial
| Sección | Ruta | Archivo | Líneas | Pendiente |
|---|---|---|---|---|
| Clientes | `/clientes` | app/clientes/page.tsx, ClienteDrawer | 1220 | 1 ventana propia |
| Ficha de cliente | `/clientes/[id]` | app/clientes/[id]/page.tsx | 1775 | — |
| Cotizaciones + modal de nueva | `/cotizaciones` | app/cotizaciones/page.tsx, CotizacionModal | 682 / 772 | modal con overlay propio |
| Postventa y garantías | `/postventa` | app/postventa/page.tsx | 1740 | 1 error de lint |

## Fase E — Compras y catálogo
| Sección | Ruta | Archivo | Líneas | Pendiente |
|---|---|---|---|---|
| Órdenes de compra + modal de nueva | `/ordenes-compra` | app/ordenes-compra/page.tsx, OrdenCompraModal | 563 / 782 | modal con overlay propio |
| Asignaciones de una OC | `/ordenes-compra/[id]/asignaciones` | .../asignaciones/page.tsx | 301 | — |
| Proveedores | `/proveedores` | app/proveedores/page.tsx | 758 | — |
| Productos e insumos | `/productos` | app/productos/page.tsx | 972 | — |

## Fase F — Calendarios
| Sección | Ruta | Archivo | Líneas | Pendiente |
|---|---|---|---|---|
| Calendario operativo (contextos: todos, visitas, producción, reventa) | `/calendarios/general` | app/calendarios/general/page.tsx | 670 | reescrito por la otra IA: validar |
| Componente de eventos | — | components/CalendarioEventos.tsx | 1325 | verificar usos de `confirm/alert` |
| Calendario de visitas a terreno (nuevo) | — | components/VisitasTerrenoCalendar.tsx | 773 | verificar 1 uso de `confirm/alert` |
| Programa semanal | `/planificacion/semana` | app/planificacion/semana/page.tsx | 282 | — |

## Fase G — Finanzas
| Sección | Ruta | Archivo | Líneas | Pendiente |
|---|---|---|---|---|
| Caja | `/caja` | app/caja/page.tsx | 1025 | 2 errores de lint |
| Bancos y empresas | `/caja/configuracion` | app/caja/configuracion/page.tsx | 952 | — |
| Reportes | `/reportes` | app/reportes/page.tsx | 977 | — |

## Fase H — Administración y RR.HH.
| Sección | Ruta | Archivo | Líneas | Pendiente |
|---|---|---|---|---|
| Sociedades Comercial / Transportes / Inmobiliaria | `/administracion?empresa=…` | app/administracion/page.tsx | 1796 | 3 ventanas; revisar pestañas |
| Recursos humanos | `/rrhh` | app/rrhh/page.tsx | 1296 | — |
| Ficha de trabajador | `/rrhh/[id]` | app/rrhh/[id]/page.tsx | 3238 | 7 ventanas; revisar usos de `confirm/alert` |

## Fase I — Sistema
| Sección | Ruta | Archivo | Líneas | Pendiente |
|---|---|---|---|---|
| Notificaciones | `/notificaciones` | app/notificaciones/page.tsx | 1097 | 1 error de lint |
| Configuración (usuarios, roles, accesos) | `/configuracion` | app/configuracion/page.tsx | 745 | — |

## Fuera del menú
- `/diseno` — galería interna de tokens y componentes (185).
- Guía de despacho `/ventas/[id]/operacion/guias/[guiaId]` — documento, fuera de alcance.

## Componentes compartidos
components/ui/ (crm.tsx con 2 errores de lint, feedback.tsx, MetricCard, FilterPills, SlideOverDrawer, FloatingActionBar, AvatarBadge), components/SearchableSelect.tsx (11 hex sueltos), modales CotizacionModal y OrdenCompraModal (parte de formulario).

## Estado
- **Fase A — Acceso:** terminada y validada por el usuario (2026-11-06). Referencia de estilo para las demás.
- **Auditoría general:** hecha el 2026-11-06. Pendiente: referencias visuales del usuario y su orden de prioridad.
- **Fase B — Estructura:** cerrada por el usuario (2026-11-06). Barra lateral oscura a pantalla completa y sin márgenes (escena de Fase A); Notificaciones y Configuración siempre visibles al pie (solo íconos al contraer), buscador ⌘K arriba (ahora en `components/CommandPalette.tsx`), campana quitada de la cabecera (las notificaciones quedan en la barra). Tokens `night-*` en `app/globals.css`.
- **Fase C — Inicio y pipeline:** cerrada, pendiente de validación del usuario. Panel operativo rediseñado; pipeline `/ventas` con la oportunidad como panel único (la ficha `/ventas/[id]` quedó archivada en `app/ventas/_ficha-archivada` con redirecciones); formularios de la oportunidad en pop-ups; vínculo de cotizaciones por pop-up; lint en 0 errores y 0 advertencias. Migración `20261106030000_inventario_stock_produccion.sql` creada pero NO aplicada en producción (pendiente de aplicar por el usuario). Fase D no iniciada.
- Fases D–I: sin iniciar.
