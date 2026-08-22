# Plan: Ajustes 12 — Antecedentes, Ficha de Cliente y Calendarios diferenciados

## Contexto

`local/ajustes/ajustes-12.md` pide 3 bloques de mejoras sobre el CRM Hormiglass:
1. Poder marcar una oportunidad como "requiere antecedentes" y subir documentación (contratos, anexos, docs de trabajadores) directamente ahí.
2. Un set de 9 tarjetas-resumen en la ficha de cliente que hoy no existen (ventas acumuladas, saldo pendiente, cotizaciones abiertas, obras activas, última oportunidad, monto facturado, días promedio de pago, reclamos/postventa, próxima actividad).
3. Diferenciar los eventos de los calendarios de Producción/Logística y Reventa/Logística (hoy Reventa no tiene calendario propio) con tipo, fecha/hora de inicio y término, notas y un estado de 5 valores — sin que los eventos se crucen entre ambos calendarios.
4. Confirmar que `oportunidades.asignado_a` (vendedor) está correctamente restringido a usuarios reales de Supabase.

Gran parte de la infraestructura ya existe de trabajo previo (migraciones 0001-0027): `eventos_produccion_logistica`, `responsables_calendarios`, `personal_terreno`, bucket `documentos`, `comprobantes_pago` (jsonb en oportunidades). Este plan extiende esa base en vez de reconstruirla.

**Decisiones ya tomadas por el usuario:**
- Calendario: misma tabla `eventos_produccion_logistica` + columna `contexto` (`produccion_logistica` | `reventa_logistica`); cada calendario filtra por su contexto.
- Estados de evento: se reemplazan los valores legacy por los 5 pedidos (Por hacer, En curso, Reprogramado, Completado, No realizado).
- "Vendedor asignado" = el campo `asignado_a` ya existente (FK a `usuarios`); solo hay que verificar/asegurar la UI.
- Días promedio de pago = días entre la fecha en que la cotización pasó a `aprobada` y la fecha de cada comprobante de pago adjuntado en Sección 1 (Comercial y Ventas).

## Hallazgos clave (verificados en código)

- `supabase/migrations/0019/0020/0021` crearon `eventos_produccion_logistica` (tipo_evento: fabricacion/instalacion/logistica; sin hora de término; estado con mezcla de valores legacy). Consumida hoy solo por `app/planificacion/calendario/page.tsx` y `app/ventas/page.tsx` — **Reventa no la usa en absoluto** (`grep` en `app/reventa/page.tsx` no arrojó nada).
- `responsables_calendarios` (0022/0024) ya resuelve el "quién" (nombre, cargo, `calendarios TEXT[]` ⊆ {`visitas_terreno`,`produccion_logistica`}) — falta agregar `reventa_logistica` a ese check.
- Bucket `documentos` ya se usa para subir comprobantes de pago (`app/ventas/page.tsx:1711-1713, 3161-3163`, con `getPublicUrl` — público). Reutilizable para antecedentes, distinguiendo por un campo `tipo` en el registro guardado.
- `oportunidades.comprobantes_pago` (jsonb) guarda objetos `{id, monto, fecha, nota, creado_por, comprobante_nombre, comprobante_url}` — **`fecha` es un string localizado `es-CL`** (`app/ventas/page.tsx:3176`), no ISO. Para calcular "días promedio de pago" con precisión hace falta un timestamp ISO paralelo.
- `cotizaciones` no tiene una columna que capture *cuándo* pasó a `aprobada` (solo `updated_at` genérico, que se pisa con cualquier cambio posterior). Hace falta `fecha_aprobacion`.
- `app/clientes/[id]/page.tsx` no tiene ningún bloque de tarjetas-resumen hoy (confirmado por grep) — es UI nueva completa.
- Roles: el sistema ya migró a `rol IN ('admin','user')` (visto en `supabase/schema.sql` y `lib/types.ts`), pero migraciones anteriores (0019, 0022) todavía usan `has_role('ventas','programacion','administracion','admin')` en sus políticas de escritura — con roles simplificados, esas condiciones solo las cumple `admin` (el resto son `'user'`, no coincide con ningún nombre viejo). **No es objeto de este plan corregirlo**, pero las políticas nuevas de este plan deben usar `has_role('admin','user')` (o directamente sin restricción de rol, solo `is_active_user()`) para no heredar ese mismo problema silencioso.

