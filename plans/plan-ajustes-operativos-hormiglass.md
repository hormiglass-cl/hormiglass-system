# Plan de ajustes operativos para Hormiglass

## Estado y propósito

Este documento retoma la planificación de la reunión del 31 de agosto de 2026 con Felipe. El usuario autorizó posteriormente aplicar el plan en el proyecto Supabase actual como entorno de pruebas y cargar datos ficticios. El cotejo detallado con la transcripción y su estado de ejecución están en `plans/cobertura-transcripcion-hormiglass.md`.

El objetivo del piloto es que una oportunidad pueda recorrer, con trazabilidad y alertas, el flujo **captación → cotización/seguimiento → venta → producción o reventa → logística/despacho → cobro**. Las funciones de mayor complejidad financiera o contable se mantienen fuera del primer corte.

## Hallazgos confirmados en el código

| Tema | Estado actual | Ajuste requerido |
| --- | --- | --- |
| Cotizaciones versionadas | `cotizaciones` admite `version` y varias cotizaciones pueden vincularse a una oportunidad. | Establecer una única cotización comercial activa por oportunidad, sin perder el historial. |
| Total y pagos | `getOportunidadTotalValue` en `app/ventas/page.tsx` suma **todas** las cotizaciones vinculadas. La UI ya distingue como “sumando” las aprobadas o enviadas. | Corregir el cálculo para que una versión reemplazada/borrador/rechazada no infle total, saldo ni historial de pagos. |
| Ordenes de compra | `ordenes_compra.oportunidad_id` solo permite una oportunidad por OC. | Sustituir el vínculo uno-a-muchos por una asignación OC ↔ múltiples ventas, con montos/cantidades asignables. |
| Calendarios | Existen contextos separados de Producción/Logística y Reventa/Logística, con eventos, responsables y horas. | Mantenerlos y agregar una vista consolidada, detección visual de choques y notificaciones ante reprogramación. |
| Pipeline | Ya separa producción y reventa, pero no modela despacho, guías, órdenes de producción ni condiciones de cierre. | Convertir las transiciones en pasos explícitos que no bloqueen por defecto, pero señalen información pendiente. |
| Actividad | `actividades_op`, adjuntos y notificaciones ya tienen patrones de uso. | Usarlos como historial único para seguimiento, cambios de programación, documentos y avisos al vendedor. |

## Decisiones de alcance tomadas en la reunión

- Una **oportunidad** representa una venta/proyecto; un cliente puede tener muchas oportunidades, incluidas obras distintas de una misma constructora.
- Se mantienen tres tipos comerciales: **Instalación**, **Suministro** y **Reventa de material**. El despacho puede ser retiro en fábrica/proveedor o entrega; no debe ser otro tipo de venta.
- La venta puede requerir fabricación, compra para reventa o instalación. Una OC de insumos puede distribuirse entre varias ventas; una OC retail puede asignarse a una sola venta.
- El abono no debe bloquear rígidamente el movimiento operacional: el sistema debe dejar el saldo visible y alertar. Los pagos por hito son posibles.
- El equipo inicia con visualización amplia; las restricciones más finas de permisos se iteran después del piloto.
- En la primera etapa, ante un cambio de logística se notifica al vendedor para que éste contacte al cliente. La comunicación automática al cliente queda fuera de alcance.

## Orden recomendado de implementación

### 1. Saneamiento comercial y trazabilidad de cotizaciones

**Archivos principales:** `app/ventas/page.tsx`, `app/cotizaciones/page.tsx`, `app/cotizaciones/nuevo/page.tsx`, `lib/types.ts`, migración nueva.

1. Agregar a la cotización una referencia de versión anterior o, preferentemente, mantener `oportunidades.cotizacion_actual_id` como fuente canónica de la cotización activa.
2. Al crear una nueva versión, conservar la anterior como historial y actualizar de forma atómica la cotización actual; nunca sumar ambas como venta vigente.
3. Cambiar `getOportunidadTotalValue` para basarse en la cotización activa o, mientras se migra, en la regla ya mostrada por la UI: solo cotizaciones `enviada`/`aprobada`, sin duplicar versiones de la misma cadena.
4. Calcular saldo a partir del total comercial activo y de `comprobantes_pago`; eliminar la ruta heredada basada en `abonos`, ya marcada como deprecada en `lib/types.ts`.
5. Registrar toda creación, cambio de estado, reemplazo de versión y comprobante como actividad de la oportunidad.

**Criterio de aceptación:** una oportunidad con v1 reemplazada por v2 mantiene ambas visibles, pero total, saldo y métricas usan una sola versión; los pagos no se alteran al editar una cotización antigua.

