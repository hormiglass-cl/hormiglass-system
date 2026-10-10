# Requerimiento: Regularización y Validación del Catálogo Bottai

**Documento:** Especificación de Requerimiento y Guía de Llenado  
**Destinatarios:** Administración Hormiglass / Mariela Valverde / Proveedor Bottai  
**Proyecto:** Hormiglass CRM (Módulo de Productos, Cotizaciones y Logística)  
**Archivo Excel Adjunto:** [`Plantilla_Revision_Productos_Bottai.xlsx`](file:///Users/jesusrodriguez/Claude%20Code/projects/hormiglass-system/local/ajustes/octubre/Plantilla_Revision_Productos_Bottai.xlsx)  
**Fecha:** Octubre 2026  

---

## 1. Contexto y Diagnóstico del Problema

En el marco de la integración del **Maestro Unificado de Productos** en el CRM de Hormiglass ([`Maestro_Productos_Hormiglass_Proveedores.xlsx`](file:///Users/jesusrodriguez/Claude%20Code/projects/hormiglass-system/local/ajustes/octubre/Maestro_Productos_Hormiglass_Proveedores.xlsx)), se identificaron inconsistencias en la lista de **179 productos de Bottai (reventa)**:

1. **Origen OCR defectuoso:** Los datos fueron extraídos mediante escaneo óptico (OCR) desde un PDF antiguo de lista de precios de Bottai.
2. **Descripciones con ruido:** Varios nombres contienen caracteres erróneos (`©`, `~`, `“`, `”`, `‘`, `@`, `§`) o tablas superpuestas dentro del nombre.
3. **8 productos críticos sin precio:** No tienen precio registrado o traen valores no confiables ($0 / truncados).
4. **Atributos técnicos en blanco (0/179):** Ningún producto cuenta actualmente con **Peso unitario (kg)**, **Medidas normalizadas** o **Color**, campos necesarios para la operación diaria.

---

## 2. Impacto Operativo en el CRM

* **En Ventas / Cotizaciones:** No es posible cotizar los 8 productos sin precio, y aquellos con descripciones corruptas generan documentos de cotización poco profesionales ante el cliente.
* **En Logística / Guías de Despacho:** La ausencia del **peso unitario en kg** impide calcular automáticamente la carga total del camión al planificar fletes y emitir guías de despacho, aumentando el riesgo de sobrepeso o errores en la flota.

---

## 3. Lista de los 8 Productos Críticos (Urgente: Falta Precio)

Los siguientes ítems están bloqueados comercialmente hasta que se defina su precio de lista o costo de referencia:

| # | Código CRM | Código Proveedor | Descripción actual en catálogo | Categoría | Precio Actual |
| :-: | :--- | :--- | :--- | :--- | :-: |
| 1 | `BOT-100102216` | `100102216` | TUBO CIRC CTE S/CAB. DE 1600 mm x 1 mt. TUBOCS “@1,0x1,0 722 $ 75.480 | Otros | **Sin precio** |
| 2 | `BOT-200201588` | `200201588` | PASTELON 40X40X4cm GRIS OCEM C/D RELIEVE PIEDRA | Pastelones | **Sin precio** |
| 3 | `BOT-200202025` | `200202025` | PASTELON 80x30x4em ROJO | Pastelones | **Sin precio** |
| 4 | `BOT-200211817` | `200211817` | Ss BARRERA CAMINERA SIMPLE ALT 0.81m TIPO F_ 3m MOP | Barreras | **Sin precio** |
| 5 | `BOT-250222125` | `250222125` | CUERPO BASE 1800 x0.60 | Camaras | **Sin precio** |
| 6 | `BOT-400414505` | `400414505` | ADOQUIN ECOPARK 28x46 RN 35 mpa GRIS 7.63 x m2 | Adoquines | **Sin precio** |
| 7 | `BOT-400416128` | `400416128` | += ADOQUIN ROMA 10cm A.R 5Smpa GRIS -ADOQUNES 10 55MPa 221,88 $ 22.117 | Adoquines | **Sin precio** |
| 8 | `BOT-650701077` | `650701077` | Cajén t « 1 x2.5m (Hr06 - 2)- Clase A CAJSONES Clase A 3977 § 666 426 | Otros | **Sin precio** |

---

## 4. Estructura de la Planilla Excel Entregada

Se ha generado el archivo [`Plantilla_Revision_Productos_Bottai.xlsx`](file:///Users/jesusrodriguez/Claude%20Code/projects/hormiglass-system/local/ajustes/octubre/Plantilla_Revision_Productos_Bottai.xlsx) con tres hojas de trabajo:

### Hoja 1: `Instrucciones de Llenado`
Resumen de prioridades, definición de cada campo y reglas de completitud.

### Hoja 2: `Catálogo Bottai (Revisar)`
Contiene los **179 productos** organizados por columnas y clasificados por color en la columna **Estado de Revisión**:
* 🔴 **`URGENTE: FALTA PRECIO`** (8 filas): Celdas destacadas en rojo.
* 🟡 **`REVISAR DESCRIPCIÓN (OCR)`** (17 filas): Nombres con caracteres especiales que requieren ajuste de texto.
* 🟢 **`PRECIO REGISTRADO (VALIDAR)`** (154 filas): Tienen un precio base pero requieren confirmación de vigencia y completar peso/medidas.

### Hoja 3: `Agregar Productos Nuevos`
Tabla con 25 filas pre-formateadas para incorporar cualquier producto habitual de Bottai que no esté en la nómina actual.

---

## 5. Columnas Requeridas y Cómo Completarlas

| Columna | Obligatorio | Formato / Ejemplo | Por qué es necesario |
| :--- | :-: | :--- | :--- |
| **Código Proveedor (SKU)** | Sí | `100101103` | Permite cruzar con facturas y órdenes de compra del proveedor. |
| **Descripción Limpia** | Sí | `Tubo circular corriente 150 mm x 1 m` | Es el texto que lee el cliente en la cotización PDF. |
| **Categoría** | Sí | `Tubos`, `Cámaras`, `Adoquines`, `Pastelones`, etc. | Permite filtrar en el catálogo y agrupar costos. |
| **Subcategoría / Terminación** | Opcional | `Zenith`, `Clase A`, `Biselado`, `Relieve` | Atributo técnico para diferenciar modelos. |
| **Medidas** | Sí | `150mm x 1m`, `40x40x4 cm`, `1.2x1.2x2 m` | Especificación técnica clave para el comprador. |
| **Color** | Si aplica | `Gris`, `Rojo`, `Ocre`, `Negro` | Variantes estéticas en adoquines y pastelones. |
| **Unidad** | Sí | `UND`, `M2`, `ML` | Base de cálculo para precios y cantidades. |
| **Peso kg (Unitario)** | **Crítico** | `28.5`, `120`, `450` | **Cálculo de carga de camiones en Guías de Despacho**. |
| **Precio ref. sin IVA ($)** | **Crítico** | `$8.882`, `$15.500` | **Base para cotizar y calcular margen comercial**. |

---

## 6. Correo / Mensaje Listo para Enviar

```text
Asunto: Requerimiento: Actualización y validación del Catálogo de Productos Bottai (Precios y Fichas Técnicas)

Estimada Mariela / Equipo Administración,

Junto con saludar, nos encontramos preparando la carga definitiva del Maestro de Productos en el CRM de Hormiglass.

Al revisar la lista de productos de reventa de Bottai (179 productos en total), detectamos que la lista original provino de una lectura automática por escaneo (OCR), lo que dejó algunos nombres con caracteres corruptos y 8 productos críticos sin precio de venta. Además, faltan los datos de peso unitario (kg), necesarios para calcular la capacidad de los camiones al generar guías de despacho.

Para dejar este catálogo 100% operativo y listo para cotizar, les adjuntamos la planilla Excel:
"Plantilla_Revision_Productos_Bottai.xlsx"

En dicha planilla encontrarán:
1. Pestaña "Catálogo Bottai (Revisar)": Lista de los 179 productos con los 8 ítems sin precio marcados en ROJO para su priorización.
2. Pestaña "Agregar Productos Nuevos": Espacio para ingresar cualquier producto de Bottai que se venda habitualmente y no esté en la lista.

Puntos prioritarios a completar:
• Indicar el precio neto de los 8 productos marcados en rojo.
• Confirmar que los precios vigentes sean los correctos.
• Completar el Peso en kg de cada pieza (vital para la logística y fletes).
• Si cuentan con la lista de precios oficial de Bottai directamente en Excel emitida por ellos, también pueden enviárnosla directamente y nosotros realizamos el cruce.

Agradecemos su apoyo con esta información para habilitar la cotización inmediata de estos productos en el sistema.

Saludos cordiales,
Equipo Hormiglass
```

---

## 7. Estado de Implementación y Avances en el CRM (Octubre 2026)

> [!NOTE]
> **Catálogo Maestro y Operación de 0 a 100 Completada (10 de Octubre de 2026):**
> * ✅ **Catálogo Unificado Cargado:** Los 348 productos oficiales (incluidos los 179 productos de Bottai S.A., los de MACBAL S.A., Atrio Baldosas y fabricación propia Hormiglass) se encuentran cargados y activos en la base de datos de producción de Supabase (`catalogo_productos`).
> * ✅ **Directorio de Proveedores y Carga Masiva:** En `/proveedores` se habilitó el módulo de importación masiva (CSV y Excel) con validación de RUT chileno (algoritmo Módulo 11) y descarga de plantillas oficiales.
> * ✅ **Ciclo 0 a 100 Operativo:** El flujo completo (Cliente → Cotización → Oportunidad → Abono Ventas → Conciliación en Caja → Pago Validado automático → Venta Aprobada → OC Insumos → Guía y Acreditación → Cierre en Producción Finalizada) se encuentra verificado al 100% con 53 tests pasando.
> * ⏸️ **Integración de WhatsApp:** Mantenida en **stand-by** por definición operativa de gerencia, mientras el equipo comercial opera de forma transitoria en ClickUp y se consolida la adopción del CRM.

