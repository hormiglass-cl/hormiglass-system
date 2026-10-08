import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { parseProductosCsv, parseProductosExcel } from '../lib/productos-csv.ts';

test('previsualiza CSV válido y detecta códigos repetidos antes de importar', () => {
  const csv = 'codigo;nombre;categoria;unidad;precio_referencia;costo_referencia;descripcion;activo\n' +
    'HG-1;Panel;producto;m2;12000;8000;Panel demo;si\n' +
    'HG-1;Panel repetido;producto;m2;12000;8000;;si\n';
  const result = parseProductosCsv(csv);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].codigo, 'HG-1');
  assert.match(result.errors[0], /repetido/);
});

test('rechaza costos negativos y nombres vacíos', () => {
  const result = parseProductosCsv('codigo,nombre,categoria,unidad,precio_referencia,costo_referencia\nA,,producto,unidad,1,-2');
  assert.equal(result.rows.length, 0);
  assert.equal(result.errors.length, 1);
});

test('parses Excel Maestro con 340 productos y mapea atributos técnicos y comerciales', () => {
  const filePath = path.resolve('local/ajustes/octubre/Maestro_Productos_Hormiglass_Proveedores.xlsx');
  if (!fs.existsSync(filePath)) return;

  const buf = fs.readFileSync(filePath);
  const proveedoresMap = {
    'BOTTAI': 'prov-bottai-id',
    'ATRIO': 'prov-atrio-id',
    'MACBAL': 'prov-macbal-id'
  };

  const { rows, errors } = parseProductosExcel(buf, proveedoresMap);
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 340);

  // Verificar Bottai con requiere_revision
  const bottai = rows.find((r) => r.codigo.startsWith('BOT-'));
  assert.ok(bottai);
  assert.equal(bottai.requiere_revision, true);
  assert.equal(bottai.proveedor_id, 'prov-bottai-id');
  assert.equal(bottai.origen, 'reventa');

  // Verificar Hormiglass de fabricación propia
  const hg = rows.find((r) => r.codigo.startsWith('HG-'));
  assert.ok(hg);
  assert.equal(hg.origen, 'fabricacion_propia');
  assert.equal(hg.requiere_revision, false);

  // Verificar que no hay nombres vacíos ni códigos vacíos
  for (const r of rows) {
    assert.ok(r.codigo && r.codigo.length > 0);
    assert.ok(r.nombre && r.nombre.length > 0);
  }
});
