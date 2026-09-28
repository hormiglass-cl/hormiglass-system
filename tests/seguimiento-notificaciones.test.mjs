import assert from 'node:assert/strict';
import test from 'node:test';
import { seguimientosParaUsuario } from '../lib/seguimiento-notificaciones.ts';

test('alerta al responsable correcto sobre próximas acciones y vencidas', () => {
  const now = new Date('2026-09-28T12:00:00Z');
  const base = { asignado_a: 'vendedora-a', seguimiento_responsable_id: 'vendedora-b',
    proxima_accion_fecha: '2026-09-29T08:00:00Z', estado_pipeline: 'nueva' };
  const oportunidades = [
    { ...base, id: 'proxima' },
    { ...base, id: 'vencida', proxima_accion_fecha: '2026-09-27T08:00:00Z' },
    { ...base, id: 'lejana', proxima_accion_fecha: '2026-09-30T08:00:00Z' },
    { ...base, id: 'cerrada', estado_pipeline: 'entregada' },
    { ...base, id: 'sin-responsable', seguimiento_responsable_id: null },
  ];
  assert.deepEqual(seguimientosParaUsuario(oportunidades, 'vendedora-b', now).map((op) => op.id), ['proxima', 'vencida']);
  assert.deepEqual(seguimientosParaUsuario(oportunidades, 'vendedora-a', now).map((op) => op.id), ['sin-responsable']);
});
