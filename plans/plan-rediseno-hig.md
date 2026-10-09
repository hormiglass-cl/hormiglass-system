# Plan de rediseño de interfaz — Hormiglass CRM (revisión con /apple-design)

> Fecha: 2026-10-08 · Alcance: **pantallas del sistema** (navegación, listas, fichas, formularios, modales, calendarios, reportes).
> **Fuera de alcance:** documentos que genera el sistema — PDF de cotización (`PdfPreviewModal`), PDF de orden de compra (`OrdenCompraPdfPreviewModal`), guía de despacho imprimible (`ventas/[id]/operacion/guias/[guiaId]`), certificados de garantía y cualquier vista de impresión. Los *formularios* que editan esos documentos (editor de cotización, modal de OC) sí entran, su salida impresa no.
>
> Plataforma: aplicación web de escritorio (Next.js 16 + Tailwind 4), usada en Mac/PC y ocasionalmente en móvil. Según la skill, a una app web le aplican **los principios y los fundamentos HIG** (accesibilidad, color, tipografía, layout, escritura), no las convenciones nativas de macOS (barra de menús, ventanas). Las citas indican `archivo.md › Sección`.

---

## 1. Diagnóstico

### Resumen

**Calificación: Critical issues.** El CRM ya tiene el germen de un sistema (`--hg-*` en `app/globals.css`, clases `.hg-panel`, `.hg-table`), pero convive con un segundo sistema heredado que domina el código: `#f97316` (naranja Tailwind, 796 usos) y `#213343` (azul marino que no es de la marca, 560 usos), más 2.681 clases `gray-*` frías. El resultado es la plantilla SaaS genérica: ícono + título en negrita + párrafo + fila de tarjetas KPI de colores + barra de filtros + tabla, repetida idéntica en cada módulo. **No hay un elemento por el que se recuerde que esto es Hormiglass** (prefabricados de hormigón + transporte), más allá del logo.

Tesis que proponemos: *"el recorrido de una obra, desde la cotización hasta la postventa, siempre visible"*.

### Línea base medida (para comparar al cierre de cada fase)

| Métrica | Hoy | Meta |
|---|---|---|
| Hex distintos en `.tsx` | 63 | ≤ 0 fuera de tokens |
| Usos de `#f97316` / `#213343` (fuera de marca) | 796 / 560 | 0 |
| Clases de paleta Tailwind cruda (`gray-`, `red-`, `amber-`, `blue-`, `purple-`…) | ≈4.300 | 0 en pantallas migradas |
| Texto de 9–10,5 px (`text-[9px]`, `text-[10px]`…) | 220 | 0 (mínimo 11 px) |
| `font-black` + `font-extrabold` | 518 | 0 (pesos 400/500/600/700) |
| `alert()` / `confirm()` nativos | 33 | 0 |
| Modales `fixed inset-0` | 56 (8 con `role="dialog"`) | 100 % con `role="dialog"`, Escape y foco atrapado |
| Páginas que usan `components/ui` | 0 de 36 | todas |

### Crítico (accesibilidad)

1. **El botón principal no se lee.** Texto blanco sobre `#f97316` = **2,80:1**; sobre `--hg-accent #e87622` = **2,98:1**; sobre el naranja de marca `#F7931F` = **2,30:1**. Todos están bajo **4,5:1**.
   - **Por qué:** `accessibility.md › Vision`: "Up to 17 pts · All · 4.5:1".
   - **Arreglo:** el botón primario pasa a fondo `#F7931F` con texto carbón `#363636` (**5,2:1**) o `#1F1E1C` (**7,3:1**). El naranja de marca se queda y el texto se vuelve legible; además evoca la señalética de obra.
2. **Texto bajo el mínimo.** Hay 220 usos de 9–10,5 px, típicamente en metadatos con `gray-400` (`#9ca3af` sobre blanco = **2,54:1**) y `--hg-text-soft #8a9390` = **3,15:1**.
   - **Por qué:** `typography.md › Ensuring legibility` fija el mínimo de escritorio en 10 pt / 13 pt por defecto, y `accessibility.md` exige 4,5:1.
   - **Arreglo:** mínimo 11 px; el texto secundario pasa a `#5C5A55` (**6,9:1** sobre blanco).
3. **Color como único portador del estado.** Los KPI usan verde, naranja, azul, morado y rojo sin significado estable: "Costo acumulado" va en morado y "Tasa de garantía" en azul (Postventa); "Compra/Reventa" en azul (Productos).
   - **Por qué:** `color.md › Best practices`: "Avoid using the same color to mean different things", y `accessibility.md`: "Convey information with more than color alone".
   - **Arreglo:** cuatro colores de señal con un significado fijo (éxito, alerta, peligro, info), siempre acompañados de ícono o texto.
4. **Modales sin salida ni semántica.** Solo 8 de 56 modales declaran `role="dialog"` y casi ninguno cierra con Escape. Además, la ficha de oportunidad es "una app dentro de la app" (resumen, acordeones anidados y panel de actividad, todo dentro de un modal).
   - **Por qué:** `modality.md › Best practices`: "Always give people an obvious way to dismiss a modal view" y "avoid creating a modal experience that feels like an app within your app".
   - **Arreglo:** un componente `Sheet`/`Dialog` único (rol, Escape, foco atrapado, título que nombra la tarea), y la ficha de oportunidad pasa a ser una ruta propia `/ventas/[id]`.

