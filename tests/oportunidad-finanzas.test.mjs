import assert from 'node:assert/strict';
import test from 'node:test';
import { cotizacionVigente, saldoPendiente, totalAbonado, totalComercial } from '../lib/oportunidad-finanzas.ts';

const oportunidad = {
  id: 'op-1',
  comprobantes_pago: [{ monto: 15000 }, { monto: 5000 }],
  monto_abonado: 20000,
};
const cotizaciones = [
  { id: 'v1', oportunidad_id: 'op-1', version: 1, estado: 'aprobada', monto_total: 100000 },
  { id: 'v2', oportunidad_id: 'op-1', version: 2, estado: 'enviada', monto_total: 120000 },
  { id: 'otra', oportunidad_id: 'op-2', version: 9, estado: 'aprobada', monto_total: 900000 },
];

test('usa solo la última versión vinculada para el valor y saldo', () => {
  assert.equal(cotizacionVigente(oportunidad, cotizaciones)?.id, 'v2');
  assert.equal(totalComercial(oportunidad, cotizaciones), 120000);
  assert.equal(totalAbonado(oportunidad), 20000);
  assert.equal(saldoPendiente(oportunidad, cotizaciones), 100000);
});

test('una versión nueva en borrador conserva el monto vigente anterior', () => {
  const nueva = { id: 'v3', oportunidad_id: 'op-1', version: 3, estado: 'borrador', monto_total: 140000 };
  assert.equal(cotizacionVigente(oportunidad, [...cotizaciones, nueva])?.id, 'v2');
  assert.equal(totalComercial(oportunidad, [...cotizaciones, nueva]), 120000);
  assert.equal(saldoPendiente(oportunidad, [...cotizaciones, nueva]), 100000);
});

test('al rechazar la versión vigente se recupera la última enviada o aprobada', () => {
  const rechazadas = cotizaciones.map((cot) => cot.id === 'v2' ? { ...cot, estado: 'declinada' } : cot);
  assert.equal(cotizacionVigente({ ...oportunidad, cotizacion_actual_id: 'v2' }, rechazadas)?.id, 'v1');
  assert.equal(totalComercial(oportunidad, rechazadas), 100000);
});

test('editar una versión histórica no cambia el total', () => {
  const historicaEditada = cotizaciones.map((cot) => cot.id === 'v1' ? { ...cot, monto_total: 500000 } : cot);
  assert.equal(totalComercial(oportunidad, historicaEditada), 120000);
});

test('respeta la cotización canónica cuando existe una versión posterior no seleccionada', () => {
  const op = { ...oportunidad, cotizacion_actual_id: 'v1' };
  assert.equal(cotizacionVigente(op, cotizaciones)?.id, 'v1');
  assert.equal(totalComercial(op, cotizaciones), 100000);
});

test('redondea una sola vez al calcular montos CLP', () => {
  const op = { ...oportunidad, monto_abonado: undefined, comprobantes_pago: [{ monto: 10.4 }, { monto: 10.4 }] };
  const quotes = [{ ...cotizaciones[1], monto_total: 100.6 }];
  assert.equal(totalComercial(op, quotes), 101);
  assert.equal(totalAbonado(op), 21);
  assert.equal(saldoPendiente(op, quotes), 80);
});

test('conserva abonos históricos sin monto en el JSON de comprobantes', () => {
  const op = { ...oportunidad, comprobantes_pago: [{ comprobante_url: 'legacy.pdf' }], monto_abonado: 1160250 };
  assert.equal(totalAbonado(op), 1160250);
});
