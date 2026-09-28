# Implementación del piloto técnico Hormiglass — corte 28-09-2026

## Alcance y revisión

Checkout `main` en HEAD `e526ef6748f3f2bb6a1cd3856c4bb19fb68b0911`; se conservaron los cambios locales anteriores (snapshot `/tmp/hormiglass-status-before-20260928.txt`). Proyecto de pruebas Supabase `jvenwcupdllcqbxixcuo`. Este informe actualiza la [auditoría del 27-09](validacion-reunion-felipe-2026-09-27.md); sus hallazgos describían el estado anterior a estas correcciones. No se desplegó ni se enviaron comunicaciones a clientes.

## Entregas y evidencia

| Área | Implementación | Comprobación | Estado |
| --- | --- | --- | --- |
| Lecturas comerciales | Relaciones PostgREST explícitas en cotizaciones, panel y ficha de cliente; los errores de carga aparecen en pantalla. | Interfaz con sesión admin: `/cotizaciones` mostró 8 registros, panel 9 oportunidades y ficha DEMO Vidriería Central 6 oportunidades/4 cotizaciones. | Verificado con admin |
| Versiones de cotización | Guardado de cotización e ítems en RPC atómica; el trigger de `cotizacion_actual_id` excluye borradores y rechazadas. | Interfaz: se creó `COT-2026-5133-v1`, se envió, se creó v2 borrador (v1 siguió vigente), se envió v2 (pasó a vigente) y se rechazó v2 (volvió v1). SQL confirmó los punteros. Se eliminaron las dos versiones y sus cuatro actividades de prueba; quedaron cero restos. | Verificado con admin |
| Abonos | RPC con bloqueo de fila y ajuste por diferencia, comprobante en Storage privado y apertura mediante URL firmada. | SQL como rol `user`, en transacción revertida: crear +$10.000, editar a $15.000 y eliminar restauró el acumulado inicial; TypeScript y pruebas de cálculo pasaron. La carga y apertura de archivo en interfaz quedaron bloqueadas por la configuración de la extensión de Chrome. | Parcial |
| Entrega y cobranza | Acreditación derivada de cantidades y respaldo; seis cierres DEMO históricos rotulados «Entrega sin acreditar» en pipeline, panel y ficha del cliente; cobro suspendido hasta acreditación. Transiciones de excepción y postventa atómicas. | UI de `DEMO-OP-02`: tres guías 33/33/34, avisos de firma ausente y vencimiento de cobro deshabilitado. SQL reversible: excepción manual aprobada cambió acreditación a verdadera; al revertir no quedó excepción. Caso postventa y evento se crearon juntos y se revirtieron. | Parcial: falta ciclo nuevo de entrega firmado en UI |
| Agenda y seguimiento | Alertas de próxima acción y responsable; detección de choque de persona/vehículo, dependencia de producción y reprogramación con historial y aviso interno. | 4 pruebas nuevas de cálculo pasan. Calendario general carga cuatro eventos DEMO en Mes y Gantt. SQL anterior probó rechazo sin motivo y un aviso con motivo, dentro de transacción revertida. | Parcial: falta conflicto y reprogramación nuevos desde dos sesiones UI |
| Plataforma | Se eliminó el respaldo silencioso `signUp` del alta administrativa. Se aplicaron las tres migraciones de RPC/cobro y cron. | `cron.job` contiene `hormiglass_cobros_diarios`, activo, `0 12 * * *`; SQL reversible demostró que una venta no acreditada con fecha vencida genera cero avisos. | Parcial: faltan sesión comercial/mano de obra, restauración aislada y conciliación de versiones |

## Matriz de acuerdos actualizada

La numeración y los minutos corresponden a la matriz fuente de la auditoría enlazada. «Verificado» conserva el criterio estricto de interfaz, datos, permisos y resultado; una mejora de código sin recorrido completo figura como parcial.