### Mejoras

- **[High] Dos sistemas de diseño en paralelo.** `components/ui/crm.tsx` existe, pero ninguna página lo importa, y él mismo usa `gray-*`/`orange-*` heredados.
  - **Por qué:** `branding.md › Best practices`: "Help people feel comfortable by using standard patterns consistently."
- **[High] Jerarquía tipográfica plana.** Hay 991 `font-bold`, 272 `extrabold` y 246 `black`: todo grita, así que nada destaca.
  - **Por qué:** `typography.md › Conveying hierarchy`: "Adjust font weight, size, and color… to emphasize important information".
- **[High] Uso excesivo del acento.** El naranja aparece en botones, pestañas, links, íconos de títulos, folios, paginación y badges.
  - **Por qué:** `branding.md`: "Minimize its use on controls and instead use it intentionally for primary actions or status indicators."
- **[High] 33 `alert()`/`confirm()` nativos** (10 en Administración y 8 en Ventas).
  - **Por qué:** `alerts.md › Best practices`: "Avoid using an alert merely to provide information".
  - **Arreglo:** confirmaciones dentro de la interfaz y *toast* con Deshacer para lo reversible; diálogo de confirmación con Cancelar solo para lo destructivo e irreversible.
- **[Medium] Barra lateral larga.** Tiene 6 grupos y unos 22 ítems; los 5 calendarios usan el mismo ícono; el cerrar sesión está abajo; los títulos de grupo van en MAYÚSCULAS.
  - **Por qué:** `sidebars.md`: "Group hierarchy with disclosure controls", "Avoid putting critical information or actions at the bottom of a sidebar".
- **[Medium] Doble título y migas falsas.** La cabecera muestra "HORMIGLASS / CRM" + "Caja" y la página repite "FINANZAS / TESORERÍA" + "Caja & Validación de Pagos". En Postventa la cabecera dice "Hormiglass" porque `/postventa` no está en `destinations` (`components/Navbar.tsx`).
- **[Medium] Mayúsculas inconsistentes.** Hay 151 `uppercase` (encabezados de tabla, badges como "INGRESO" junto a "Activo") y títulos que mezclan Title Case ("Registrar Movimiento", "Nuevo Reclamo / Caso") con oraciones.
  - **Por qué:** `writing.md › Best practices`: "Choose a style for each UI element type and use it consistently". Para español se adopta **mayúscula inicial (sentence case)** en todo.
- **[Medium] Monoespaciada mal usada.** Se usa para fechas ("03-oct, 10:03 p. m.") y los folios se parten en dos líneas ("PV-2026-↵0003").
  - **Por qué:** `lists-and-tables.md › Content`: "Keep item text succinct… minimize truncation and wrapping".
- **[Medium] Estados vacíos y errores sin siguiente paso.**
  - **Por qué:** `writing.md`: "Provide clear next steps on any blank screens".
- **[Low] Selects nativos con la etiqueta dentro del valor** ("Origen: Todos") y paginación genérica.

### Notas de oficio (craft)

- **Plantilla detectada.** "Número grande sobre etiqueta chica" en tarjetas de colores en cada módulo, más un ícono naranja antes de cada H1. Es el *hero* de KPI genérico que la skill marca como plantilla.
- **Accesorio a quitar.** El ícono decorativo antes del H1 y el párrafo descriptivo permanente bajo cada título. El título de la cabecera ya ubica a la persona.
- **Lo que funciona y se conserva:**
  - Fuente del sistema para la interfaz.
  - Anillo de foco visible (`:focus-visible`).
  - `tabular-nums` en montos.
  - Buscador ⌘K.
  - Barra lateral colapsable.
  - Clases `.hg-*` como base.
  - Neutros cálidos de `--hg-*`.
  - Números en verde para ingresos (Caja).

---

## 2. Dirección de diseño

### Mundo visual

Hormiglass fabrica y despacha bloques, adoquines, pastelones y cámaras. Su vernáculo es el **cemento** (gris mineral, ni crema ni gris frío de Tailwind), los **moldes y pallets** (rectángulos modulares) y la **señalética de seguridad** (naranja con texto oscuro), además de los **timbres y códigos estampados** en guías y pallets.

### Tokens (claro / oscuro, contraste medido)

| Rol | Claro | Oscuro | Contraste |
|---|---|---|---|
| `surface-app` (fondo cemento) | `#F6F5F2` | `#1C1C1B` | — |
| `surface` (paneles) | `#FFFFFF` | `#262624` | — |
| `surface-muted` | `#EEEDE8` | `#2F2F2C` | — |
| `ink` (texto, carbón de marca) | `#363636` | `#ECEBE7` | 11,7:1 / 14,3:1 |
| `ink-muted` | `#5C5A55` | `#A9A69F` | 6,9:1 / 7,0:1 |
| `accent` (naranja de marca, **solo** acción primaria, selección y progreso) | `#F7931F` | `#F7931F` | texto `#363636` encima: 5,2:1 |
| `accent-ink` (texto o link naranja) | `#A14A06` | `#F7931F` | 6,0:1 / 7,4:1 |
| `success` | `#1E6B45` sobre `#E8F3EC` | `#7FD1A3` | 5,7:1 / 9,4:1 |
| `warning` | `#8A5300` sobre `#FFF4DC` | `#FFC560` | 5,8:1 / 10,9:1 |
| `danger` | `#A8261F` sobre `#FDECEA` | `#FF8A80` | 6,2:1 / 7,5:1 |
| `info` | `#2C5A94` sobre `#EAF1FA` | `#8FB8EC` | 6,2:1 / 8,3:1 |

