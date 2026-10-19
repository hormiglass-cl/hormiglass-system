import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Fase 2: verificación de plantilla de cotización sin SPECIMEN', () => {
  const modalPath = path.resolve('components/PdfPreviewModal.tsx');
  const code = fs.readFileSync(modalPath, 'utf8');

  // 1. No debe existir texto de SPECIMEN ni etiquetas de espécimen
  assert.equal(code.includes('Cotización SPECIMEN - No validado'), false, 'No debe existir el texto SPECIMEN - No validado');
  assert.equal(code.includes('Borrador / Especimen'), false, 'No debe existir el badge Borrador / Especimen');

  // 2. Debe contener los datos oficiales de Sociedad Inmobiliaria Hormiglass spa
  assert.ok(code.includes('Sociedad Inmobiliaria Hormiglass spa'), 'Debe incluir la razón social oficial');
  assert.ok(code.includes('77.615.313-3'), 'Debe incluir el RUT 77.615.313-3');
  assert.ok(code.includes('COMPRA, VENTA Y ALQUILER (EXCEPTO AMOBLADOS) DE INMUEBLES'), 'Debe incluir el Giro oficial');
  assert.ok(code.includes('Portezuelo #1502'), 'Debe incluir la dirección Portezuelo #1502');
  assert.ok(code.includes('San Bernardo'), 'Debe incluir San Bernardo');
  assert.ok(code.includes('hormiglass@gmail.com'), 'Debe incluir el correo hormiglass@gmail.com');

  // 3. Debe contener los datos bancarios para transferencia Santander
  assert.ok(code.includes('0-000-8836639-5'), 'Debe incluir la cuenta corriente 0-000-8836639-5');
  assert.ok(code.includes('Banco Santander'), 'Debe incluir el Banco Santander');
  assert.ok(code.includes('comprobantes@hormiglass.cl'), 'Debe incluir el correo para comprobantes');
});
