import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProductosCsv } from '../lib/productos-csv.ts';

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