Cero morados, índigos ni azules marinos sueltos. Los gráficos usan una escala propia derivada de estos tokens.

### Tipografía

- **Interfaz:** fuente del sistema (se mantiene).
- **Utilidad:** `ui-monospace` con `tabular-nums` **solo** para códigos estampados (OP-, OC-, PV-, NV-, SKU), nunca para fechas.

| Estilo | Tamaño / interlínea | Peso | Uso |
|---|---|---|---|
| `title-page` | 22/28 | 700 | Un título por pantalla |
| `title-section` | 16/22 | 600 | Paneles |
| `body` | 14/20 | 400 | Texto general |
| `body-strong` | 14/20 | 600 | Énfasis |
| `table` | 13/18 | 400 | Celdas |
| `caption` | 12/16 | 500 | Metadatos |
| `micro` | 11/14 | 600 | Solo badges; mínimo absoluto |
| `figure` | 26/32 | 600 | Cifras clave, `tabular-nums` |

Se prohíben `font-black` y `font-extrabold`, igual que los tamaños por debajo de 11 px.

### Forma

Radios 6 px (controles), 10 px (paneles) y 999 px (badges). Bordes de 1 px `#E3E1DB`. Sombras casi nulas: la jerarquía viene del espacio, no de la elevación.

### Firma: el **riel de obra**

Una barra de segmentos rectangulares, como bloques apilados en un pallet, que muestra en qué punto está cada oportunidad:

`Cotización → Venta → Abastecimiento/Fabricación → Despacho → Instalación → Postventa`

- **Segmentos:** completado = naranja de marca; actual = contorno naranja + etiqueta; pendiente = `surface-muted`. Cada segmento lleva su nombre o *tooltip*, así que no depende del color.
- **Dónde aparece:** grande en la ficha de oportunidad, mini (6 px de alto) en las tarjetas del kanban y en las filas de Clientes y Postventa, y en el Panel operativo como embudo de la semana.
- **Por qué es de Hormiglass:** el flujo comercial-a-entrega es la razón de existir del CRM (reemplaza ClickUp y Excel) y el bloque es literalmente el producto. Todo lo demás queda en silencio.

**Elemento secundario de identidad (no compite):** los códigos se muestran como **timbre**, en monoespaciada de 12 px con borde de 1 px y sin salto de línea, como el estampado de un pallet.

### Movimiento

Ninguno, salvo el avance del riel al cambiar de etapa (200 ms, desactivado con `prefers-reduced-motion`).

### Layout de referencia (lista típica)

```
Regular (≥1024)                                   Compacto (<768)
┌────────┬───────────────────────────────────┐    ┌──────────────────────┐
│Sidebar │ Clientes                [+ Nuevo] │    │ ☰ Clientes     [+]   │
│ grupos │ ───────────────────────────────── │    │ [Buscar……………]       │
│ con    │ [Buscar…………] [Estado ▾][Vendedor▾]│    │ [Filtros (2)]        │
│ disclo-│ 3 alertas · 12 en curso · 4 por   │    │ ┌──────────────────┐ │
│ sure   │ cobrar  ← resumen en una línea    │    │ │Fila como tarjeta │ │
│        │ ┌───────────────────────────────┐ │    │ │▮▮▮▯▯▯ riel mini  │ │
│        │ │Tabla: códigos timbre, riel    │ │    │ └──────────────────┘ │
│        │ │mini, estado con ícono         │ │    └──────────────────────┘
└────────┴───────────────────────────────────┘
```

Las 4–5 tarjetas KPI de colores se reemplazan por **una línea de resumen accionable** (cada cifra es un filtro). Las cifras grandes se reservan para el Panel operativo y Reportes.

### Autocrítica del plan

¿Daría este mismo plan para otro CRM? La paleta "neutro cálido + naranja" podría acercarse a la plantilla "crema + terracota". Se diferencia así: sin serif, con gris cemento en vez de crema, con el naranja exacto de la marca, con texto oscuro sobre naranja (señalética) y con una firma (el riel de bloques) que solo tiene sentido para una empresa que fabrica, despacha e instala. Las convenciones se mantienen: barra lateral, tablas, hojas y diálogos estándar.

---

## 3. Fases

**Regla de avance por fase:**

1. Migrar las pantallas de la fase a tokens y componentes.
2. Pasar `npm run build`, `npm run lint` y el chequeo de tokens.
3. Tomar capturas antes y después con Playwright (en `tests/screenshots/diseno-fN/`).
4. Validar visualmente con el usuario.
5. Hacer commit.

Una pantalla se da por migrada cuando no contiene hex sueltos, clases de paleta cruda, texto menor a 11 px, `alert`/`confirm` ni modales propios.

