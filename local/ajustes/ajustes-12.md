# Peticiones

## Oportunidad de venta

1. Hay clientes que requieren enviar documentación de trabajadores, contratos, anexos, documentos de la empresa, agregar botón requiere enviar antecedentes ys e suben en ese espacio, esto debe ser en la oportunudad de venta.
2. 

## Ficha de cliente (tarjeta de cliente)

1. Nombre del cliente

   1. RUT · Ejecutivo (esta se relaciona con los usuarios existentes en el sistema, solo se pueden agregar los usuarios registrados en supabase)· Estado (Activo o inactivo) · Nicho de mercado
2. Tarjetas

   1. Ventas acumuladas (en relacion con las oprtunidades de venta que ya fueron pagadas en su totalidad o con un abono del 100%)
   2. Saldo pendiente (saldo por pagar de las oprotunidades de venta existentes, en relacion con las cotizaciones)
   3. Cotizaciones abiertas (en la tarjeta poder ver destitnas visualizaciones de los estados de las cotizaciones y que muestren los datos del estado seleccionado o todos en su defecto)
   4. Obras, producciones o logistica activas (en relacion con los eventos que existan dentro del calendario de produccion y logistica)
   5. Ultima oportunidad de venta registrada en el sistema a su nombre
   6. Monto facturado en las obras
   7. Días promedio de pago (va en funcion de cuanto tiempos se tarda en adjuntar los comprobantes de pago de ese cliente que es cuando realiza los abonos)
   8. Reclamos/postventa: En la seccion de oportunidad de venta en las eccion de actividad agregar una pestaña más de reclamos para ir dejando los reclamos que ocurran
   9. Próxima actividad: En relacion con los eventos o visitas a terreno que ocurren deben tener un estado que indique si este fue realizado o no de lo contrario se marca como vencidos o sin revisar

## Seccion de calendarios

### Calendario de produccion y logistica

1. Quiero cambiar la logica de los calendarios de produccion y logistica y reventa y logistica y obreas, solo que para crear el evento se definan los siguientes campos para poder diferenciar.
   1. Tipo de evento: El sistema debe asignar el evento donde fue su creacion, sea en produccion y logistica o reventa y logistica, epro no se deben cruzar los datos, es decir, si creo un evneto en produccion y logogistica no debe mostrarse en reventa y logistica ocmo asignado a el.
      1. Obra
      2. Produccion
      3. Reventa
      4. Logistica
   2. Fecha y hora de inicio
   3. Fecha y hora de termino
   4. Titulo
   5. Notas e instrucciones
   6. Estado del evento:
      1. Por hacer
      2. En curso
      3. Reprogramado
      4. Completado
      5. No realizado

## Oportundiad de venta

1. Agregar el vendedor asignado a esa oportunidad de venta, va relacionado directamente con los usuarios verificados que estan en supabas, no se puede agregar cualquiera.
