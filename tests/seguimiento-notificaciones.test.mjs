import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

// lib/ uses extensionless relative imports (bundler resolution); resolve them to .ts for node:test.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL?.includes('/lib/')) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
const { seguimientosParaUsuario } = await import('../lib/seguimiento-notificaciones.ts');

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

test('una oportunidad perdida no genera avisos de seguimiento', () => {
  const now = new Date('2026-09-28T12:00:00Z');
  const base = { asignado_a: 'vendedora-a', seguimiento_responsable_id: 'vendedora-a',
    proxima_accion_fecha: '2026-09-27T08:00:00Z', estado_pipeline: 'nueva', perdida_at: null };
  const oportunidades = [
    { ...base, id: 'activa' },
    { ...base, id: 'perdida', perdida_at: '2026-09-27T10:00:00Z' },
  ];
  assert.deepEqual(seguimientosParaUsuario(oportunidades, 'vendedora-a', now).map((op) => op.id), ['activa']);
});