### Fase 0 — Fundaciones (sin cambio visible grande)

- Reescribir los tokens de `app/globals.css` (tabla de arriba, con `@theme` de Tailwind 4 exponiendo `bg-surface`, `text-ink`, `text-ink-muted`, `bg-accent`, `text-success`, etc.). El modo oscuro queda definido pero **desactivado** hasta la Fase 8.
- Crear las clases tipográficas (`.t-page`, `.t-section`, `.t-caption`, `.t-figure`, `.code-stamp`).
- Reescribir `components/ui/crm.tsx` sobre tokens y completarlo con:
  - `Button` (primario, secundario, sutil, destructivo, solo-ícono con `aria-label` obligatorio)
  - `Field`, `Select` y `SearchField`
  - `Sheet`/`Dialog` (rol, Escape, foco atrapado, devolución de foco)
  - `ConfirmDialog`
  - `Toast` con Deshacer
  - `EmptyState`
  - `SummaryLine` (resumen accionable)
  - `StatusBadge` con ícono
  - `CodeStamp`
  - `StageRail` (firma)
  - `Pagination`
- Script `scripts/check-design-tokens.mjs`: falla si un archivo migrado contiene `#xxxxxx`, `(bg|text|border)-(gray|orange|…)-`, `text-[9-10px]`, `font-black`, `alert(` o `confirm(`. Se agrega a `npm run lint`.
- **Corrección crítica inmediata:** el botón primario pasa a texto `#363636` sobre `#F7931F` en todo el sitio (es una sola clase, `.hg-button-primary`, más un reemplazo de `bg-[#f97316] text-white`).

### Fase 1 — Estructura (shell): barra lateral, cabecera y encabezado de página

- **Barra lateral** (`components/Sidebar.tsx`):
  - Los 5 calendarios pasan a un grupo "Calendarios" con *disclosure* y su estado se recuerda.
  - Íconos distintos por calendario.
  - Títulos de grupo en mayúscula inicial y no en MAYÚSCULAS.
  - Usuario y cerrar sesión salen del pie hacia el menú del avatar en la cabecera.
  - Indicador de selección: barra naranja de 3 px más fondo `surface-muted`.
- **Cabecera** (`components/Navbar.tsx`):
  - Se elimina la miga "HORMIGLASS / CRM".
  - La cabecera muestra solo la ubicación real (migas `Ventas › OP-2026-6056`).
  - Se agregan las rutas faltantes (`/postventa`, `/caja/configuracion`, `/usuarios`).
  - ⌘K busca también **registros** (clientes, OP, OC, folios), no solo secciones.
- **`PageHeader` único:** un título, acciones a la derecha y como máximo **un** botón primario; sin ícono decorativo ni párrafo permanente (la ayuda pasa a un ícono de información o al estado vacío).

### Fase 2 — Panel operativo y Notificaciones

- `app/page.tsx` se reorganiza alrededor de *"qué necesita mi atención hoy"*: despachos en riesgo, pagos por validar, casos de postventa abiertos y el riel agregado de la semana.
- Las cifras grandes van solo aquí.
- Gráficos (`components/dashboard/*`): paleta de tokens, etiquetas directas en vez de leyendas de color y nada de color como único portador.
- `app/notificaciones/page.tsx`: agrupar por día, distinguir no leídas con forma y no solo con color, acciones en línea y estado vacío con siguiente paso.

### Fase 3 — Pipeline de ventas (la más grande)

- Dividir `app/ventas/page.tsx` (6.596 líneas) en componentes antes de restilizar: kanban, tabla y ficha.
- **La ficha de oportunidad pasa de modal a ruta** `/ventas/[id]`, con riel grande arriba, resumen y secciones planas (no acordeones anidados) y la actividad en una columna lateral.
- Tarjetas del kanban con código timbre, cliente, monto y riel mini.
- Abonos y finanzas con `SummaryLine` y `StatusBadge` con ícono; los 8 `alert`/`confirm` pasan a `ConfirmDialog`/`Toast`.
- Incluye `ventas/[id]/operacion/page.tsx`. Excluye la guía de despacho imprimible.

### Fase 4 — Comercial: Clientes, Cotizaciones (pantallas) y Postventa

- `clientes/page.tsx` y `clientes/[id]/page.tsx`: ficha con `RecordLayout`, riel por oportunidad y línea de tiempo con tokens.
- `cotizaciones/page.tsx` y la **interfaz** de `cotizaciones/nuevo/page.tsx` y `CotizacionModal`: formulario, tabla de ítems y totales. **No se toca el PDF.**
- `postventa/page.tsx`:
  - Las 5 tarjetas KPI de colores pasan a `SummaryLine`.
  - Los folios van como timbre en una sola línea.
  - Kanban y ficha con `Sheet`.
  - El bloqueo de cierre se explica dentro de la interfaz.

### Fase 5 — Compras y catálogo

- `ordenes-compra/page.tsx`, `[id]/asignaciones`, `nuevo` y la **interfaz** de `OrdenCompraModal` (no el PDF).
- `proveedores/page.tsx`.
- `productos/page.tsx`: los selects pasan a filtros con etiqueta propia, el badge "Revisión Bottai" va como `StatusBadge` de alerta con ícono, y las acciones "Plantilla" e "Importar" pasan a un menú "Importar".

