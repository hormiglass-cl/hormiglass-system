# Pop up oportunidad de venta
1. Las cotizaciones que se crean fuera de la oportunidad de venta no se debe asignar a ninguna automaticamente, el sistema debe detectarlas cotizaciones de ese cliente que no estan asignadas en una oportundiad y con un listado seleccionar cuales quieres considerar para esa oportunidad
2. Si se crea una nueva cotizacion desde el pipeline de ventas se debe asignar directo la cotizacion a ese pipeline
3. El boton de eliminar cotizacion es solo para sacarla de esa oprtunidad no para eliminarla por completo del sistema
4. La seccion de finanzas debe actualizarle con el valor de la cotizacion que esta como enviada o aprobada, en caso contrario siempre sera 0.
5. La seccion de finanzas tambien agreguemos para que l monto abonado se pueda ir cambiando segun lo que idnique el usuario, pero el abonado se tiene que ir sumando es decir hoy ingreso un valor, luego mañana agrego un segundo valor y se debe ver o visualizar el historial de los dos montos
6. Cualquier cambio que ocurra dentro de la oprtundiad de venta por minimo que sea debe quedar un historial en la seccion de actividades de esa oportunidad, asi se peude consultar, los cambios se muestran como actualizacioens dentro de la seccion de actividades.
7. Al mencionar una persona en la seccion de ocmentarios y selecciona el usuario, no permite escribir un mensaje, se queda para seguir seleccionando un usuario
8. La seccion productos del proyecto solo dejemos las cotizaciones quitemos la seccion para escoger las categorias del producto

# Cotizaciones
1. El formulario que se llena de cotizaciones o para crear un cotizacion existen 2 diferentes al que se llena en el cliente yla que se llena en cotizacion y solo debe existir un mismo formuarlio y es el formulario de cotizacion, eliminemos el de cliente y reemplacemos por el vigente de cotizacion, lo mismo aplica cuando se quiere craer una cotizacion desde oportunidades de venta el formulario es disitno. debe ser uno solo
2. Siempre que se crea una nueva cotizacion su estado por default debe ser de borrador
3. No me permite editar cotizaciones y el mensaje de crear una nueva version o eliminar la anterior solo se debe hacer cuando ocurra un cambio en los campos de la cotizacion no siempre

# Notificaciones
1. Las notificaciones emergentes de las meenciones o cualquier tipo de notificacion se debe mostrar en notificaciones, ademas si hay notificaicones no leidas debe haber un numero en la barra lateral que indique las que no estan leidas, ademas debe existir un checkbox o la posublidad de seleccionar las notificaciones qy que me permitra eliminar o marcar todas o algunas como leidas

# Plataforma & Backend
1. Quiero agregar dentro de supabase tambien una nueva tabla que contenga la informacion o un log de todos los cambios realziados desde eliminaciones de datos, actualziaciones, creacion, todo lo que ocurra, para poder ir consultando.