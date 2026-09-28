import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReportConfig, reportSeries, reportTotals } from '../lib/reportes.ts';

const rows = [
  { tipo: 'ingreso', monto: 100000, fecha: '2026-09-01T12:00:00Z', categoria: 'Venta' },
  { tipo: 'ingreso', monto: 20000, fecha: '2026-09-01T14:00:00Z', categoria: 'Abono' },
  { tipo: 'egreso', monto: 35000, fecha: '2026-09-02T12:00:00Z', categoria: 'Flete' },
];

test('calcula ingresos, egresos y saldo solo desde movimientos de caja', () => {
  assert.deepEqual(reportTotals(rows), { ingresos: 120000, egresos: 35000, neto: 85000, tasaSaldo: 85000 / 120000 });
  assert.equal(reportTotals([{ tipo: 'egreso', monto: 100 }]).tasaSaldo, null);
});

test('agrupa sin mezclar ingresos y egresos', () => {
  assert.deepEqual(reportSeries(rows, 'periodo'), [
    { label: '2026-09-01', ingresos: 120000, egresos: 0 },
    { label: '2026-09-02', ingresos: 0, egresos: 35000 },
  ]);
  assert.equal(reportSeries(rows, 'categoria').find((row) => row.label === 'Flete').egresos, 35000);
  assert.equal(reportSeries([{ tipo: 'ingreso', monto: 1, fecha: '2026-09-02T02:00:00Z', categoria: 'Venta' }], 'periodo')[0].label, '2026-09-01');
});

test('rechaza una vista guardada inválida', () => {
  assert.equal(parseReportConfig({ tab: 'flujo', desde: '', hasta: '', categoria: 'todas', agrupacion: 'periodo' })?.tab, 'flujo');
  assert.equal(parseReportConfig({ tab: 'ajeno', desde: '', hasta: '', categoria: 'todas', agrupacion: 'periodo' }), null);
});