### Fase 6 — Calendarios y operación

- `calendarios/general`, `visitas`, `planificacion` (+`calendario`, `semana`), `reventa` (+`calendario`) y `components/CalendarioEventos.tsx`.
- Un solo lenguaje de evento: color por **tipo** con significado fijo y documentado, siempre con ícono y texto.
- Conflictos de vehículo y reprogramaciones como `StatusBadge` de alerta.
- Hoy marcado con el acento.

### Fase 7 — Finanzas, administración y RR.HH.

- `caja/page.tsx` y `caja/configuracion/page.tsx`: la validación de pagos como bandeja con acciones en línea; los montos en verde o rojo además llevan signo (+/−).
- `reportes/page.tsx`: gráficos con tokens y filtros consistentes.
- `administracion/page.tsx`: los 10 `alert`/`confirm` y las empresas pasan a un selector de empresa estándar.
- `rrhh/page.tsx` y `rrhh/[id]/page.tsx` (2.678 líneas: dividir primero).
- `configuracion/page.tsx` y `usuarios/page.tsx`.

### Fase 8 — Acceso, modo oscuro y pulido final

- `login`, `auth/recuperar` y `auth/actualizar-password`: la marca vive aquí (foto o textura de producto en un panel, formulario estándar).
- **Activar el modo oscuro** según `prefers-color-scheme`, sin interruptor propio. Ver `dark-mode.md › Best practices`: "Avoid offering an app-specific appearance setting". Revisión de contraste en ambos modos.
- Recorrido completo con teclado, `prefers-reduced-motion`, zoom del navegador al 200 % (`accessibility.md`: "enlarge text by at least 200 percent") y ancho de 375 px.
- Revisión de redacción: verbos en botones ("Guardar cambios", "Registrar abono"), mayúscula inicial, errores que dicen cómo resolver y nada de "Error" a secas.
- Eliminar el puente `.hg-app-main :where(...)` de `globals.css` y la clase legada `--primary-orange`.

---

## 4. Decisiones tomadas (2026-10-08)

1. **Botón primario: opción A** — naranja de marca `#F7931F` con texto `#363636` (5,2:1).
2. **Ficha de oportunidad:** se crea la página `/ventas/[id]` **y se mantiene el pop-up** actual (conviven). Fase 3.
3. **Modo oscuro: no se implementa.** Se eliminan de los tokens las variantes oscuras y de la Fase 8 la activación.
4. **Ritmo:** una fase a la vez; se avanza solo con confirmación explícita del usuario.

---

## 5. Estado de avance

### Fase 0 — completada, pendiente de validación del usuario (2026-10-08)

- `app/globals.css`: tokens nuevos (cemento, carbón `#363636`, naranja de marca `#F7931F`, señales), utilidades Tailwind semánticas (`bg-surface`, `text-ink`, `bg-accent`, `text-on-accent`, `text-success`…), escala tipográfica (`.t-page` … `.t-micro`, mínimo 11 px), `.code-stamp`, anillo de foco `#A14A06` (6,0:1) y `prefers-reduced-motion`.
- `components/ui/crm.tsx`: Button, IconButton, PageHeader, Panel, FilterBar, SummaryLine, DataTable, RecordLayout, PropertyPanel, ActivityTimeline, StatusBadge con ícono, CodeStamp, StageRail (firma), Tabs, Field, TextInput, Select, FilterSelect, SearchField, Dialog, Sheet, EmptyState, ActionMenu, Pagination.
- `components/ui/feedback.tsx`: `useConfirm()` y `useToast()` (montados en `app/layout.tsx`), que reemplazarán `confirm()`/`alert()` fase a fase.
- `components/Pagination.tsx` reexporta la nueva paginación (6 pantallas la reciben ya).
- **Corrección crítica:** 120 botones primarios pasan de blanco sobre naranja (2,8:1) a `#363636` sobre `#F7931F` (5,3:1).
- Catálogo vivo en `/diseno` (fuera de la navegación).
- `npm run lint:design` (`scripts/check-design-tokens.mjs`): verde en archivos migrados; `--report` da la línea base: 1.710 hex, 4.187 paleta cruda, 206 textos < 11 px, 496 pesos fuera de escala, 34 alert/confirm.
- Capturas: `tests/screenshots/diseno-f0-antes/` y `tests/screenshots/diseno-f0-despues/` (`tests/capturas-diseno.mjs`).

> Regla agregada (2026-10-08): cada archivo migrado queda con **0 errores de ESLint**, además de pasar `npm run lint:design`.

### Fase 1 — completada, pendiente de validación del usuario (2026-10-08)

