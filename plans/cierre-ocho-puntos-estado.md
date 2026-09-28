# Cierre de los ocho puntos — estado de implementación (17-09-2026)

| Punto | Implementado | Verificación / límite |
| --- | --- | --- |
| Reprogramaciones y avisos en cadena | Historial de fechas y motivo, vista previa de eventos afectados, aviso interno a vendedores, responsable y administradores. | El sistema no mueve automáticamente eventos posteriores. |
| Calendario operativo | OC y guía asociables a cada evento; conflictos entre calendarios con confirmación y motivo; advertencia producción → despacho. | Capacidad por máquina quedó fuera por decisión del usuario. |
| Excedentes de producción | Límite en base de datos, solicitud y aprobación administrativa auditadas. | Bloqueo probado con operación revertida. |
| Recepción de entregas | Firma almacenada y verificada, o excepción aprobada; cantidades y receptor obligatorios. | Bloqueo de entrega sin firma probado con operación revertida. |
| Pipeline «entregada» | Puerta de cierre en interfaz y base de datos para `entregada`, `prod_finalizado` y `rev_entregado`. | Hay seis cierres históricos sin acreditación actual; se muestran como pendientes de revisión individual en operación. |
| Cobranza y margen | Fecha de vencimiento, función idempotente de aviso al vencer y semanal, margen provisional de cotización menos OC asignadas y despachos. | La función retorna cero avisos con los datos actuales. El cron diario aún no está activado. |
| Equipo y catálogo | Rutas operativas accesibles para `mano_obra`, importador CSV con plantilla, validación y vista previa para administradores. | Las cuentas reales de Lorena/Katy y la carga de productos reales esperan sus datos; los DEMO permanecen señalados. |
| Integridad y despliegue | Tres migraciones aplicadas en Supabase, RLS en tablas nuevas, controles de base de datos y auditoría. | La migración de cron está en `plans/pending-programar-avisos-cobro.sql` y no se aplica automáticamente. |

## Verificación

- `npm run build`: pasa.
- `node --test tests/*.test.mjs`: 9 pruebas pasan.
- `git diff --check`: pasa.
- Ruta protegida sin sesión: redirección 307 a `/login`; `/login`: HTTP 200.
- Supabase: 3 tablas nuevas presentes; guardas de producción, firma y cierre verificadas mediante operaciones revertidas.
- Security Advisor: sin advertencias nuevas en las tablas y funciones de este cierre. Permanecen advertencias previas del proyecto sobre funciones de autenticación y protección de contraseñas.

## Activación pendiente

El cron propuesto ejecuta `public.generar_avisos_cobro()` diariamente a las 12:00 UTC. La revisión automática rechazó la primera migración por combinar un cron persistente con cambios masivos de costos históricos. Los cambios masivos se retiraron y no se aplicaron. El cron separado requiere aprobación específica antes de activarse.