## Fase 1 — Calendario diferenciado (Producción/Logística vs Reventa/Logística)

Riesgo medio. Migración + cambios en 2 páginas.

**Migración `supabase/migrations/0028_calendario_contexto_reventa.sql` (borrador, no aplicar sin revisión):**
```sql
ALTER TABLE public.eventos_produccion_logistica
  ADD COLUMN IF NOT EXISTS contexto TEXT NOT NULL DEFAULT 'produccion_logistica'
    CHECK (contexto IN ('produccion_logistica', 'reventa_logistica')),
  ADD COLUMN IF NOT EXISTS fecha_inicio TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_fin TIMESTAMPTZ;

-- Backfill: los eventos existentes son de Producción; fecha_inicio/fin desde el dato actual.
UPDATE public.eventos_produccion_logistica
   SET fecha_inicio = (fecha_evento::timestamptz + COALESCE(hora_evento::time, '08:00')::interval),
       fecha_fin    = (fecha_evento::timestamptz + COALESCE(hora_evento::time, '08:00')::interval)
 WHERE fecha_inicio IS NULL;

ALTER TABLE public.eventos_produccion_logistica
  ALTER COLUMN fecha_inicio SET NOT NULL,
  ALTER COLUMN fecha_fin SET NOT NULL;

-- Reemplazar tipo_evento por las 4 categorías pedidas (mapeo desde las 3 actuales).
ALTER TABLE public.eventos_produccion_logistica DROP CONSTRAINT IF EXISTS eventos_produccion_logistica_tipo_evento_check;
UPDATE public.eventos_produccion_logistica SET tipo_evento = 'obra' WHERE tipo_evento = 'instalacion';
UPDATE public.eventos_produccion_logistica SET tipo_evento = 'produccion' WHERE tipo_evento = 'fabricacion';
ALTER TABLE public.eventos_produccion_logistica
  ADD CONSTRAINT eventos_produccion_logistica_tipo_evento_check
  CHECK (tipo_evento IN ('obra', 'produccion', 'reventa', 'logistica'));

-- Reemplazar estado por los 5 valores pedidos (mapeo desde los legacy).
ALTER TABLE public.eventos_produccion_logistica DROP CONSTRAINT IF EXISTS eventos_produccion_logistica_estado_check;
UPDATE public.eventos_produccion_logistica SET estado = 'por_hacer'  WHERE estado IN ('programado','pendiente','cola_produccion');
UPDATE public.eventos_produccion_logistica SET estado = 'en_curso'   WHERE estado IN ('en_proceso','fabricacion','instalacion','coordinacion');
UPDATE public.eventos_produccion_logistica SET estado = 'completado' WHERE estado IN ('finalizado','entregado','despachado','listo_instalacion');
UPDATE public.eventos_produccion_logistica SET estado = 'no_realizado' WHERE estado = 'cancelado';
ALTER TABLE public.eventos_produccion_logistica
  ADD CONSTRAINT eventos_produccion_logistica_estado_check
  CHECK (estado IN ('por_hacer','en_curso','reprogramado','completado','no_realizado'));
ALTER TABLE public.eventos_produccion_logistica ALTER COLUMN estado SET DEFAULT 'por_hacer';

-- Permitir el nuevo contexto en responsables_calendarios (0024 lo dejó en 2 valores).
ALTER TABLE public.responsables_calendarios DROP CONSTRAINT IF EXISTS responsables_calendarios_calendarios_check;
ALTER TABLE public.responsables_calendarios
  ADD CONSTRAINT responsables_calendarios_calendarios_check
  CHECK (calendarios <@ ARRAY['visitas_terreno','produccion_logistica','reventa_logistica']::TEXT[]);

CREATE INDEX IF NOT EXISTS idx_eventos_prod_log_contexto_fecha
  ON public.eventos_produccion_logistica (contexto, fecha_inicio);
```
Nota: `fecha_evento`/`hora_evento` quedan en la tabla (no se eliminan) para no romper código existente que aún los lea durante la migración de UI; se pueden deprecar en una fase posterior una vez que `app/planificacion/calendario/page.tsx` y `app/ventas/page.tsx` estén migrados a `fecha_inicio`/`fecha_fin`.

