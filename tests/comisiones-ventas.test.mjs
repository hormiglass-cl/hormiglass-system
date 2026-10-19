import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Función pura que emula el trigger trg_actualizar_estado_comision_trigger de PostgreSQL
function calcularEstadoComision({ estado_pipeline, monto_estimado, monto_abonado, comision_porcentaje, comision_estado_actual }) {
  const porcentaje = Number(comision_porcentaje ?? 3.00);
  const monto = Math.round(Number(monto_estimado || 0) * (porcentaje / 100.0));
  const abonado = Number(monto_abonado || 0);
  const total = Number(monto_estimado || 0);

  const esFinalizado = ['entregada', 'prod_finalizado', 'rev_entregado'].includes(estado_pipeline);

  let nuevoEstado = comision_estado_actual || 'pendiente';

  // Si ya estaba pagada, sólo retrocede a pendiente si el abono se redujo por debajo del total
  if (nuevoEstado === 'pagada') {
    if (abonado < total) {
      nuevoEstado = 'pendiente';
    }
  } else {
    // Si la venta está cerrada/entregada y 100% abonada, califica a lista_para_pago
    if (esFinalizado && total > 0 && abonado >= total) {
      nuevoEstado = 'lista_para_pago';
    } else {
      nuevoEstado = 'pendiente';
    }
  }

  return {
    porcentaje,
    monto,
    estado: nuevoEstado,
  };
}

test('Fase 3: cálculo de monto de comisión con porcentaje estándar del 3%', () => {
  const resultado = calcularEstadoComision({
    estado_pipeline: 'en_negociacion',
    monto_estimado: 10000000,
    monto_abonado: 5000000,
    comision_porcentaje: 3.0,
    comision_estado_actual: 'pendiente',
  });

  assert.equal(resultado.porcentaje, 3.0);
  assert.equal(resultado.monto, 300000);
  assert.equal(resultado.estado, 'pendiente');
});

test('Fase 3: comisión pasa a lista_para_pago únicamente si está entregada y 100% pagada', () => {
  // Caso 1: Pagada 100% pero aún en producción -> sigue pendiente
  const casoEnProduccion = calcularEstadoComision({
    estado_pipeline: 'en_produccion',
    monto_estimado: 5000000,
    monto_abonado: 5000000,
    comision_porcentaje: 3.0,
    comision_estado_actual: 'pendiente',
  });
  assert.equal(casoEnProduccion.estado, 'pendiente');

  // Caso 2: Entregada pero sólo 50% abonada -> sigue pendiente
  const casoIncompleto = calcularEstadoComision({
    estado_pipeline: 'entregada',
    monto_estimado: 5000000,
    monto_abonado: 2500000,
    comision_porcentaje: 3.0,
    comision_estado_actual: 'pendiente',
  });
  assert.equal(casoIncompleto.estado, 'pendiente');

  // Caso 3: Entregada y 100% abonada -> pasa a lista_para_pago
  const casoListo = calcularEstadoComision({
    estado_pipeline: 'entregada',
    monto_estimado: 5000000,
    monto_abonado: 5000000,
    comision_porcentaje: 3.0,
    comision_estado_actual: 'pendiente',
  });
  assert.equal(casoListo.estado, 'lista_para_pago');
  assert.equal(casoListo.monto, 150000);

  // Caso 4: prod_finalizado y 100% abonado -> pasa a lista_para_pago
  const casoProdFinalizado = calcularEstadoComision({
    estado_pipeline: 'prod_finalizado',
    monto_estimado: 8000000,
    monto_abonado: 8000000,
    comision_porcentaje: 4.0,
    comision_estado_actual: 'pendiente',
  });
  assert.equal(casoProdFinalizado.estado, 'lista_para_pago');
  assert.equal(casoProdFinalizado.monto, 320000);
});

test('Fase 3: reversión de comisión a pendiente si se anula o disminuye el abono', () => {
  const casoRevertido = calcularEstadoComision({
    estado_pipeline: 'entregada',
    monto_estimado: 5000000,
    monto_abonado: 4000000, // disminuyó
    comision_porcentaje: 3.0,
    comision_estado_actual: 'pagada',
  });
  assert.equal(casoRevertido.estado, 'pendiente');
});

test('Fase 3: verificación de interfaces y UI de ventas para comisiones y roles', () => {
  const typesPath = path.resolve('lib/types.ts');
  const typesCode = fs.readFileSync(typesPath, 'utf8');

  assert.ok(typesCode.includes('comision_porcentaje?: number;'), 'lib/types.ts debe tener comision_porcentaje');
  assert.ok(typesCode.includes('comision_monto?: number;'), 'lib/types.ts debe tener comision_monto');
  assert.ok(typesCode.includes("comision_estado?: 'pendiente' | 'lista_para_pago' | 'pagada';"), 'lib/types.ts debe tener comision_estado con sus 3 estados');

  const ventaDetailPath = path.resolve('app/ventas/[id]/page.tsx');
  const ventaDetailCode = fs.readFileSync(ventaDetailPath, 'utf8');

  assert.ok(ventaDetailCode.includes('Comisión Comercial'), 'app/ventas/[id]/page.tsx debe mostrar panel de Comisión Comercial');
  assert.ok(ventaDetailCode.includes('marcar_comision_pagada'), 'app/ventas/[id]/page.tsx debe incluir llamada a RPC marcar_comision_pagada');
  assert.ok(ventaDetailCode.includes('Gestor de obra en patio'), 'app/ventas/[id]/page.tsx debe clarificar rol de Gestor de Obra');
  assert.ok(ventaDetailCode.includes('Edith Tapia'), 'app/ventas/[id]/page.tsx debe contemplar a Edith Tapia como gestora de obra');
  assert.ok(ventaDetailCode.includes('Liquidar y marcar pagada'), 'app/ventas/[id]/page.tsx debe tener botón de liquidar');
});
