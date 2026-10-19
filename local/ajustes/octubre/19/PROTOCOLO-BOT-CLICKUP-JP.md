# Protocolo Oficial de Integración de Leads: ClickUp / Bot / WhatsApp a Hormiglass CRM

**Fecha:** 19 de Octubre 2026  
**Destinatarios:** Mariela Valverde, Felipe Valverde, JP (Desarrollador de Integración Bot), Equipo Comercial Hormiglass  
**Objetivo:** Establecer un protocolo técnico y operacional 100% independiente para que cualquier lead o prospecto captado a través de WhatsApp Bot, ClickUp, formularios web o redes sociales ingrese automáticamente al CRM Hormiglass, sin intermediaciones manuales ni cuellos de botella.

---

## 1. Contexto y Objetivos Operacionales

En las reuniones y notas de voz del 19 de octubre (Audios 3 y 5), la gerencia de Hormiglass acordó:
1. **Independencia Operativa:** El equipo de ventas no debe estar esperando ni depender de configuraciones personales para que los clientes ingresen al sistema.
2. **Doble Digitado Cero:** Terminar definitivamente con el traspaso manual de datos entre ClickUp, planillas Excel y el CRM.
3. **Continuidad del Bot Existente:** El bot desarrollado por JP (o cualquier servicio webhook como Make, n8n, Zapier o ManyChat) ahora cuenta con un punto de entrada oficial para enviar los datos con un simple `POST`.
4. **Visibilidad Inmediata:** Cada lead que entra genera una notificación en tiempo real para las ejecutivas y administradores, ubicándose en la etapa `nueva` del pipeline comercial con su porcentaje de comisión (3%) y ficha de cliente asociada.

---

## 2. Endpoints Oficiales de Ingesta

El CRM Hormiglass dispone de dos vías directas para la recepción de leads:

### Opción A: API REST del CRM (Recomendada para Webhooks, Make, Zapier y scripts externos)
- **Método:** `POST`
- **URL Producción:** `https://hormiglass-system.vercel.app/api/leads`
- **URL Local:** `http://localhost:3000/api/leads`
- **Headers:** `Content-Type: application/json`

### Opción B: RPC Directo a Supabase (Para integraciones serverless o bots con SDK Supabase)
- **Método:** `POST`
- **URL:** `https://jvenwcupdllcqbxixcuo.supabase.co/rest/v1/rpc/registrar_lead_externo`
- **Headers:** 
  - `Content-Type: application/json`
  - `apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>`

---

## 3. Especificación del Payload (JSON)

| Campo | Tipo | Requerido | Descripción / Ejemplo |
| :--- | :--- | :---: | :--- |
| `nombre` | `string` | **SÍ** | Nombre completo de la persona o razón social (ej: `"Constructora Los Andes SpA"`, `"Pedro Pascal"`). |
| `telefono` | `string` | No | Número de contacto en formato nacional o internacional (ej: `"+56987654321"`). |
| `correo` | `string` | No | Correo electrónico del cliente (ej: `"contacto@losandes.cl"`). |
| `rut` | `string` | No | RUT chileno con puntos y guion o limpio (ej: `"76.123.456-7"`). |
| `direccion` | `string` | No | Dirección de la obra o domicilio del cliente (ej: `"Camino Lonquén 4500"`). |
| `comuna` | `string` | No | Comuna de despacho o instalación (ej: `"Calera de Tango"`, `"San Bernardo"`). |
| `region` | `string` | No | Región administrativa (por defecto: `"Región Metropolitana"`). |
| `origen` | `string` | No | Canal de captación (ej: `"WhatsApp Bot"`, `"ClickUp"`, `"Web"`, `"Instagram"`). |
| `tipo_venta` | `string` | No | `"Instalación"` (defecto), `"Suministro"` o `"Reventa"`. |
| `modalidad_requerimiento` | `string` | No | `"instalacion"` (defecto) o `"suministro"`. |
| `titulo` | `string` | No | Título breve de la oportunidad (si se omite, se autogenera ej: `"Prospecto WhatsApp Bot - Pedro Pascal"`). |
| `notas` | `string` | No | Detalle del requerimiento, medidas o productos solicitados. Se registrará en la bitácora interna. |
| `ejecutivo_id` | `uuid` | No | UUID del usuario comercial asignado. Si se omite, se asigna al primer ejecutivo activo del sistema. |