**Código:**
- `app/planificacion/calendario/page.tsx`: el query (`:43-44`) agrega `.eq('contexto', 'produccion_logistica')`. El modal de creación/edición (`:338-426`) agrega: selector de `tipo_evento` (Obra/Producción/Logística — sin "Reventa" en este contexto), `fecha_inicio`/`fecha_fin` (date+time), `titulo`, `notas` (mapear a `observaciones`), selector de `estado` con las 5 opciones nuevas.
- `app/reventa/page.tsx`: **nuevo** — agregar una vista de calendario (puede ser una pestaña o sub-ruta `/reventa/calendario`, replicando el layout de `app/planificacion/calendario/page.tsx`) que consulta la misma tabla con `.eq('contexto', 'reventa_logistica')` y limita `tipo_evento` a Reventa/Logística. Reutilizar el mismo componente de tarjeta de día y modal, parametrizado por contexto (evitar duplicar el archivo completo: extraer a un componente compartido `components/CalendarioEventos.tsx` que reciba `contexto` y `tiposPermitidos` como props).
- `app/ventas/page.tsx`: el bloque que hoy crea/edita eventos (línea del grep original) debe fijar `contexto` según si la oportunidad tiene `rama_destino = 'produccion'` (→ `produccion_logistica`) o `'reventa'` (→ `reventa_logistica`).

**No romper:** las políticas RLS de `eventos_produccion_logistica` y `responsables_calendarios` (`is_active_user()` para leer) siguen aplicando igual a la columna `contexto`; no hace falta política nueva, solo el `CHECK` ampliado en `responsables_calendarios`.

**QA:** crear un evento desde Planificación → aparece solo en Planificación, no en Reventa. Crear uno desde Reventa → aparece solo ahí. Editar fecha/hora de término. Cambiar estado a "Reprogramado" y "No realizado" y verificar que se ven distinto (badge/color). Verificar que eventos ya existentes (migrados) se siguen viendo con su fecha correcta.

## Fase 2 — Antecedentes en la Oportunidad de Venta

Riesgo bajo. Aditivo, reutiliza el patrón de `comprobantes_pago`.

**Migración `0029_antecedentes_oportunidad.sql`:**
```sql
ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS requiere_antecedentes BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS antecedentes JSONB NOT NULL DEFAULT '[]';
```
`antecedentes` guarda objetos `{id, nombre, tipo (contrato|anexo|documento_empresa|documento_trabajador|otro), url, fecha_iso, subido_por}` — mismo patrón que `comprobantes_pago` pero con `fecha_iso` desde el inicio (ver Fase 3, por qué `comprobantes_pago` no lo tiene).

**Código (`app/ventas/page.tsx`):** en la Sección 1 (Comercial y Ventas), agregar un toggle "Requiere enviar antecedentes" que al activarse (`updateOportunidadField('requiere_antecedentes', true)`) revela un bloque de subida de archivos al bucket `documentos` (mismo flujo de `:1711-1713`), listando los antecedentes ya subidos con nombre/tipo/fecha y botón de eliminar.