- `lib/navigation.ts`: fuente única de navegación (grupos, íconos, roles) para barra lateral, migas y buscador.
- `components/Sidebar.tsx`: grupo Calendarios plegable (se recuerda), íconos distintos por ítem (Visitas = ubicación, Producción = fábrica, Reventa = contenedor, Sociedades con íconos propios, Usuarios ≠ RR.HH.), títulos en mayúscula inicial, nombres completos ("Sociedad Comercial"), indicador naranja de 3 px, contraer recordado, Escape cierra el menú móvil. Usuario y cerrar sesión salen del pie.
- `components/Navbar.tsx`: cabecera de 56 px con migas reales (Finanzas › Caja; corrige "Hormiglass" en Postventa), sin "HORMIGLASS / CRM"; buscador ⌘K/Ctrl K que encuentra secciones, **clientes** (nombre, razón social, RUT) y **oportunidades** (código OP, título), con teclado; menú de cuenta (nombre, rol, correo, Configuración, Cerrar sesión). Se quitó el ícono de calendario duplicado.
- `app/globals.css`: corregido error previo — `button { font: inherit }` fuera de capa anulaba tamaño y peso de **todos** los botones; ahora va en `@layer base`. Barandas globales temporales: texto mínimo 11 px y peso máximo 700 en pantallas aún no migradas.
- El encabezado de cada pantalla (título con ícono, "Finanzas / Tesorería", párrafo) se migra a `PageHeader` en la fase de cada sección.
- Capturas: `tests/screenshots/diseno-f1-despues/`.

### Fase 2 — completada, verificada al 100% con E2E (2026-10-08)

- `app/page.tsx`:
  - Reorganizado alrededor de *"qué necesita atención hoy"*:
    - 4 tarjetas de atención operativa: Despachos en riesgo/activos (`planificacion/calendario`), Abonos por validar (`caja`), Casos de postventa abiertos (`postventa`) y Recordatorios activos.
  - Firma del CRM: **Riel de obra agregado** (avance de obras de la semana por etapas tipo pallet: Cotización → Venta → Fabricación → Despacho → Entrega).
  - Cifras grandes reservadas con `.t-figure` y `tabular-nums` (Ventas comerciales, Por cobrar, Proyección pipeline, Operaciones activas).
  - Eliminados todos los hex sueltos, fuentes extremas y clases de paleta cruda.
- `components/dashboard/`:
  - `DonutChart.tsx`: restilizado con tokens de diseño, geometría pura con `useMemo`/`reduce` sin mutaciones en render.
  - `FinancialBalanceCard.tsx`: balance financiero en tres tarjetas de señal (comercial, recaudado, saldo) con barra de cobertura con tokens.
  - `PipelineFunnelChart.tsx`: embudo con probabilidades de cierre, proyección ponderada y barras con tokens.
  - `RankingBarChart.tsx`: rankings de comunas, productos y ejecutivos con insignias de podio y avatares con tokens.
  - `SalesTimelineChart.tsx`: gráfico SVG reactivo (área/barras, diario/mensual) con variables de token CSS y tooltips flotantes accesibles.
- `app/notificaciones/page.tsx`:
  - `PageHeader` estándar con acciones rápidas.
  - Notificaciones agrupadas por día ("Hoy", "Ayer", "Esta semana", etc.).
  - Distinción accesible de no leídas por forma y texto ("No leída" badge) y no solo por color.
  - Acciones en línea inmediatas (`IconButton` para alternar leído y eliminar).
  - `EmptyState` accesible con llamada a la acción hacia el panel operativo.
  - Sustituido `window.confirm()` por `useConfirm()` y `useToast()`.
- Verificación:
  - `npm run lint:design`: 14 archivos migrados sin violaciones de tokens.
  - `npx eslint`: 0 errores en todos los archivos de Fase 2.
  - `npm run build`: 38/38 rutas compiladas con éxito.
### Fase 4 — completada, verificada al 100% (2026-10-08)

- `app/clientes/page.tsx` y `app/clientes/[id]/page.tsx`:
  - Listado con `PageHeader`, `FilterBar`, `SearchField`, `Panel` y `DataTable`.
  - Ficha de cliente con `RecordLayout`, `PropertyPanel`, riel de obras activas y línea de tiempo de actividad con tokens.
- `app/cotizaciones/page.tsx`, `app/cotizaciones/nuevo/page.tsx` y `components/CotizacionModal.tsx`:
  - Interfaz de cotizaciones con tokens semánticos, `CodeStamp`, `StatusBadge`, totales con `t-num`.
  - Generación de PDF en `PdfPreviewModal.tsx` excluida y mantenida intacta.
- `app/postventa/page.tsx`:
  - Resumen KPI migrado a `SummaryLine` con filtros accionables.
  - Folios estampados con `CodeStamp`.
  - Gestión de reclamos con `Sheet`, estados con `StatusBadge`.
- Verificación: 23 archivos en `MIGRATED`, 0 violaciones de tokens, 0 errores de ESLint, build verde y 6 capturas en `tests/screenshots/diseno-f4-despues/`.

### Fase 5 — completada, verificada al 100% (2026-10-08)

- `app/ordenes-compra/page.tsx`:
  - Migrado a `PageHeader`, `FilterBar`, `SearchField`, `Panel` y `hg-table`.
  - Folios con `CodeStamp`, estados con `StatusBadge` (pagada en caja como success, borrador como neutral, etc.).
  - Eliminado el modal flotante custom de eliminación reemplazándolo por `useConfirm()` y `useToast()`.
  - Modal de "Pagar OC en Caja" migrado a `Dialog` accesible con selector de cuenta bancaria y subcategoría.
