import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarRutChileno,
  parseProveedoresCsv,
  parseProveedoresData,
  parseProveedoresFile,
  generarPlantillaProveedoresCsv,
  generarPlantillaProveedoresXlsx,
} from '../lib/proveedores-csv.ts';

test('Fase 5: valida RUTs chilenos con cálculo exacto Módulo 11', () => {
  // RUTs chilenos válidos calculados por Módulo 11
  const rutsValidos = [
    { rut: '77.615.313-3', dvEsperado: '3' }, // Sociedad Inmobiliaria Hormiglass SpA
    { rut: '80.125.100-5', dvEsperado: '5' }, // Bottai S.A.
    { rut: '96.547.800-0', dvEsperado: '0' }, // MACBAL S.A.
    { rut: '76.840.120-9', dvEsperado: '9' }, // Atrio Baldosas
    { rut: '10.000.013-K', dvEsperado: 'K' }, // DV K
    { rut: '10000013k', dvEsperado: 'K' },    // minúscula y sin formato
    { rut: '11.111.111-1', dvEsperado: '1' }, // DV 1
  ];

  for (const item of rutsValidos) {
    const res = validarRutChileno(item.rut, { estricto: true });
    assert.equal(res.valido, true, `Debe validar como válido el RUT: ${item.rut}`);
    assert.equal(res.dvCorrecto, true, `DV debe ser correcto para: ${item.rut}`);
    assert.equal(res.dvEsperado, item.dvEsperado);
    assert.ok(res.rutFormateado);
    assert.ok(res.rutLimpio);
  }
});

test('Fase 5: modo estricto rechaza RUTs con dígito verificador erróneo o largo inválido', () => {
  const rutsInvalidos = [
    '77.615.313-4', // DV incorrecto (debería ser 3)
    '80.125.100-8', // DV incorrecto (debería ser 5)
    '1234',         // Muy corto
    '123456789012', // Muy largo
    '',             // Vacío
  ];

  for (const rut of rutsInvalidos) {
    const res = validarRutChileno(rut, { estricto: true });
    assert.equal(res.valido, false, `Debe rechazar RUT inválido en modo estricto: ${rut}`);
    assert.ok(res.mensaje.length > 0);
  }
});

test('Fase 5: modo flexible advierte pero no bloquea RUT con discrepancia de DV', () => {
  const res = validarRutChileno('80.125.100-7', { estricto: false });
  assert.equal(res.valido, true);
  assert.equal(res.dvCorrecto, false);
  assert.equal(res.dvEsperado, '5');
  assert.ok(res.advertencia?.includes('Módulo 11'));
});

test('Fase 5: parsea CSV de proveedores con columnas flexibles y limpia espacios', () => {
  const csvContent = `
R.U.T.;Razón Social;Persona Contacto;Fono;Email;Dirección;Comuna;Rubro
76.840.120-9;Atrio Baldosas SpA;Ventas Distribución;+56 9 8765 4321;ventas@atrio.cl;Av. Industrial 1234;San Bernardo;Baldosas
80.125.100-5;Bottai S.A.;Mesa Central;+56 2 2345 6789;contacto@bottai.cl;Camino Melipilla;Maipú;Prefabricados
`.trim();

  const { rows, errors } = parseProveedoresCsv(csvContent);
  assert.equal(errors.length, 0, `No debe tener errores: ${errors.join(', ')}`);
  assert.equal(rows.length, 2);

  assert.equal(rows[0].rut, '76.840.120-9');
  assert.equal(rows[0].nombre, 'Atrio Baldosas SpA');
  assert.equal(rows[0].correo, 'ventas@atrio.cl');
  assert.equal(rows[0].rubro, 'Baldosas');

  assert.equal(rows[1].rut, '80.125.100-5');
  assert.equal(rows[1].nombre, 'Bottai S.A.');
  assert.equal(rows[1].comuna, 'Maipú');
});

test('Fase 5: detecta RUTs duplicados y errores fila por fila', () => {
  const csvContent = `
RUT,Nombre
76.840.120-9,Proveedor A
76.840.120-9,Proveedor A Duplicado
123,Proveedor Con Largo Inválido
`.trim();

  const { rows, errors } = parseProveedoresCsv(csvContent);
  assert.equal(rows.length, 1); // Solo Proveedor A pasa
  assert.equal(errors.length, 2);
  assert.ok(errors.some((e) => e.includes('duplicado')));
  assert.ok(errors.some((e) => e.includes('no es válido')));
});

test('Fase 5: genera plantillas de ejemplo válidas en CSV y XLSX', () => {
  const csvTemplate = generarPlantillaProveedoresCsv();
  assert.ok(csvTemplate.includes('76.840.120-9'));
  assert.ok(csvTemplate.includes('Bottai S.A.'));

  const { rows, errors } = parseProveedoresCsv(csvTemplate);
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 3);

  const xlsxBytes = generarPlantillaProveedoresXlsx();
  assert.ok(xlsxBytes instanceof Uint8Array);
  assert.ok(xlsxBytes.length > 500);

  const { rows: xlsxRows, errors: xlsxErrors } = parseProveedoresFile(xlsxBytes);
  assert.equal(xlsxErrors.length, 0);
  assert.equal(xlsxRows.length, 3);
});