| # / minuto | Acuerdo | Resultado de este corte | Estado |
| --- | --- | --- | --- |
| 1 · 00:05:29 | Dos vendedoras y autoría | Se conserva la actividad con autor y responsable; falta ingreso de una segunda vendedora. | Parcial |
| 2 · 00:09:00–00:15:12 | Orígenes de captación | Los canales manuales y DEMO-OP-05/06 persisten; correo automático sigue fuera del piloto. | Parcial |
| 3 · 00:05:29/00:13:57 | Seguimiento y avisos | Alertas de próxima acción y vencidas implementadas, con prueba de cálculo; falta sesión del responsable. | Parcial |
| 4 · 00:04:17/00:35:44 | Cotización v1→v2 | Recorrido UI y puntero DB correcto; se limpió la prueba. Falta probarlo en UI comercial. | Parcial |
| 5 · 00:15:12/00:33:30 | Abono y saldo | RPC reversible +10.000→+15.000→0; UI de archivo bloqueada. | Parcial |
| 6 · 00:16:29–00:20:06 | Fabricación, suministro y reventa | Rutas y DEMO visibles; falta venta nueva completa de cada tipo. | Parcial |
| 7 · 00:16:29 | Catálogo | Importador y ocho referencias ficticias; falta catálogo de Felipe. | Parcial |
| 8 · 00:17:38–00:20:06 | OC para cuatro ventas | DEMO-OC-001 asigna 250 × 4; rechazo SQL de sobreasignación ya comprobado. | Verificado |
| 9 · 00:24:41–00:29:54 | Producción semanal | Programa y objetivos visibles; falta sesión de mano de obra y capacidad fina, aplazada. | Parcial |
| 10 · 00:29:54–00:31:03 | Excedente aprobado | Guarda de 100/101 y RPC de excepción probadas con SQL reversible; falta doble sesión UI. | Parcial |
| 11 · 00:24:41–00:26:01 | Guías 33/33/34 y retiro | Tres guías y retiro DEMO visibles; cierre histórico sin respaldo sigue pendiente. | Parcial |
| 12 · 00:42:05–00:53:06 | Calendario y conflictos | Mes/Gantt y cuatro eventos DEMO visibles; detección de choque probada en código. | Parcial |
| 13 · 00:47:33–00:53:06 | Reprogramación y aviso | Guarda SQL, historial y un aviso reversible; falta recorrer cambio y aviso con dos sesiones UI. | Parcial |
| 14 · 00:55:31 | Orden, carga y firma | Orden interna y datos de guía visibles; seis cierres antiguos muestran ausencia de firma; subida de respaldo bloqueada. | Parcial |
| 15 · 00:52:04–00:56:39 | Modalidad y costo de traslado | DEMO-OP-02 muestra $25.000 de traslado y margen provisional; costos reales completos faltan. | Parcial |
| 16 · 00:26:01/00:56:39 | Cerrar y cobrar solo tras acreditar | Seis cierres antiguos excluidos de métricas de acreditación y cobranza; vencimiento deshabilitado, cron activo. Falta nuevo cierre completo. | Parcial |
| 17 · 00:57:48–00:59:03 | Postventa autorizada | Caso y evento atómicos comprobados con SQL reversible; falta dos sesiones UI. | Parcial |
| 18 · 00:59:03 | Archivos y respaldo | Bucket y URL firmada en código; navegador bloqueó carga/lectura de prueba. | Bloqueado |
| 19 · 00:09:00–00:15:12 | SMTP/IMAP | Fuera del alcance de este piloto técnico; requiere accesos corporativos. | Aplazado por acuerdo |
| 20 · 00:35:44/00:55:31 | DTE/SII | Orden es interna, sin emisión tributaria. | Aplazado por acuerdo |
| 21 · 00:29:54/01:04:17 | Inventario/APU/máquinas | Catálogo y objetivos básicos; automatización y planificación fina pospuestas. | Aplazado por acuerdo |
| 22 · 01:01:50 | Vista por cliente | DEMO Vidriería Central muestra 6 oportunidades y 4 cotizaciones; se corrigió `PGRST201`. Falta sesión comercial. | Parcial |
| 23 · 01:03:03 | Caja manual | Registro y reportes existentes; ningún movimiento nuevo ensayado. Automatización contable pospuesta. | Parcial |
| 24 · 01:04:17–01:05:21 | Copiloto | Evolución posterior al piloto. | Aplazado por acuerdo |
| 25 · 01:06:31 | Prueba integral y móvil | Carga a 390 px sin desborde horizontal; faltan sesiones por rol, archivo, recorrido integral y despliegue. | Bloqueado para piloto |

