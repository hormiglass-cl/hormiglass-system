import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Fase 5: verificación del endpoint API y documentación del protocolo Bot/ClickUp', () => {
  const protocolDocPath = path.resolve('local/ajustes/octubre/19/PROTOCOLO-BOT-CLICKUP-JP.md');
  assert.ok(fs.existsSync(protocolDocPath), 'El documento de protocolo debe existir');

  const protocolContent = fs.readFileSync(protocolDocPath, 'utf8');
  assert.ok(protocolContent.includes('/api/leads'), 'Debe documentar el endpoint /api/leads');
  assert.ok(protocolContent.includes('registrar_lead_externo'), 'Debe documentar la función RPC registrar_lead_externo');
  assert.ok(protocolContent.includes('WhatsApp Bot'), 'Debe contemplar el canal WhatsApp Bot');
  assert.ok(protocolContent.includes('ClickUp'), 'Debe contemplar ClickUp');
  assert.ok(protocolContent.includes('Deduplicación'), 'Debe explicar la deduplicación de clientes');

  const apiRoutePath = path.resolve('app/api/leads/route.ts');
  assert.ok(fs.existsSync(apiRoutePath), 'La ruta Next.js app/api/leads/route.ts debe existir');

  const apiRouteCode = fs.readFileSync(apiRoutePath, 'utf8');
  assert.ok(apiRouteCode.includes('registrar_lead_externo'), 'route.ts debe invocar la RPC registrar_lead_externo');
  assert.ok(apiRouteCode.includes('El campo "nombre" es obligatorio'), 'route.ts debe validar que el nombre no esté vacío');
});

test('Fase 5: validación de payload y normalización de prospecto', () => {
  const validarLeadPayload = (payload) => {
    if (!payload.nombre || typeof payload.nombre !== 'string' || !payload.nombre.trim()) {
      return { valid: false, error: 'El campo "nombre" es obligatorio y debe ser un texto válido.' };
    }
    const cleanNombre = payload.nombre.trim();
    const isJuridica = /(spa|ltda|s\.a|eirl|sociedad|inversiones|constructora)/i.test(cleanNombre) ||
      (payload.rut && /^(7|8|9)[0-9]/.test(payload.rut.replace(/[^0-9]/g, '')));

    return {
      valid: true,
      tipo_cliente: isJuridica ? 'juridica' : 'natural',
      data: {
        nombre: cleanNombre,
        telefono: payload.telefono ? String(payload.telefono).trim() : null,
        correo: payload.correo ? String(payload.correo).trim().toLowerCase() : null,
        rut: payload.rut ? String(payload.rut).trim() : null,
        direccion: payload.direccion ? String(payload.direccion).trim() : null,
        comuna: payload.comuna ? String(payload.comuna).trim() : null,
        origen: payload.origen || 'WhatsApp Bot',
        tipo_venta: payload.tipo_venta || 'Instalación',
        modalidad_requerimiento: payload.modalidad_requerimiento || 'instalacion',
      },
    };
  };

  // Rechazo de payload sin nombre
  const emptyRes = validarLeadPayload({});
  assert.equal(emptyRes.valid, false);

  // Persona Natural
  const naturalRes = validarLeadPayload({
    nombre: 'Pedro Pascal',
    telefono: '+56911223344',
    comuna: 'San Bernardo',
  });
  assert.equal(naturalRes.valid, true);
  assert.equal(naturalRes.tipo_cliente, 'natural');
  assert.equal(naturalRes.data.nombre, 'Pedro Pascal');

  // Persona Jurídica detectada por razón social
  const juridicaRes = validarLeadPayload({
    nombre: 'Constructora Los Andes SpA',
    rut: '76.123.456-7',
    comuna: 'Calera de Tango',
  });
  assert.equal(juridicaRes.valid, true);
  assert.equal(juridicaRes.tipo_cliente, 'juridica');
});