### 2. Captación, seguimiento y cierre comercial

**Archivos principales:** `app/ventas/page.tsx`, `app/clientes/[id]/page.tsx`, `app/notificaciones/page.tsx`, `lib/types.ts`, migración nueva.

1. Normalizar los orígenes de oportunidad: webmail, WhatsApp, llamado, visita/presencial, referido, cliente recurrente y manual.
2. Agregar actividades comerciales estructuradas: contacto, resultado, responsable de seguimiento y próxima acción/fecha.
3. Crear una notificación interna por seguimiento vencido o próximo; no enviar correo externo durante el piloto.
4. En el cierre, solicitar y mostrar como checklist no bloqueante: cotización activa, dirección/comuna, fecha estimada, modalidad de entrega, condición de pago, abono registrado si existe y ruta operativa prevista.
5. Mostrar en el cliente las oportunidades con saldo pendiente, vencidas, entregadas y cerradas, preservando la vista existente por cliente.

**Criterio de aceptación:** un lead recibido por cada canal puede registrarse, asignarse a un vendedor, dejar próxima acción y avanzar o cerrarse como perdido sin perder su historial.

### 3. Modelo de venta, ruta operacional y transiciones

**Archivos principales:** `app/ventas/page.tsx`, `app/planificacion/page.tsx`, `lib/types.ts`, migración nueva.

1. Separar los conceptos actualmente mezclados:
   - venta: instalación, suministro o reventa;
   - abastecimiento: fabricar, comprar a proveedor o stock/retiro;
   - entrega: retiro cliente, retiro en proveedor o despacho propio/subcontratado.
2. Añadir a la oportunidad/venta fecha prometida, fecha tentativa de producción, fecha tentativa de despacho/instalación, dirección de obra, vehículo o modalidad de transporte y responsable operativo.
3. Reemplazar la bifurcación ambigua “Producción y Logística” por una secuencia visible: **comercial → producción (si aplica) → logística → entregada → cobro/cierre**. Para reventa: **comercial → abastecimiento/reventa → logística → entregada → cobro/cierre**.
4. Mantener transiciones no bloqueantes, pero advertir de campos faltantes. Solo impedir acciones irreversibles (por ejemplo, cerrar definitivamente una venta sin confirmación explícita).
5. Conservar `rama_destino` por compatibilidad y migrar su uso progresivamente a los nuevos campos; no eliminar columnas durante el piloto.

**Criterio de aceptación:** una venta de suministro con retiro, una reventa con tres despachos y una instalación fabricada pueden representarse sin forzar el mismo camino.

### 4. Ordenes de compra y centro de costo por venta

**Archivos principales:** `app/ordenes-compra/page.tsx`, `app/ordenes-compra/nuevo/page.tsx`, `app/ventas/page.tsx`, `lib/types.ts`, migraciones nuevas.

1. Crear una tabla puente, por ejemplo `orden_compra_asignaciones`, entre OC y oportunidad/venta.
2. Cada asignación debe guardar la oportunidad destino y, cuando corresponda, ítems, cantidad, unidad, costo asignado y notas. La suma no puede superar el ítem o monto asignable de la OC sin una advertencia explícita.
3. Migrar los vínculos existentes desde `ordenes_compra.oportunidad_id` a una única asignación de compatibilidad; mantener temporalmente la columna antigua como respaldo de lectura.
4. En la UI, permitir asignar una OC retail a una venta y una OC de materias primas a muchas ventas; presentar el desglose desde la OC y desde la oportunidad.
5. Distinguir visualmente compras para reventa de compras de insumos de fabricación, sin crear flujos separados duplicados.

**Criterio de aceptación:** una OC de 1.000 sacos puede repartirse entre cuatro ventas y cada una muestra solo la proporción de costo/cantidad asignada.

### 5. Producción, logística y calendarios operacionales

**Archivos principales:** `components/CalendarioEventos.tsx`, `app/planificacion/calendario/page.tsx`, `app/reventa/calendario/page.tsx`, `app/ventas/page.tsx`, migraciones nuevas.

1. Mantener los contextos `produccion_logistica` y `reventa_logistica`, y añadir una vista general de solo lectura que consolide eventos de ambos.
2. Ampliar el tipo de evento para identificar: producción, retiro de proveedor, despacho a cliente, instalación, postventa y logística interna. Conservar datos históricos de los cuatro tipos actuales.
3. Vincular cada evento con responsable, vehículo/recurso, ventana horaria, estado, oportunidad y, si corresponde, OC o guía de despacho.
4. Al crear o modificar un evento, detectar visualmente choques de responsable/vehículo y permitir reprogramar con justificación; no intentar resolver automáticamente la planificación en el piloto.
5. Al reprogramar un despacho/instalación, registrar actividad y crear una notificación dirigida al vendedor responsable: “reprogramado; contactar cliente”.
6. Incorporar vista Calendario como predeterminada y Gantt como alternativa. Gantt debe reflejar dependencias básicas producción → despacho/instalación, sin sustituir la vista operativa diaria.