**QA:** activar el toggle en una oportunidad, subir 2 archivos de distinto tipo, verificar que persisten al recargar, desactivar el toggle (los archivos no se borran, solo se oculta la exigencia).

## Fase 3 — "Días promedio de pago" (soporte de datos)

Riesgo bajo-medio. Requiere 2 columnas nuevas + arreglo de formato de fecha.

**Migración `0030_fecha_aprobacion_cotizacion.sql`:**
```sql
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS fecha_aprobacion TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_fecha_aprobacion()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.estado = 'aprobada' AND (OLD.estado IS DISTINCT FROM 'aprobada') THEN
    NEW.fecha_aprobacion = NOW();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_fecha_aprobacion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cotizaciones_fecha_aprobacion ON public.cotizaciones;
CREATE TRIGGER trg_cotizaciones_fecha_aprobacion
BEFORE UPDATE ON public.cotizaciones
FOR EACH ROW EXECUTE FUNCTION public.set_fecha_aprobacion();
```
**`comprobantes_pago` necesita un campo de fecha ISO** para poder restar fechas de forma confiable (hoy `fecha` es un string `es-CL` de despliegue, no parseable de forma segura). Cambio de código (no de esquema, es jsonb): al crear `newAbonoRecord` (`app/ventas/page.tsx:3173-3181`) agregar `fecha_iso: new Date().toISOString()` manteniendo `fecha` como está (compatibilidad visual). Los comprobantes históricos sin `fecha_iso` simplemente se excluyen del cálculo de promedio (no se puede reconstruir su fecha real de forma confiable) — asumido, se documenta como limitación conocida.

**Cálculo (client-side, en `app/clientes/[id]/page.tsx`, Fase 4):** para cada cotización `aprobada` del cliente con `fecha_aprobacion`, tomar los `comprobantes_pago` de su `oportunidad` con `fecha_iso`, calcular `dias = (fecha_iso - fecha_aprobacion) / 86400000`, promediar todos los valores del cliente.

**QA:** aprobar una cotización → `fecha_aprobacion` se setea una sola vez (no se mueve si se vuelve a guardar en el mismo estado); subir un comprobante nuevo → trae `fecha_iso`; comprobantes viejos sin `fecha_iso` no rompen el cálculo (se ignoran).

## Fase 4 — Tarjetas de la Ficha de Cliente

Riesgo bajo (solo lectura/agregación), pero es la fase más grande en superficie de UI. Depende de Fases 1-3 para 2 de las 9 tarjetas.

En `app/clientes/[id]/page.tsx`, nuevo bloque de grid de tarjetas (arriba del contenido existente, junto al header con RUT/Ejecutivo/Estado/Nicho que ya existe según el punto 1 del ajuste — verificar si ya se muestra y solo falta restringir el selector de "Ejecutivo" a `usuarios` reales vía dropdown, en vez de texto libre, si no lo es ya).

Fuente de datos por tarjeta (todas derivadas de queries ya existentes en la página + las de Fase 1-3, sin tablas nuevas):

| # | Tarjeta | Cálculo |
|---|---|---|
| 1 | Ventas acumuladas | Suma de `monto_estimado` (o `monto_total` de la cotización activa) de oportunidades del cliente con `monto_abonado >= monto_total` (100%) |
| 2 | Saldo pendiente | Suma de `(monto_total cotización activa − monto_abonado)` de oportunidades no cerradas al 100% |
| 3 | Cotizaciones abiertas | Conteo de `cotizaciones` del cliente por `estado`, con selector que filtra la lista mostrada debajo (reusar patrón de filtro de Fase de ajustes-11) |
| 4 | Obras/producción/logística activas | Conteo de `eventos_produccion_logistica` ligados a oportunidades del cliente con `estado NOT IN ('completado','no_realizado')` (requiere Fase 1) |
| 5 | Última oportunidad registrada | `oportunidades` del cliente, `order by created_at desc limit 1` |
| 6 | Monto facturado en obras | Suma de `monto_total` de cotizaciones ligadas a oportunidades con `rama_destino = 'produccion'` y `estado_pipeline` en estados finalizados/entregados |
| 7 | Días promedio de pago | Ver Fase 3 |
| 8 | Reclamos/postventa | Nueva pestaña en el log de actividad (`actividades_op`) — ver Fase 5 |
| 9 | Próxima actividad | `visitas_terreno` futuras/pendientes del cliente más próxima; si `fecha < hoy` y `estado_visita = 'programada'` → mostrar "Vencida" (derivado, no se guarda en DB) |

