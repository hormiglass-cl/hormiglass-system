# Cobertura del piloto frente a la reunión con Felipe

Fuente principal: `local/ajustes/septiembre/Reunión con Felipe - 2026_08_31 15_58 GMT-04_00 - Notas de Gemini.md`. Se contrastó también la síntesis `(1).md`; la transcripción larga prevalece cuando la síntesis mezcla Hormiglass con Rinon, Tangible o Rayevich. Estado al 16-09-2026. El proyecto Supabase `jvenwcupdllcqbxixcuo` se usa como pruebas por indicación del usuario.

| Necesidad de la reunión | Evidencia | Implementación y prueba |
| --- | --- | --- |
| Equipo comercial: Lorena asigna; Katy y Edith pueden apoyar seguimiento de otra vendedora | líneas 105–113 | Responsable principal y responsable de seguimiento separados; actividades y avisos internos. Edith conserva cuenta `mano_obra` con correo actualizado. Lorena y Katy quedan por dar de alta cuando se entreguen accesos reales; no se enviaron invitaciones. |
| Captación desde webmail, WhatsApp, teléfono, visita, referido y recurrente | 337 y siguientes | Orígenes normalizados en oportunidad y seguimiento comercial con próxima acción. Sin sincronización automática del buzón. |
| Cotizaciones sucesivas sin duplicar monto | discusión comercial inicial | `cotizacion_actual_id` canónico; histórico conservado; cálculos y cinco pruebas unitarias. |
| Abono flexible sin bloquear tránsito operativo | línea 183 y siguientes | Saldo visible, checklist no bloqueante y ruta operativa independiente del pago. |
| Tres modalidades comerciales y fabricación, compra o retiro | líneas 429–499, 623–667 | `tipo_venta`, `abastecimiento`, `forma_entrega`, ruta operativa y guía parcial. |
| OC de insumos distribuida entre distintas ventas | líneas 429–499 | Tabla puente con cantidad/costo y control de sobreasignación; ejemplo de 1.000 sacos en cuatro ventas. |
| Catálogo de productos e insumos | 77 y 389 | Catálogo en Supabase enlazable a ítems de cotización y OC. Ocho registros `DEMO-HG-*`; se reemplazarán al recibir la lista real. No hay inventario automático. |
| Orden de producción y avance diario; programa semanal para Marco | 623, 687–705 | Órdenes con cantidades/fechas, producción real separada y `/planificacion/semana`. La vista semanal incluye órdenes que atraviesan la semana, órdenes sin fecha objetivo y el avance real por producto. La asignación fina de máquinas y capacidad queda fuera de este corte, como se acordó en línea 721. |
| Evitar sobreproducción y registrar diferencia de cantidades | 721–765 | Meta vs. producción diaria; cantidades planificadas/cargadas/recibidas por guía, saldo pendiente y caso de cantidad adicional con autorización. El costeo industrial completo queda fuera. |
| Entregas parciales 33/33/34 y retiro por cliente | 631–667 | N guías por oportunidad, cada una con ítems y modalidad de transporte. Datos `DEMO-OP-02` muestran 33 entregados de 100 y `DEMO-OP-04` un retiro completo. |
| Calendario consolidado, choques y dependencias producción → despacho | 1293–1405 | Vista general calendario/Gantt, detección de conflicto por responsable/vehículo, aviso de secuencia invertida y reprogramación con aviso al vendedor. |
| Orden impresa para conductor y verificación firmada de carga/recepción | 1433–1459 | Vista imprimible, verificador/fecha de carga, nombre del receptor y adjuntos privados con URL firmada. **Es documento interno de prueba; no reemplaza una guía tributaria ni un DTE.** |
| Costo del despacho y transporte propio/externo/retiro | 1353, 1471 | Costo estimado y real por guía, vehículo/chofer y tipo de transporte. No se contabiliza en caja. |
| Cierre tras entrega y saldo para cobrar | 647, 1487 | Entrega derivada de cantidades recibidas o confirmación manual motivada; saldo de cotización vigente y alerta interna al vendedor. La alerta se probó con `DEMO-OP-04`. |
| Postventa por defecto, faltante o cantidad adicional autorizada | 1501–1529 | Casos con estado, responsable, fecha; al programar se crea evento en calendario. No se emite factura por diferencia en esta etapa. |

## Alcance excluido por el usuario

SMTP/SiteGround y buzón sincronizado; SII y documentación tributaria; inventario automático; caja, contabilidad y conciliación; comunicaciones automáticas al cliente; copiloto IA. La parte de la transcripción desde aproximadamente la línea 1785 trata además de otros negocios y no forma parte de Hormiglass.

## Estado para uso operativo

