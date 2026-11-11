import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MOTIVOS_PERDIDA,
  esOportunidadPerdida,
  motivoPerdidaLabel,
  puedeMarcarsePerdida,
  sugerirPerdidaPorRechazo,
} from '../lib/oportunidad-perdida.ts';

test('an opportunity is lost only when perdida_at is set', () => {
  assert.equal(esOportunidadPerdida({ perdida_at: '2026-11-11T12:00:00Z' }), true);
  assert.equal(esOportunidadPerdida({ perdida_at: null }), false);
  assert.equal(esOportunidadPerdida({}), false);
});

test('only an open opportunity in stage nueva can be marked lost', () => {
  assert.equal(puedeMarcarsePerdida({ estado_pipeline: 'nueva', perdida_at: null }), true);
  assert.equal(puedeMarcarsePerdida({ estado_pipeline: 'pagada', perdida_at: null }), false);
  assert.equal(puedeMarcarsePerdida({ estado_pipeline: 'entregada' }), false);
  assert.equal(puedeMarcarsePerdida({ estado_pipeline: 'nueva', perdida_at: '2026-11-11T12:00:00Z' }), false);
});

test('a rejected quote suggests marking lost only when it is the current quote', () => {
  const op = { estado_pipeline: 'nueva', perdida_at: null, cotizacion_actual_id: 'cot-2' };
  assert.equal(sugerirPerdidaPorRechazo(op, { id: 'cot-2', estado: 'rechazada' }), true);
  assert.equal(sugerirPerdidaPorRechazo(op, { id: 'cot-1', estado: 'rechazada' }), false);
  assert.equal(sugerirPerdidaPorRechazo(op, { id: 'cot-2', estado: 'enviada' }), false);
  assert.equal(sugerirPerdidaPorRechazo({ ...op, estado_pipeline: 'pagada' }, { id: 'cot-2', estado: 'rechazada' }), false);
  assert.equal(sugerirPerdidaPorRechazo({ ...op, cotizacion_actual_id: null }, { id: 'cot-2', estado: 'rechazada' }), false);
});

test('reasons match the database constraint and have labels', () => {
  assert.deepEqual(MOTIVOS_PERDIDA.map((m) => m.value), ['precio', 'competencia', 'sin_respuesta', 'proyecto_cancelado', 'otro']);
  assert.equal(motivoPerdidaLabel('competencia'), 'Eligió a la competencia');
  assert.equal(motivoPerdidaLabel(null), '');
  assert.equal(motivoPerdidaLabel('desconocido'), 'desconocido');
});
