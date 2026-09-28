# Piloto controlado de ajustes operativos

## Estado

La aplicación está preparada en el checkout local. Nueve migraciones del 16 de septiembre se aplicaron al proyecto `jvenwcupdllcqbxixcuo`, que el usuario designó para pruebas. Se cargaron datos ficticios con prefijo `DEMO-`: ocho productos, dos clientes, un proveedor, ocho oportunidades, seis cotizaciones, dos órdenes de compra y seis guías. La oportunidad preexistente quedó vinculada a su cotización vigente. El proyecto local no puede reconstruirse desde todas las migraciones históricas: `0001_reconcile_schema.sql` presupone tablas ya existentes.

## Preparación del entorno de prueba

1. El usuario eligió realizar el piloto en el proyecto principal y autorizó cargar datos de prueba. Antes de entregar accesos reales, conservar una copia de seguridad recuperable del estado del proyecto.
2. Las nueve migraciones `20260916*` ya están aplicadas. Verificar que la versión desplegada del código las use antes de habilitar el flujo.
3. Crear o validar Lorena, Katy, Edith y vendedores con sus correos corporativos. Comprobar `usuarios.auth_id`, `activo` y rol. Definir responsables de producción y vehículos.
4. La semilla repetible está en `plans/piloto-datos-demo.sql`. No importar datos masivos durante este piloto.

## Escenarios de aceptación

| Escenario | Pasos clave | Resultado esperado |
| --- | --- | --- |
| Instalación fabricada | Crear oportunidad, v1 y v2; asignar producción; registrar cantidades por día; programar instalación; cargar guía y respaldo. | Solo v2 determina monto, la meta no se sobrescribe, la entrega y saldo son visibles. |
| Suministro con despacho | Crear venta de 100 m² y tres guías de 33, 33 y 34 m². Verificar carga, registrar recibido y adjuntar firma. | Se muestran pendientes 67, 34 y 0; entrega completada al confirmar las tres; saldo no cambia por el despacho. |
| Reventa con proveedor | Crear OC de insumos y asignar cantidades a varias ventas; programar retiro y despacho. | Cada venta muestra su costo asignado; una sobreasignación se rechaza; el calendario general muestra los dos contextos. |
| Retiro por cliente | Elegir forma de entrega `retiro_cliente`, confirmar entrega con guía o motivo manual. | La venta no exige un despacho propio; queda evidencia de la entrega y saldo pendiente. |

## Comprobaciones transversales

- Reprogramar un despacho: se solicita motivo, aparece actividad y el vendedor recibe aviso interno para contactar al cliente.
- Superponer responsable o vehículo: la vista general y el editor resaltan el choque, sin cambiar horarios automáticamente.
- Probar perfiles comercial, programación, administración y mano de obra para lectura y escritura permitidas y denegadas.
- Abrir un respaldo de entrega con URL firmada; comprobar que el bucket privado no entrega el archivo por URL pública.
- Revisar que cada cotización histórica y cada comprobante permanecen visibles después de nuevas versiones.
- Ejecutar lint, build y pruebas del repositorio; registrar incidencias y corregirlas antes de usar datos reales.

## Pendientes antes de producción

- Validar el piloto con personas del equipo cuando se entreguen accesos reales. Los cuatro recorridos ya cuentan con registros ficticios verificables.
- Lorena (`lgutierrez@hormiglass.cl`) y Katy (`ctamayo@hormiglass.cl`) aún no existen en Auth ni en `usuarios`. El correo de la cuenta existente de Edith Tapia se actualizó a `etapia@hormiglass.cl` en Auth y en `usuarios`, conservando su ID y rol `mano_obra`.
- El código nuevo no se ha desplegado. Las invitaciones de Lorena y Katy se reservan para la entrega posterior de accesos indicada por el usuario.
- La migración `roles_operativos_actuales` se aplicó con aprobación específica del usuario; se probó el flujo de cotización y proveedor con una cuenta `user` existente dentro de una transacción revertida.
- Decidir los permisos definitivos por rol a partir de ese piloto.
- Reparar o reemplazar la línea base histórica de migraciones para poder crear entornos desde cero.
- Validar un despliegue completo en pruebas y respaldo/rollback antes de migrar el proyecto productivo.