Las funciones de Hormiglass descritas en la tabla tienen implementación local y esquema aplicado en Supabase. Esto todavía no equivale a un sistema listo para el equipo: el código no está desplegado y las pruebas de interfaz con los perfiles reales no se han realizado. La vista semanal se corrigió en el checkout local el 16-09-2026; pasó ESLint, TypeScript y build, pero aún requiere comprobación con una sesión autenticada.

Para usar datos reales faltan la lista de productos de Felipe, las cuentas de Lorena y Katy, la validación del flujo por el equipo y un ensayo de restauración del respaldo. La guía disponible es una orden **interna**; el transporte que requiera un documento tributario debe seguir usando el procedimiento externo hasta integrar SII. Los avisos al vendedor son internos y requieren que la persona abra el CRM. No se han habilitado mensajes automáticos al cliente.

La mención de APU en la línea 81 describe una posible base de costos aún no definida con Felipe. El catálogo actual permite registrar productos e insumos, pero no calcula APU ni costos industriales. La planificación fina de máquinas y capacidad también quedó aplazada en la conversación (línea 721). Esas definiciones necesitan reglas y datos reales antes de convertirse en funciones verificables.

## Evidencia de ejecución

- Migraciones aplicadas al proyecto de prueba: `20260916163212`, `20260916163220`, `20260916163256`, `20260916163304`, `20260916163313`, `20260916163323`, `20260916165716`, `20260916170747` y `20260916171506`.
- Semilla repetible: `plans/piloto-datos-demo.sql`. Conteo verificado: 8 productos, 2 clientes, 1 proveedor, 8 oportunidades, 6 cotizaciones, 2 OC y 6 guías `DEMO-*`. La OC de 1.000 sacos se distribuye en cuatro ventas fabricadas.
- Prueba RLS con el `auth_id` de Edith: lectura de oportunidad y catálogo e inserción de producción/postventa dentro de transacción revertida. Se comprobó también la denegación de escritura en catálogo.
- Prueba RLS con una cuenta existente `user`: creación y actualización de cotización, inserción de ítem y proveedor, y eliminación de la cotización dentro de una transacción revertida.
- Prueba de alerta: actualización de guía `DEMO-GUIA-04-1` produjo una notificación `cobro_pendiente` para la venta `DEMO-OP-04`.
- Prueba de asignación OC: intentar asignar un saco adicional a `DEMO-OC-001` produjo el rechazo esperado por sobreasignación. El bucket `administracion` se verificó privado.
- Build y cinco pruebas unitarias pasaron; ESLint dirigido pasó sin errores (tres advertencias preexistentes en el formulario de cotizaciones).
- El lint global reporta 73 errores y 116 advertencias heredadas. En los archivos modificados con errores (`app/ventas/page.tsx` y `components/CotizacionModal.tsx`) ninguno está en líneas cambiadas por este trabajo; los archivos nuevos y el resto de archivos dirigidos no tienen errores.
- La app local quedó ejecutándose en `http://localhost:3000`; `/productos` respondió con redirección a `/login` sin sesión, como corresponde. No se automatizó una sesión de interfaz con credenciales reales.
- Se guardaron copias locales del esquema y datos públicos en `.backups/hormiglass-pilot-20260916*.sql` (directorio ignorado por Git, permisos solo del propietario). El volcado de datos advirtió sobre FK circulares entre oportunidades y cotizaciones: una restauración deberá desactivar triggers temporalmente o resolver esas referencias. La restauración no se ensayó.

## Condiciones de entrega a Hormiglass

La lista real de productos y las cuentas de Lorena y Katy aún no están disponibles. El usuario indicó que los accesos se entregarán después de la fase de pruebas; por ello no se enviaron invitaciones a correos corporativos. Las operaciones son datos ficticios y la guía imprimible está rotulada como interna.

## Permisos comerciales corregidos

La auditoría final encontró políticas antiguas con roles inexistentes (`ventas`, `programacion`, `administracion`) en cotizaciones, proveedores y planificación. El usuario aprobó expresamente el alcance de la migración `supabase/migrations/20260916171506_roles_operativos_actuales.sql` después de que la revisión automática pidiera autorización específica. La migración se aplicó. Una consulta a `pg_policies` ya no encontró referencias a esos roles y una transacción revertida verificó operaciones comerciales con una cuenta `user` existente.

## Avisos restantes del asesor de Supabase

El asesor todavía informa una tabla heredada `ventas` con RLS sin políticas ([detalle](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)), cinco funciones auxiliares `SECURITY DEFINER` invocables por usuarios autenticados ([detalle](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)) y protección contra contraseñas filtradas desactivada ([configuración](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). La función de sincronización que podía invocarse sin sesión se cerró en la migración `20260916170747`. Estos avisos restantes requieren revisión general del proyecto antes de entregar accesos reales; no impiden las rutas del piloto verificadas aquí.