**Criterio de aceptación:** Edith puede mover un despacho, el vendedor recibe el aviso y la vista general revela si el mismo camión o responsable quedó superpuesto con otro evento.

### 6. Órdenes de producción, despacho y evidencias de entrega

**Archivos principales:** nuevos componentes/páginas operacionales, `app/ventas/page.tsx`, `app/planificacion/page.tsx`, `lib/types.ts`, migraciones nuevas y Storage existente.

1. Crear orden de producción asociada a una venta, con productos, cantidades objetivo, fechas, responsable y estado. Registrar producción real por día sin sobrescribir la meta.
2. Crear órdenes/guías de despacho en entregas parciales: una venta puede tener N guías, y cada guía puede listar ítems/cantidades, vehículo, chofer, fecha, origen y destino.
3. Registrar carga verificada, entrega recibida conforme, firma/archivo adjunto y diferencias de cantidad. Los documentos deben almacenarse en el bucket privado existente con políticas RLS equivalentes a los adjuntos de oportunidad.
4. El estado “entregada” debe derivarse de que todas las entregas planificadas estén completadas o de una confirmación manual con motivo.
5. Exponer pendientes de saldo luego de cada entrega, sin intentar emitir documentos tributarios todavía.

**Criterio de aceptación:** una venta de 100 m² puede tener tres guías de 33/33/34, cada una con respaldo, y el sistema muestra lo pendiente por entregar y cobrar.

### 7. Pilotaje, permisos y carga inicial

1. Crear/validar los perfiles de Lorena, Katy, Edith y el resto del equipo comercial con correo corporativo y rol inicial de usuario comercial; validar responsables operativos y recursos de calendario.
2. Cargar un conjunto pequeño de productos, proveedores, clientes y 5–10 oportunidades de prueba. No iniciar con una importación masiva ni con datos productivos sin respaldo.
3. Realizar una simulación completa con los cuatro escenarios: instalación fabricada, suministro con despacho, reventa con compra a proveedor y retiro por cliente.
4. Recoger observaciones del equipo, priorizar incidencias de operación y recién después habilitar carga real.

## Postergado explícitamente

- Conexión SMTP/SiteGround y sincronización de Gmail/webmail; primero se define modelo de mensajes, credenciales por vendedor y permisos.
- Emisión y conciliación de facturas mediante SII.
- Inventario automático, costos indirectos de fabricación y cálculo contable completo.
- Caja, flujo de caja, conciliación bancaria, estado de resultados y balance.
- Automatización de comunicaciones a clientes por email o WhatsApp.
- Postventa con asignación automática de recursos; por ahora se planifica como evento.
- Copiloto con IA y réplica multiempresa para Rinon.

## Seguridad y migraciones

- Cada tabla nueva de `public` tendrá RLS habilitado, políticas de `SELECT`, `INSERT`, `UPDATE` y `DELETE` definidas por rol y, en `UPDATE`, tanto `USING` como `WITH CHECK`.
- Las migraciones deben ser aditivas y con backfill verificable; no se eliminarán columnas legacy durante el piloto.
- El cliente web no recibirá credenciales SMTP, claves de SII ni `service_role`. En una fase posterior, los envíos se realizarán mediante una Edge Function o backend con secretos.
- Los documentos de despacho, firmas y adjuntos serán privados y se accederán mediante políticas de Storage y URLs firmadas.

## Verificación por fase

1. Pruebas unitarias de cálculo de total/saldo: versiones, estados, abonos y redondeos CLP.
2. Pruebas de integración de la tabla puente OC: asignación única, múltiple y sobreasignación.
3. Pruebas RLS con perfiles comercial, programación, administración y mano de obra.
4. Pruebas de calendario: conflicto, reprogramación, notificación y preservación de eventos históricos.
5. Prueba end-to-end de los cuatro escenarios del piloto con datos no productivos.
6. Ejecutar lint, build y revisión de migraciones antes de cada despliegue; verificar en un entorno de prueba antes de producción.

## Secuencia de entregas

1. **Base comercial confiable:** fases 1 y 2.
2. **Ruta operativa y costos asignables:** fases 3 y 4.
3. **Programación y despachos:** fases 5 y 6.
4. **Piloto guiado:** fase 7.
5. **Automatizaciones y finanzas:** elementos postergados, priorizados con evidencia del piloto.
