# CRM Hormiglass

### Estados
* **Realizado**: ✅
* **En curso / Pendiente**: 🟦
* **En Stand-by**: ⏸️

> [!NOTE]
> ### 🚀 Estado Operacional — Ciclo de 0 a 100 Completado (Octubre 2026)
> * ✅ **Fase 1 (Bancos y Cajas):** Depuración de cajas test, botón de eliminación en UI con protección defensiva y trigger de base de datos. 8 cuentas oficiales activas.
> * ✅ **Fase 2 (Reset de Operación):** Limpieza atómica de datos demo (0 clientes/ventas ficticias). Catálogos maestros (348 productos, cuentas bancarias, empresas y usuarios) 100% preservados.
> * ✅ **Fase 3 (Pipeline Comercial):** Etapa renombrada a **"Venta Aprobada"**, eliminando la exigencia errónea de guía firmada antes de fabricar o comprar.
> * ✅ **Fase 4 (Pago Validado ↔ Caja):** Al validar un abono en Caja contra la cartola bancaria, la oportunidad avanza automáticamente a **"Pago Validado"**. Alertas y badges en tiempo real en Navbar y Sidebar.
> * ✅ **Fase 5 (Catálogos, Proveedores y Prueba 0→100):** Catálogo unificado de 348 productos activo, 5 proveedores oficiales depurados, importador masivo con validación de RUT chileno (algoritmo Módulo 11) en `/proveedores`, plantillas Excel/CSV y Playbook integral del ciclo 0 a 100 con 53 tests pasando.
> * ⏸️ **Fase 6 (WhatsApp & Bot):** En **stand-by** por definición operativa de gerencia, mientras el equipo comercial opera de forma transitoria en ClickUp y se prioriza la estabilización del CRM.

---

## ✅ Primeros pasos
* Diferenciar el tipo de venta si es de instalación, suministro eso nos permitirá diferenciar y programar con proveedores o bien producción, ya que últimamente estamos más con ventas de reventa de material, entonces sería ideal tener una parte para diferenciar al cliente.
* Integrar calendario para las visitas a terreno que tenga Felipe Valverde, Marcos Catalán o Edith Tapia.
* Cuando la venta esté cerrada y sea a producción pasa a calendario planificación con su respectiva identificación de cliente (me imagino que se puede arrastrar al cliente como de proceso).
* Cuando la venta esté cerrada y sea a reventa material se contacta a proveedor y el proceso hay que verlo bien pero coordinación, confirmación stock, listo retiro, listo para despacho, entregado. Considerar sección de postventa.
* En el dashboard principal agregar métricas de ventas por venta de suministro, instalación, comuna más vendida, etc.....
* Cuando ya tengamos listo el módulo de cotizaciones y ventas idealmente producción y logística que van de la mano.

> **En este caso calendario de producción:**  
> Proceso de producción pendiente, orden recibida, confirmación materia prima, en curso, etc..... *(Una vez ya armado te mando esto que no lo recuerdo el proceso ahora).*