## Verificaciones integradas

- `npx tsc --noEmit`: pasa.
- `node --test tests/*.test.mjs`: 19/19 pasan.
- `npm run build`: compila y genera 35 rutas.
- `git diff --check`: pasa.
- Vista móvil: calendario general y operación `DEMO-OP-02` cargaron a 390 × 844 px; `documentElement.scrollWidth` fue 390 px en ambas. No se realizó una sesión táctil completa.
- Comprobantes: no se subió el archivo ficticio. La extensión de ChatGPT en Chrome rechazó `fileChooser.setFiles` porque no tiene «Allow access to file URLs». El ensayo SQL usó una ruta sintética y **no** acredita la existencia ni la lectura del archivo en Storage.
- RLS de abonos: `user` pudo ejecutar el RPC dentro de una transacción revertida; `mano_obra` recibió `insufficient_privilege` con su `auth_id` real. No hubo registros residuales.
- Limpieza: la oportunidad `DEMO-OP-05` volvió a `cotizacion_actual_id = null`, `monto_abonado = 0`, `comprobantes_pago = []`; cero cotizaciones y actividades creadas en la prueba permanecen.

## Pendientes prioritarios

1. **P1 — Prueba completa de entrega y cobro en interfaz.** Crear una venta DEMO nueva, cotizarla, distribuir producción/OC, registrar despacho con firma auténtica o excepción, acreditar 100 % y verificar habilitación de vencimiento, aviso y postventa. La vista histórica y las pruebas SQL no sustituyen ese recorrido.
2. **P1 — Sesiones por rol.** Se comprobaron permisos con SQL impersonado y UI admin, pero faltan credenciales de prueba para entrar en la interfaz como `user` y `mano_obra`. Lorena y Katy no se dieron de alta porque corresponden al piloto real posterior.
3. **P1 — Storage desde interfaz.** Habilitar en Chrome el acceso de la extensión de ChatGPT a URLs de archivos, o usar una sesión de navegador de prueba que admita subir el comprobante ficticio; luego comprobar URL firmada y limpieza del objeto.
4. **P2 — Reproducibilidad de migraciones.** La lista remota conserva versiones distintas a los nombres locales, incluidos los tres cambios de este corte (`20260928025212`, `20260928143122`, `20260928143336` remotos). No se renombraron migraciones aplicadas. Antes de `db push` o despliegue hay que conciliar el historial y restaurar en un entorno aislado.
5. **P2 — Seguridad de plataforma.** Security Advisor mantiene `public.ventas` con RLS sin política, cinco funciones `SECURITY DEFINER` ejecutables por `authenticated` y protección contra contraseñas filtradas desactivada. Los helpers y `create_user_admin` requieren revisión de exposición antes del acceso real: [RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [funciones](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Condición del piloto

Las funciones principales tienen correcciones implementadas y pruebas parciales en código y Supabase. **El piloto operativo para el equipo no está aprobado.** Siguen pendientes el recorrido integrado con archivos, sesiones por rol, catálogo de Felipe, cuentas de Lorena/Katy, despliegue de esta revisión y aceptación de usuarios. SMTP/IMAP, comunicaciones automáticas, DTE/SII, inventario automático, contabilidad avanzada, planificación fina y copiloto permanecen aplazados según el alcance acordado.
