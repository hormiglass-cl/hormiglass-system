# Sistema general
1. Cada accion de un usuario debe guardarse en los logs del sistema, alguna de las acciones son para editar, eliminar o crear: Clientes, Oportunidades de Venta, Cotizaciones, Configuracion de Sistema
2. Los logs de sistema no deben tener ninguna asociacion o dependencia en supabase con un cliente, cotizacion o oportunidad, porque al momento que se elimine algo no se elimine el logo tambien
3. 

# Oportunidad de venta
1. Elimina el comprobante de pago que esta al lado de la nota de venta porque ya existe el comprobante de pago con el abono, y re-ordena las secciones para que se vean mejor
2. Al eliminar un abono no se elimina o se visualiza que se elimina hasta que tenga que recargar la pagina, y uno como usuario puede entender que aun no se eliumina
3. Al mencionar el usuario el texto que ira como mensaje debe ser en blanco y al escribir al lado no debe seguir buscando usuario porque tapa el mensaje el mensaje debe aparecer arriba del chat. Fijate en las imagenes adjutnas

# Notificaciones
1. Quiero que la seccion de notificaciones me permita filtrar tambien por las leidas y las no leidas

# Clientes

## Ficha de clientes
1. El boton de ver detalle comple debe mostrar la misma ventana que se muestra en pipeline de ventas no debe ser diferente

# Cotizaciones
1. Las cotizaciones que se muestran en la tabla, la columna oporutnidad de venta indica que ya estan agregadas a una oporutnidad pero realmente no lo estan, hay que corregir ese bug para que muestre realmente si esta asignado a una oportunidad o no.

# Dashboard
1. Muestra informacion que no corresponde dice que una oportunidad tiene un valor, pero realmente, no existe el total de venta porque no hay ninguna cotizacion agregada, el resto de los datos si lo muestra bien pero el valor del pipeline de ventas no esta bien.
2. Los filtros por periodo quiero que sea con un calendario al estilo del espacio para cambiar las fehcas en que hacer el analisis
3. Quiero agregar un segundo kpi de valor del pipeline para que muestre cuales son los totales de abono y cuanto esta pendiente de pago.