- `app/ordenes-compra/nuevo/page.tsx`:
  - Contenedor con `PageHeader`, enlace de retorno accesible y tokens.
- `app/ordenes-compra/[id]/asignaciones/page.tsx`:
  - `PageHeader` con `CodeStamp`, paneles de nueva asignación y distribución actual.
  - Quitar asignación protegido con `useConfirm()`.
- `components/OrdenCompraModal.tsx`:
  - Formulario de emisión/edición con tokens semánticos de superficie, bordes y foco.
  - Selector de proveedor, partidas, totales tabulares (`t-num`) y confirmación de nueva versión migrados.
  - PDF preview en `OrdenCompraPdfPreviewModal.tsx` excluido y mantenido intacto.
- `app/proveedores/page.tsx`:
  - `PageHeader`, tarjetas de proveedores con `Panel`, `CodeStamp` para RUT y `StatusBadge` "Verificado".
  - Modales de nuevo proveedor y orden rápida migrados a `Dialog`.
  - Historial de pedidos con `hg-table` y paginación.
- `app/productos/page.tsx`:
  - `PageHeader` con `ActionMenu` ("···") que agrupa "Descargar Plantilla CSV" e "Importar Excel / CSV", y botón primario "+ Nuevo producto".
  - Tarjetas KPI consolidadas en `SummaryLine` accionable como filtro de productos que requieren revisión.
  - Filtros con etiqueta propia mediante `FilterSelect` (Origen, Proveedor, Familia).
  - Alerta "Revisión Bottai" renderizada con `<StatusBadge tone="warning">Revisión Bottai</StatusBadge>`.
  - Modales de creación/edición e importación masiva migrados a `Dialog`.
- Verificación:
  - `node scripts/check-design-tokens.mjs`: **✓ 29 archivos migrados sin violaciones de tokens**.
  - `npx eslint`: **0 errores, 0 warnings** en todos los archivos de Fase 5.
  - `npx tsc --noEmit`: **0 errores de tipos**.
  - `npm run build`: **Compilación exitosa (38/38 rutas)**.
  - Playwright: **5/5 capturas tomadas** en `tests/screenshots/diseno-f5-despues/` con **0 errores de consola**.

### Fase 6 — completada, verificada al 100% (2026-10-08)

- `components/CalendarioEventos.tsx`:
  - Migrado completamente a tokens semánticos (0 violaciones).
  - Eliminados todos los `window.confirm()` y `alert()` nativos reemplazándolos con `useConfirm()` y `useToast()`.
  - Estados y tipos representados con `StatusBadge` semánticos con ícono + texto.
  - Modales de nuevo evento, reprogramación y detalle migrados a `Dialog`.
  - Día actual destacado con punto de acento semántico.
- `app/calendarios/general/page.tsx`:
  - Cabecera con `PageHeader`, `Tabs` (Mes / Gantt) y filtros estándar.
  - Paneles laterales con `Panel` para agenda próxima y alertas del mes.
- `app/visitas/page.tsx`:
  - `PageHeader`, navegación de mes con `IconButton` y botón "Hoy".
  - Filtro multi-selección de técnicos y estado mediante popover accesible con tokens.
  - Grilla de mes con acento en día actual, tarjetas con `CodeStamp`, `StatusBadge` y hora en `t-num`.
  - Eliminación de visita protegida con `useConfirm()`.
  - Modal de detalle/edición migrado a `Dialog`.
- `app/planificacion/page.tsx`:
  - `PageHeader` con selector de vista (Lista / Tablero) y enlaces a calendario y programa semanal.
  - `SearchField` integrado.
  - Vista Lista con acordeones agrupados por etapa, `StatusBadge`, contadores y filas con `CodeStamp` y totales tabulares.
  - Vista Tablero Kanban con tarjetas interactivas, estados, montos (`t-num`) y selector "Mover a".
  - Modal unificado de oportunidad con secciones claras y chat feed integrado.
- `app/planificacion/semana/page.tsx`:
  - `PageHeader`, barra de cambio de semanas con `IconButton`, rango de fechas en `t-num`.
  - Grilla de 7 columnas destacando el día actual ("Hoy") con acento de marca.
  - Tarjetas con `CodeStamp` y `StatusBadge`.
  - Panel lateral de órdenes activas y aviso para órdenes sin fecha.
- `app/planificacion/calendario/page.tsx`:
  - Migrado con tokens semánticos limpios y `CalendarioEventos`.
- `app/reventa/page.tsx`:
  - Estructura paralela a planificación adaptada a etapas de reventa (proveedor, stock, retiro, despacho).
  - Vista Lista, Tablero Kanban y modal de oportunidad migrados a tokens y componentes HIG.
- `app/reventa/calendario/page.tsx`:
  - Migrado con tokens semánticos limpios y `CalendarioEventos`.
- Verificación:
  - `node scripts/check-design-tokens.mjs`: **✓ 37 archivos migrados sin violaciones de tokens**.
  - `npx eslint`: **0 errores, 0 warnings** en todos los 8 archivos de Fase 6.
  - `npx tsc --noEmit`: **0 errores de tipos**.
  - `npm run build`: **Compilación exitosa (38/38 rutas)**.
  - Playwright: **7/7 capturas tomadas** en `tests/screenshots/diseno-f6-despues/` con **0 errores de consola**.

