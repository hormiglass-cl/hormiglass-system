Los cambios que se detallan aplican para la seccion que indica cada titular.

# Plataforma General
1. Debe existir un proceso de inicio de sesion y que los usuarios y sus contraseñas se guarden dentro de supabase
2. Todas las secciones que tengan un preview para ver el pdf de una cotizacion, debe mostrarte en un popup, ya no debe mostrarse en una pestaña nueva. Este poptup debe ser de un tamaño grande para poder ver la cotizacion y de igual manera hacer scroll si es necesario.
3. La seccion de tipo de cliente debe ser una seccion para agregar el nicho de cliente y no si empresa o particular, si no el nicho en el que trabaja si no existe poder crear nuevos nichos y que se mantengan en una base de datos en supabase

# Dashboard
1. Los datos y kpi que se muestran en el dashboard deben tener relacion con las opotunidades de venta y dependiendo del estado mostrar la informacion.
2. Debe existir un filtro por periodos y debe tener el estilo del crm.
3. Quitar el boton de nueva cotizacion

# Clientes
1. Debe permitir que pueda editar la anchira de las columnas
2. Queremos evitar a toda costa la duplicacion de contactos por lo que los datos que permitiran la deduplicacion son el rut y el correo, el rut con el formato de sin puntos y con guion.
3. Un cliente puede tener mas de un correo que permita hacer la deduplicacion es decir un cliente puede tener un correo primario, secundario.

## Ficha de clientes
1. Las oportunidades de venta si le hago clic se debe mostrar la misma vista de la oportunidad sin la necesidad de ir al pipeline de. venta para editarlo
2. Para crear cotizaciones se debe poder hacer desde la ficha del cliente, no es necesario que el sistema te mande a la seccion de cotizaciones para crearlo.

# Cotizaciones
1. Agreguemos el rut del ciente al lado de la razon social y que ademas podamos agreguemos un campo mas que permita ver en oportunidad de venta se encuentra la cotizacion adjunta.
2. El estado de las cotizaciones deben ser borrador, enviada, aprobada o declinada y se puede cambiar el estado o editarla y ese cambio que genera la nueva version
3. El sistema debe entregar la opcion para que cuando se haga la edicion de una cotizacion de la opcion si quiere guardar la version anterior o eliminarla, con un mensaje de confirmacion con el estilo de la pagina.
4. Debe permitir hacer clic para a los nombres de los clientes en la tabla para ir a la ficha de ese cliente.

# Pipeline de ventas
1. Quiero agregar una nueva vista que sea de lista y esta se separe por los estados del pipeline

# Pop Up Oportunidad de venta
1. Quiero agregar una seccion que me permita rellenar todos los campos que tienen una oportunidad de venda y se clasifican de la siguiente forma
    1.1 Datos de contacto: Debe desplegar los datos del conctacto al que esta asignado la opotundiad de venta
    1.2 Producto: Tipo de producto (seleecion multiple: Adoceseped, Adocretos, Adquines piedra, Baldosas, Basas para pilares, Bordes de piscina, Bloques de cemento, Cemento, Maceteros, Pastelones, Piedras naturales, Pigmentos, Tapas de cámara, Materiales de Cierre, Soleras, Solerillas, Cierre Perimetral), cotizacion y las multiples versiones (es importante que la ultima cotizacion es la que determina el valor de la oportunidad de venta)
    1.3 Finanzas: Incluye comprobante de pago (adjuntar archivo, puede agregar varios si lo desea), nota de venta (adjutnar archivo, puede agregar varios si lo desea), rellenar los montos abonados y que tambien indique cuanto falta por abonar de la cotizacion aprobada, orden de compra (adjuntar)
2. Quitar el campo de prioridad como opcion no se necesita
3. Agregar un chat que permita etiquetar a personas del espacio de hormiglass y etiquetarlas con un @ y las personas etiquetadas que que lo puedan ver en las notificaciones y les salte un mensaje en la parte derecha de arriba emergente.

# Notificaciones
1. Poder filtrar y ver las notificaciones relacionadas al usuario asi como las notificaciones generales, agregar una etiqeuta que las permita distintguir
2. La notificacion que le llegue debe arrojar o permitir hacer clic para que te lleve a la actividad en especifico sea ir al perfil del cliente, ir al pipeline, cual sea de esas