#### Planillas de referencia:
* **Calendario producción, programación, ventas actualizado:**  
  [Ver planilla en Google Sheets](https://docs.google.com/spreadsheets/d/15HyMslbGfkewxwVz0wUuZ07VJiBxCKTSRQQVQbSaCxU/edit?usp=sharing)

---

## ✅ Orden de compra
* **Planilla Orden de compra:**  
  [Ver planilla en Google Sheets](https://docs.google.com/spreadsheets/d/1Zn73oXjDNaQxP31M--k8mi0lqWjY-5NO/edit?usp=sharing&ouid=102187050527131997675&rtpof=true&sd=true)
* Plantilla OC enviada wsp, similar a la de cotizaciony agregar para que se asigne a la obra cada.

---

## Comisiones
*(Pendiente de módulo de exportación y cálculo mensual)*

| E | Cliente | Nota de venta | Fecha | Venta | Monto | Ganancia por compra en OC | Terreno | Comisiones | Comisión | I |
| :---: | :--- | :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| | Muebles Asenjo | PR2601-25055 | 2/1/2025 | Bloques | $ 2.500.000 | | | $ 50.000 | X3 | y se vincula con OC |

* Agregar gestionador de obra para saber persona encargada y si la venta está cerrada.
* Ojalá descargarlo por mes en excel y así poder revisar las comisiones de una forma más fácil. ^[En esta parte de comisiones no me queda claro ¿el gestionador de obra es el mismo encargado de la oportunidad de venta? ¿O el gestionador de obra es alguno del equipo comercial o el mismo que tomó la cotización? - Marcado como resuelto / Reabierto]

---

## Estados de producción
* En la parte de producción e instalación: agregar la producción diaria registrada y enlazarla a la cotización del cliente para tener el margen real.

---

## ✅ PARTE VENTAS
* Hay clientes que requieren enviar documentación de trabajadores, contratos, anexos, documentos de la empresa, agregar botón requiere enviar antecedentes ys e suben en ese espacio.
* **Planilla ventas:**  
  [Ver planilla en Google Sheets](https://docs.google.com/spreadsheets/d/1m7JeCZBZ8Hv0kW7k5m5IazzZyEJjaUwElLa4orUoxKc/edit?usp=sharing)

---

## ✅ FICHA DEL CLIENTE
La ficha del cliente debe ser realmente 360°. Cuando alguien abra a un cliente, no debería necesitar entrar a cinco pestañas.

**Encabezado principal:**
* Constructora ABC SpA
* RUT · Ejecutivo · Estado · Segmento · Comuna · Región

**Tarjetas de métricas:**
* Ventas acumuladas.
* Saldo pendiente.
* Cotizaciones abiertas.
* Obras activas.
* Última compra.
* Margen generado.
* Días promedio de pago.
* Reclamos/postventa.
* Próxima actividad.

---

## ✅ CLIENTE (Formulario de Creación)
Y debería preguntar lo mínimo necesario:
* Nombre.
* Empresa.
* Teléfono.
* Email.
* Comuna.
* Región.
* Origen.
* Producto.
* Cantidad aproximada.
* ML/m²/unidades.
* Altura.
* Sólo material o instalación.
* Fecha estimada.
* Vendedor asignado.

---

## ✅ Dashboard principal
Mostrar datos principales de cada área. *(Idealmente que visualmente se vea bonito y no sobrecargado con tanta información, si no más gráficos y otros modelo de mostrar los datos).*
* Gráficos nivel de ventas: Diarias, mensuales.
* Cuánto falta por pagar.
* Comuna más vendida.
* Producto más vendido.
* Ventas por vendedores.
* Método de pago más utilizado.
* Cliente persona natural o persona jurídica o PARTICULAR O EMPRESA.
* Proyecciones de venta pipeline.

---

## ✅ Estados logística
* Averiguar el tema de calendario junto o separado el de obra.

---

## ✅ Módulos Finanzas
* **Planilla Finanzas y Costos:**  
  [Ver planilla en Google Sheets](https://docs.google.com/spreadsheets/d/16h7VracPy4Mip6QYAK1UMqWamY50HooqWwY66sD-AkI/edit?usp=sharing)
* Este es el excel que estoy llevando con toda la información que le he ido agregando para ir midiendo costos, productividad y tener centralizado todo en un solo lugar.
* Está ligado también con métricas de gastos asociados a las obras: costos directos, indirectos.

**Detalle del módulo:**
* Documentos por cada empresa.
* Balances, excel respaldos, eerr, etc…
* Facturas impagas.
* Por recuperar esta semana.
* Ventas por transferencia.
* Pago saldos mostrar monto.
* Pago abonos mostrar monto.
* Gráfico distribución de gastos.
* Solicitud compra módulo: por ser si se necesita comprar algo para los camiones, para la oficina, quién lo solicita, para qué, es urgente, etc.
* OC proveedores.

---

## ✅ Modulos RR.HH
Cada trabajador tendrá su ficha en donde estarán sus datos personales, de contacto, sueldos, comprobantes, documentos, contratos, etc.

* **Carpetas por cada trabajador:**  
  Subcategorizada por contratos/anexos —--------------- Una buena guía es ClickUp para formar el proceso de las carpetas por trabajador.
* Conectar módulo cuando solicitan permiso las chicas, que aparezca bloqueado ese bloque de que ellas no están disponibles.
* Que haya una sección en donde estén los nombres de todos los trabajadores y detalle de si están en maestro obra, instalación, jefe patio, gerente de ventas, visita terreno. Cargo de cada uno como rol rrhh cuando estén ausentes por solicitud permiso o falta en caso de no asistir al trabajo.
* **Asistencia de cada trabajador:**  
  Tengo una duda, nosotros tenemos la asistencia registrada en la empresa de genera, pero es en una página web, me imagino que en una api, quizás, la podemos implementar y trabajarla directo. Esa plataforma lleva el registro de asistencia diario de los trabajadores por el reloj de asistencia. *(Ojo que los trabajadores algunos pertenecen a INMOBILIARIA O COMERCIAL entonces hay que separarlo).*

---

## Esquema General de Módulos (Dashboard 360°)
*Esta es como un esquema de más o menos tendría que tener los datos en la parte de dashboard principal:*

| Módulo | Alcance y Contenido |
| :--- | :--- |
| **Clientes 360°** | Datos, contactos, obras, historial, deuda, compras, reclamos |
| **Leads y oportunidades** | Origen, vendedor, producto solicitado, probabilidad, seguimiento |
| **Cotizaciones y ventas** | Cotización, productos, descuentos, abonos, condiciones y cierre |
| **Obras / proyectos** | Dirección, ML/m²/unidades, fechas, cuadrilla, avance, costos |
| **Producción** | Lotes, cantidades solicitadas/fabricadas, recetas, costos, responsables |
| **Logística y despachos** | Camión, chofer, peso, ruta, carga, descarga, entrega |
| **Compras y proveedores** | OC, proveedor, materia prima, plazos, recepción, pago |
| **Cobranza y finanzas comerciales** | Abonos, saldo, vencimientos, facturas, cliente moroso |
| **Postventa** | Garantías, reclamos, reposición, segunda visita, causa |

---

## ✅ Calendarios
Esta sección está perfecta, porque está ligada con Obra y producción. Para ello debe estar esa sección en donde se asignen las obras con los trabajadores o cuadrillas a cargo, visitas a terreno, a cargo de qué persona, y en producción las personas encargadas de fabricación.

* **✅ Vista general unificada:**  
  Esta parte agregar una sección donde se puedan visualizar igual todos los calendarios en el mismo, como vista general para saber el estado al mismo tiempo de todos.

---

## ⏸️ Módulo conversaciones (WhatsApp)
*(En stand-by por definición operativa — se mantiene bot transitorio en ClickUp para las ejecutivas mientras se estabiliza el CRM)*
* Conversaciones WhatsApp centralizadas ahí, idealmente en conjunto a Meta. Que a cada una le salga en su perfil las cosas por hacer o pendientes.

---

## ✅ Módulo administración
* Documentos separados por cada empresa.
* Prevención de riesgo: Documentos separados por cada empresa.
* Legal: Documentos separados por cada empresa. ^[En Administración se refiere a cada empresa (son tres: COMERCIAL, TRANSPORTES E INMOBILIARIA, pero la principal que mueve todo principalmente obras y más documentos de empresa y trabajadores es Inmobiliaria).]

---

## ✅ Sección de recordatorios diarios y planificación personal
Como en ClickUp podían colocar recordatorios para enviar planillas en tal fecha, mandar documentos en tal fecha, mandarle planilla a tal persona en tal fecha, etc… Cerrar mes en planilla etc.. enviar planilla asistencia, todo ese tipo de recordatorio por persona me gustaría que les saliera en inicio o en alguna parte para que ellas se recordaran lo que deben ir haciendo y % de cumplimiento y lo que les falta por hacer.

---

## Integraciones Pendientes

* **Enlazar Correo:**  
  `hormiglass@gmail.com`
* **ENLAZAR WEBMAIL**
* **ENLAZAR MAILING**
* **ENLAZAR FLOW link de pago**
* **Enlazar WhatsApp:** ⏸️ **En Stand-by** (pausada temporalmente por definición operativa).

---

## ✅ Modulo Post venta
Generar ticket con datos del cliente y que el id de la nv.

---

## ✅ POST VENTA PROCESOS

### Proceso:

#### 1. RECEPCION:
Asignar un número o folio y registrar:
* Fecha del reclamo.
* Cliente.
* Obra.
* Producto.
* Ejecutivo responsable.
* Tipo de problema.
* Estado: Recibido / En revisión / Visita programada / Reparación programada / Cerrado.

#### 2. Revisión Y/O Evaluación Técnica:
*(LO MÁS PROBABLE ES QUE HAYA VISITA TÉCNICA PARA VER SI CORRESPONDE)*  
La idea es que queden a responder obligatorias, si no, no se responderán las más importantes.

**Verificar antecedentes de la venta:**
* Qué se cotizó.
* Qué se contrató.
* Qué se instaló o entregó.
* Condiciones del terreno.
* Observaciones de instalación.
* Fotos antes/durante/después del trabajo.
* Guía de despacho, recepción conforme y pagos.

> *En realidad en esta sección agregar antecedentes de la visita requerimiento, el por qué sucedió, fecha de contratación debe ir en cada categoría.*

#### 3. Clasificación del problema:
Determinar si corresponde a:
* Producto defectuoso.
* Problema de fabricación.
* Problema de instalación.
* Daño durante transporte.
* Uso incorrecto del producto.
* Movimiento o condiciones del terreno.
* Trabajo adicional solicitado por el cliente.
* Daño causado por terceros.

#### 4. Resolución de la postventa:
Según el diagnóstico:
* **Garantía:** reparación o reposición sin costo. Dejar un documento prototipo de la cobertura de la GARANTÍA.
* **Responsabilidad parcial:** acuerdo comercial con el cliente.
* **No corresponde a garantía:** enviar cotización por reparación.
* **Daño de transporte externo:** derivar responsabilidad al transportista cuando corresponda.

#### 5. Programación:
* Fecha.
* Definir maestro/cuadrilla.

#### 6. Ejecución:
* Sacar fotografías.
* Obtener conformidad del cliente.

#### 7. Cierre:
La postventa solamente debería marcarse como Cerrada cuando exista:
* Trabajo terminado.
* Fotografías finales.
* Confirmación del cliente.
* Registro del costo de la postventa.
* Causa identificada.

> Además, registrar el costo de cada postventa va a servir muchísimo para la matriz de costos: materiales + maestro + traslado + flete + reposición. Así pueden detectar, por ejemplo, qué productos o cuadrillas generan más reclamos. Necesito que se ancle la post venta al vendedor y cuadrilla a cargo para monitorear eso que está abajo.

**Flujo Operativo:**
```
Cliente informa problema 
  → Recepción y evidencia 
  → Revisión de venta 
  → Diagnóstico 
  → ¿Corresponde garantía? 
  → Visita técnica si es necesaria 
  → Resolución 
  → Programación 
  → Ejecución 
  → Conformidad 
  → Cierre
```

> Para Hormiglass agregaría además un control de causa raíz, con categorías como **Fabricación / Instalación / Despacho / Terreno / Cliente / Proveedor / Transportista**, porque después podrán obtener un KPI mensual de postventa y saber exactamente dónde se están generando las pérdidas.

---

## ✅ Sección Perfil personal
Agregar perfil para cada trabajador:
* Registro Asistencia.
* Registro permisos: Que se enlace directamente de los datos guardados de la planilla de RR.HH. con los datos de cada uno.
* Registro sueldos.
* Registro recordatorios asignados a cada uno por fecha.

---

### Notas y Comentarios del Documento:
* **Nota [a]-[c]**: En esta parte de comisiones no me queda claro ¿el gestionador de obra es el mismo encargado de la oportunidad de venta? ¿O el gestionador de obra es alguno del equipo comercial o el mismo que tomó la cotización? *(Marcado como resuelto / Reabierto)*.
* **Nota [d]-[e]**: En Administración se refiere a cada empresa (son tres: **COMERCIAL, TRANSPORTES E INMOBILIARIA**, pero la principal que mueve todo principalmente obras y más documentos de empresa y trabajadores es Inmobiliaria).
