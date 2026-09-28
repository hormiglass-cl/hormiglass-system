import assert from 'node:assert/strict';
import test from 'node:test';
import { esRutaReventa } from '../lib/pipeline-ruta.ts';

test('la rama explícita prevalece sobre el tipo de venta y el estado anterior', () => {
  assert.equal(esRutaReventa({ rama_destino: 'produccion', estado_pipeline: 'rev_stock', tipo_venta: 'Suministro' }), false);
  assert.equal(esRutaReventa({ rama_destino: 'reventa', estado_pipeline: 'prod_cola', tipo_venta: 'Instalación' }), true);
});

test('una oportunidad operativa sin rama permanece en su pipeline', () => {
  assert.equal(esRutaReventa({ estado_pipeline: 'rev_coordinacion', tipo_venta: 'Instalación' }), true);
  assert.equal(esRutaReventa({ estado_pipeline: 'prod_fabricacion', tipo_venta: 'Suministro' }), false);
});

test('las ventas cerradas heredadas se derivan por tipo de venta', () => {
  assert.equal(esRutaReventa({ estado_pipeline: 'entregada', tipo_venta: 'Suministro' }), true);
  assert.equal(esRutaReventa({ estado_pipeline: 'entregada', tipo_venta: 'Instalación' }), false);
});