**QA:** abrir la ficha de un cliente con datos reales (varias oportunidades/cotizaciones) y verificar cada número contra un cálculo manual; cliente sin datos → tarjetas en 0/"—" sin crashear.

## Fase 5 — Pestaña de Reclamos/Postventa

Riesgo bajo. Reutiliza `actividades_op.tipo`.

**Migración `0031_reclamos_actividad.sql`:**
```sql
ALTER TABLE public.actividades_op DROP CONSTRAINT IF EXISTS actividades_op_tipo_check;
ALTER TABLE public.actividades_op
  ADD CONSTRAINT actividades_op_tipo_check
  CHECK (tipo IN ('comentario','actualizacion','abono','reclamo'));
```
(Verificar primero si `actividades_op.tipo` tiene o no un CHECK hoy — si es TEXT libre, este paso es no-op y solo documenta el valor válido nuevo.)

**Código (`app/ventas/page.tsx`):** en el bloque de actividad/chat de la oportunidad, agregar una pestaña "Reclamos" que filtra `actividades_op` por `tipo = 'reclamo'` y permite crear una nueva con ese tipo — mismo componente que las pestañas de comentarios existentes.

**QA:** crear un reclamo, verificar que aparece solo en la pestaña Reclamos y no en la de comentarios generales; verificar que cuenta para la tarjeta de ficha de cliente si se decide mostrar un conteo ahí (opcional, no pedido explícitamente).

## Fase 6 — Verificar campo "vendedor" (asignado_a)

Riesgo mínimo. Solo UI.

Revisar el `<select>` de `asignado_a` en `app/ventas/page.tsx` (encabezado de la oportunidad): confirmar que las opciones vienen de `usuariosApp`/`usersList` (datos reales de Supabase) y no de una lista hardcodeada o texto libre. Si ya es así, no se necesita cambio — documentar en el PR que se verificó.

## Verificación general

- `npm run build && npm run lint` después de cada fase.
- Antes de aplicar migraciones 0028-0031: revisar en un entorno de staging, y para 0028 en particular verificar con un `SELECT tipo_evento, estado, count(*) FROM eventos_produccion_logistica GROUP BY 1,2` que el mapeo de valores legacy cubrió todos los casos existentes (sin filas que violen el nuevo CHECK).
- Regresión: `/planificacion/calendario` y el flujo de ventas siguen funcionando con los eventos ya migrados.

### Archivos críticos
- `supabase/migrations/0028_calendario_contexto_reventa.sql`, `0029_antecedentes_oportunidad.sql`, `0030_fecha_aprobacion_cotizacion.sql`, `0031_reclamos_actividad.sql` (nuevas, numeración siguiente a 0027).
- `app/ventas/page.tsx` (antecedentes, contexto de evento al crear, pestaña reclamos, verificación de asignado_a).
- `app/planificacion/calendario/page.tsx` y nuevo `components/CalendarioEventos.tsx` compartido con `app/reventa/page.tsx`.
- `app/clientes/[id]/page.tsx` (bloque de 9 tarjetas).
- `lib/types.ts` (agregar `contexto`, `fecha_inicio`, `fecha_fin` a un tipo `EventoProduccionLogistica`; `requiere_antecedentes`/`antecedentes` a `OportunidadVenta`; `fecha_aprobacion` a `Cotizacion`).