---

## 4. Comportamiento Automatizado en la Base de Datos

Cuando se ejecuta el registro de lead:
1. **Deduplicación Inteligente:** Se busca si ya existe un cliente con el mismo RUT, teléfono o correo.
   - Si existe: reutiliza su ficha y complementa los campos vacíos (dirección o comuna).
   - Si no existe: crea automáticamente el registro en la tabla `clientes` tipificando si es persona `natural` o `juridica`.
2. **Generación de Oportunidad:**
   - Asigna un código correlativo oficial tipo `OP-2026-XXXX`.
   - Se sitúa en la etapa inicial `nueva`.
   - Fija la comisión comercial al `3.00%` en estado `pendiente`.
   - Guarda las notas del cliente en la bitácora de venta (`notas_venta`).
3. **Notificación en Tiempo Real:** Dispara un aviso interno en el CRM para que el equipo comercial atienda el requerimiento de inmediato.

---

## 5. Ejemplos Prácticos de Implementación

### Ejemplo 1: cURL (Prueba rápida desde terminal)
```bash
curl -X POST https://hormiglass-system.vercel.app/api/leads \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Agroindustrial El Roble Ltda",
    "telefono": "+56976543210",
    "correo": "adquisiciones@elroble.cl",
    "rut": "77.987.654-3",
    "direccion": "Parcela 14, Camino Melipilla",
    "comuna": "Talagante",
    "origen": "WhatsApp Bot",
    "tipo_venta": "Instalación",
    "modalidad_requerimiento": "instalacion",
    "titulo": "Cierro de Hormigón 2.0m Alto - 250 ML",
    "notas": "Cliente solicita cotización formal con instalación y flete incluido para inicio de obra en 15 días."
  }'
```

### Ejemplo 2: Python (Para el Bot de JP o Scripts de Automatización)
```python
import requests

payload = {
    "nombre": "Inmobiliaria Santa María",
    "telefono": "+56999887766",
    "correo": "contacto@santamaria.cl",
    "comuna": "San Bernardo",
    "origen": "WhatsApp Bot",
    "tipo_venta": "Instalación",
    "notas": "Cotizar pastelones y soleras para condominio."
}

response = requests.post("https://hormiglass-system.vercel.app/api/leads", json=payload)
data = response.json()
print("Lead creado exitosamente:", data["codigo"], "ID:", data["oportunidad_id"])
```

### Ejemplo 3: Configuración en ClickUp Webhook / Make / Zapier
- **Acción:** `Custom Webhook` o `HTTP Request`
- **URL:** `https://hormiglass-system.vercel.app/api/leads`
- **Method:** `POST`
- **Body Data:** Mapear los campos del formulario de ClickUp (Nombre, Teléfono, Comuna, etc.) al JSON especificado en la sección 3.

---

## 6. Respuesta del Sistema

**Respuesta Exitosa (HTTP 200 OK):**
```json
{
  "success": true,
  "cliente_id": "7ad03c1b-d015-46b9-8048-6b73c20f4cf9",
  "oportunidad_id": "61e1767f-121f-4b6c-829f-b8383695053d",
  "codigo": "OP-2026-6699",
  "titulo": "Instalación Cierro Perimetral Los Andes",
  "estado_pipeline": "nueva"
}
```

**Respuesta de Error de Validación (HTTP 400 Bad Request):**
```json
{
  "error": "El campo \"nombre\" es obligatorio y debe ser un texto válido."
}
```
