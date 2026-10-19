import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseProductosCsv } from '../lib/productos-csv.ts';
import { validarRutChileno } from '../lib/proveedores-csv.ts';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

test('Fase 4: estructura e integridad de las hojas del Maestro de Productos Excel', () => {
  const excelPath = path.resolve('local/ajustes/octubre/19/Maestro_Productos_Hormiglass_Proveedores.xlsx');
  assert.ok(fs.existsSync(excelPath), 'El archivo Excel maestro debe existir en local/ajustes/octubre/19/');

  const wb = XLSX.readFile(excelPath);
  const expectedSheets = [
    'Maestro productos',
    'Hormiglass',
    'Macbal',
    'Bottai',
    'Atrio',
    'Guía códigos',
    'Listas',
  ];

  for (const sheet of expectedSheets) {
    assert.ok(wb.SheetNames.includes(sheet), `Debe existir la hoja "${sheet}" en el Excel maestro`);
  }

  const maestroRows = XLSX.utils.sheet_to_json(wb.Sheets['Maestro productos']);
  const hgRows = XLSX.utils.sheet_to_json(wb.Sheets['Hormiglass']);
  const macRows = XLSX.utils.sheet_to_json(wb.Sheets['Macbal']);
  const botRows = XLSX.utils.sheet_to_json(wb.Sheets['Bottai']);
  const atrRows = XLSX.utils.sheet_to_json(wb.Sheets['Atrio']);

  assert.equal(maestroRows.length, 340, 'El Maestro debe contener exactamente 340 productos consolidados');
  assert.equal(hgRows.length, 77, 'Hormiglass debe tener 77 productos de fabricación propia');
  assert.equal(macRows.length, 31, 'Macbal debe tener 31 baldosas y adoquines de reventa');
  assert.equal(botRows.length, 179, 'Bottai debe tener 179 tubos y soleras de reventa');
  assert.equal(atrRows.length, 53, 'Atrio debe tener 53 baldosas de reventa');

  assert.equal(hgRows.length + macRows.length + botRows.length + atrRows.length, 340);
});

test('Fase 4: convención de prefijos y trazabilidad de códigos por proveedor', () => {
  const excelPath = path.resolve('local/ajustes/octubre/19/Maestro_Productos_Hormiglass_Proveedores.xlsx');
  const wb = XLSX.readFile(excelPath);

  const hgRows = XLSX.utils.sheet_to_json(wb.Sheets['Hormiglass']);
  const macRows = XLSX.utils.sheet_to_json(wb.Sheets['Macbal']);
  const botRows = XLSX.utils.sheet_to_json(wb.Sheets['Bottai']);
  const atrRows = XLSX.utils.sheet_to_json(wb.Sheets['Atrio']);

  for (const row of hgRows) {
    assert.match(row['Código interno'], /^HG-/, `Código ${row['Código interno']} debe iniciar con HG-`);
    assert.equal(row['Origen'], 'Fabricación propia');
    assert.equal(row['Proveedor'], 'HORMIGLASS');
  }

  for (const row of macRows) {
    assert.match(row['Código interno'], /^MAC-/, `Código ${row['Código interno']} debe iniciar con MAC-`);
    assert.equal(row['Origen'], 'Compra / reventa');
    assert.equal(row['Proveedor'], 'MACBAL');
  }

  for (const row of botRows) {
    assert.match(row['Código interno'], /^BOT-/, `Código ${row['Código interno']} debe iniciar con BOT-`);
    assert.equal(row['Origen'], 'Compra / reventa');
    assert.equal(row['Proveedor'], 'BOTTAI');
  }

  for (const row of atrRows) {
    assert.match(row['Código interno'], /^ATR-/, `Código ${row['Código interno']} debe iniciar con ATR-`);
    assert.equal(row['Origen'], 'Compra / reventa');
    assert.equal(row['Proveedor'], 'ATRIO');
  }
});

test('Fase 4: validación de RUT chileno de proveedores existentes y nuevos (Audio 1)', () => {
  // Proveedores activos en Hormiglass: todos deben ser válidos estructuralmente
  const rutAtrio = validarRutChileno('76.840.120-K');
  assert.equal(rutAtrio.valido, true);

  const rutBottai = validarRutChileno('91.025.000-7');
  assert.equal(rutBottai.valido, true);

  const rutMacbal = validarRutChileno('96.547.800-0');
  assert.equal(rutMacbal.valido, true);
  assert.equal(rutMacbal.dvCorrecto, true);

  const rutHormiglass = validarRutChileno('77.615.313-3');
  assert.equal(rutHormiglass.valido, true);
  assert.equal(rutHormiglass.dvCorrecto, true);

  // Validación de RUT erróneo en modo estricto
  const rutInvalido = validarRutChileno('11.111.111-9', { estricto: true });
  assert.equal(rutInvalido.valido, false);
  assert.equal(rutInvalido.dvCorrecto, false);
});

test('Fase 4: simulación de importación de nuevo proveedor y asociación a catálogo de productos', () => {
  const proveedoresMap = {
    'HORMIGLASS': '00000000-0000-0000-0000-000000000001',
    'MACBAL': '56aa5c16-59a4-4361-955c-e59b7ad2629a',
    'BOTTAI': 'e104abc4-892d-44fd-a197-1b43127a206a',
    'ATRIO': '3b292d62-4ad8-48e4-aabc-83574b85573f',
    'NUEVO PROVEEDOR S.A.': 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  };

  const csvContent = `Código interno;Descripción;Categoría;Origen;Proveedor;Unidad;Precio ref. sin IVA
NUEVO-001;Tubo Especial Cemento 200mm;Tubos;Compra / reventa;NUEVO PROVEEDOR S.A.;UND;15500
HG-PAS-999;Pastelón Hormiglass Especial;Pastelones;Fabricación propia;HORMIGLASS;UND;4500`;

  const parsed = parseProductosCsv(csvContent, proveedoresMap);
  assert.equal(parsed.errors.length, 0, `No debe tener errores: ${parsed.errors.join(', ')}`);
  assert.equal(parsed.rows.length, 2);

  const prodReventa = parsed.rows[0];
  assert.equal(prodReventa.codigo, 'NUEVO-001');
  assert.equal(prodReventa.origen, 'reventa');
  assert.equal(prodReventa.proveedor_id, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
  assert.equal(prodReventa.precio_referencia, 15500);

  const prodFabricacion = parsed.rows[1];
  assert.equal(prodFabricacion.codigo, 'HG-PAS-999');
  assert.equal(prodFabricacion.origen, 'fabricacion_propia');
  assert.equal(prodFabricacion.precio_referencia, 4500);
});