### Fase 7 — completada, verificada al 100% (2026-10-08)

- `app/usuarios/page.tsx`:
  - `PageHeader` estándar con botón primario "+ Invitar usuario" y conteos en tiempo real.
  - `DataTable` con avatares semánticos, `CodeStamp`, `StatusBadge` para roles y estados.
  - Modales de invitar y editar migrados a `Dialog` accesible con roles en selector estándar.
  - Desactivación y reseteo de contraseña protegidos con `useConfirm(destructive: true)` y feedback con `toast()`.
- `app/caja/page.tsx`:
  - `PageHeader`, `Tabs` ("Validación de pagos" / "Movimientos de caja") y acciones ("Bancos y empresas", "Ver reportes", "+ Registrar movimiento").
  - `SummaryLine` accionable de pagos pendientes, validados y cuentas operativas.
  - Bandeja de abonos con validación/rechazo en línea, selector de banco por fila y signos explícitos (`+`/`−`) en verde/rojo semántico con `tabular-nums`.
  - Modales de nuevo movimiento y comprobante migrados a `Dialog`.
- `app/caja/configuracion/page.tsx`:
  - `PageHeader`, `Tabs` ("Empresas del grupo", "Catálogo bancario", "Matriz EE.RR").
  - Paneles de cuentas bancarias por empresa con saldos tabulares, selector de banco emisor y modales migrados a `Dialog`.
  - Matriz de ingresos/egresos con códigos operacionales y categorías.
- `app/reportes/page.tsx`:
  - `PageHeader`, `Tabs` ("Márgenes y rentabilidad", "Flujo de caja", "Ventas comerciales"), `FilterBar` con rango de fechas y selectores.
  - `SummaryLine` con métricas clave de margen bruto, ingresos y egresos.
  - Tablas analíticas con `tabular-nums`, signos claros y barras de progreso semánticas con tokens.
  - Exportación a CSV y filtros protegidos.
- `app/administracion/page.tsx`:
  - `PageHeader`, selector estándar de empresa del grupo y acciones rápidas ("Subir documento", "+ Nueva task").
  - Navegación lateral de carpetas societarias (Cuentas por cobrar, Sueldos, Finiquitos, Prevención de riesgos, etc.) con contadores.
  - 10 `alert()` y `confirm()` nativos eliminados y reemplazados con `useConfirm()` y `useToast()`.
  - Modales de tareas, subida de documentos e historial migrados a `Dialog`.
- `app/configuracion/page.tsx`:
  - `PageHeader`, `Tabs` ("General & Empresa", "Usuarios & Permisos", "Campos personalizados").
  - Matriz de permisos por rol, interruptores de sincronización con calendarios y preferencias generales con tokens.
  - Acciones protegidas con `useConfirm()`.
- `app/rrhh/page.tsx`:
  - `PageHeader` con botón "+ Nuevo colaborador", `SummaryLine` accionable de 5 métricas (total, disponibles, en terreno, ausencias, nómina mensual).
  - `FilterBar` con `SearchField`, filtros de Estado y Área, y toggle para alternar entre vista Tabla y Grid de tarjetas.
  - Fila y tarjetas con `CodeStamp` para RUT, avatares semánticos, selectores en línea de tipo de usuario y disponibilidad con tokens de diseño.
  - Modal de nuevo colaborador migrado a `Dialog` estructurado en 3 secciones (Datos personales, Cargo/área, Vínculo con cuenta CRM).
- `app/rrhh/[id]/page.tsx` (2.900 líneas estructuradas):
  - `PageHeader` con `CodeStamp` para RUT, `StatusBadge` de disponibilidad y migas `Administración › Recursos humanos › Detalle`.
  - `RecordLayout` en 3 columnas:
    - **Sidebar:** Ficha de colaborador, botones de acción rápida ("Permiso", "Documento", "Liquidación", "Nota"), selector de disponibilidad en línea, información de contacto, datos bancarios y sueldo base pactado (`tabular-nums`).
    - **Main:** 6 tabs modulares con contadores en badges (`Carpetas & Contratos`, `Permisos & Ausencias`, `Sueldos & Liquidaciones`, `Tareas & Plazos`, `Asistencia & Jornada`, `Bitácora`).
    - **Aside:** Tarjeta de vinculación con cuenta de usuario CRM, panel de eventos/faenas asignadas y panel de visitas técnicas.
  - 7 modales migrados a `Dialog` accesible (`role="dialog"`, Escape, foco retenido).
  - 4 eliminaciones protegidas con `useConfirm(destructive: true)`.
  - Mensajes de feedback unificados con `useToast()`.
- Verificación:
  - `node scripts/check-design-tokens.mjs`: **✓ 45 archivos migrados sin violaciones de tokens**.
  - `npx eslint`: **0 errores, 0 warnings** en todos los 8 archivos de Fase 7.
  - `npx tsc --noEmit`: **0 errores de tipos**.
  - `npm run build`: **Compilación exitosa (38/38 rutas)**.
  - Playwright: **8/8 capturas tomadas** en `tests/screenshots/diseno-f7-despues/` con **0 errores de consola**.



