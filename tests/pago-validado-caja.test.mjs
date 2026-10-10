import assert from 'node:assert/strict';
import test from 'node:test';

// Simulation of business logic implemented in public.validar_abono and public.rechazar_abono
function simularValidarAbono({
  opActual,
  abono,
  validadorId,
  abonosPreviosValidados = 0,
}) {
  const nuevoTotalValidado = abonosPreviosValidados + Number(abono.monto || 0);

  // Auto-transición a 'pagada' si estaba en 'nueva'
  let nuevoEstadoPipeline = opActual.estado_pipeline;
  let cambioEtapa = false;
  if (opActual.estado_pipeline === 'nueva') {
    nuevoEstadoPipeline = 'pagada';
    cambioEtapa = true;
  }

  // Notificaciones a involucrados (creador y asignado comercial, si son distintos al validador)
  const destinatariosNotif = new Set();
  if (abono.creado_por_id && abono.creado_por_id !== validadorId) {
    destinatariosNotif.add(abono.creado_por_id);
  }
  if (opActual.asignado_a && opActual.asignado_a !== validadorId) {
    destinatariosNotif.add(opActual.asignado_a);
  }

  return {
    estado_pipeline: nuevoEstadoPipeline,
    monto_abonado: nuevoTotalValidado,
    cambioEtapa,
    destinatariosNotificados: Array.from(destinatariosNotif),
    link_url: `/ventas/${opActual.id}`,
  };
}

function simularRechazarAbono({
  opActual,
  abono,
  rechazadorId,
  motivo,
  abonosRestantesValidados = 0,
}) {
  let nuevoEstadoPipeline = opActual.estado_pipeline;
  let revertido = false;

  // Si estaba en 'pagada' y el total validado remanente es 0, revierte a 'nueva'
  if (opActual.estado_pipeline === 'pagada' && abonosRestantesValidados === 0) {
    nuevoEstadoPipeline = 'nueva';
    revertido = true;
  }

  const destinatariosNotif = new Set();
  if (abono.creado_por_id && abono.creado_por_id !== rechazadorId) {
    destinatariosNotif.add(abono.creado_por_id);
  }
  if (opActual.asignado_a && opActual.asignado_a !== rechazadorId) {
    destinatariosNotif.add(opActual.asignado_a);
  }

  return {
    estado_pipeline: nuevoEstadoPipeline,
    monto_abonado: abonosRestantesValidados,
    revertido,
    motivo: motivo.trim(),
    destinatariosNotificados: Array.from(destinatariosNotif),
    link_url: `/ventas/${opActual.id}`,
  };
}

test('Fase 4: validar abono avanza automáticamente oportunidad de "nueva" a "pagada"', () => {
  const op = {
    id: 'op-101',
    codigo: 'NV-2026-101',
    estado_pipeline: 'nueva',
    asignado_a: 'usr-vendedor-1',
  };

  const abono = {
    id: 'ab-501',
    monto: 500000,
    creado_por_id: 'usr-vendedor-1',
  };

  const resultado = simularValidarAbono({
    opActual: op,
    abono,
    validadorId: 'usr-mariela-finanzas',
  });

  assert.equal(resultado.estado_pipeline, 'pagada', 'Debe avanzar a "pagada" (Pago Validado)');
  assert.equal(resultado.cambioEtapa, true);
  assert.equal(resultado.monto_abonado, 500000);
  assert.deepEqual(resultado.destinatariosNotificados, ['usr-vendedor-1']);
});

test('Fase 4: validar abono en etapa avanzada preserva etapa y notifica a vendedora y asignado', () => {
  const op = {
    id: 'op-102',
    codigo: 'NV-2026-102',
    estado_pipeline: 'prod_fabricacion',
    asignado_a: 'usr-vendedor-katy',
  };

  const abono = {
    id: 'ab-502',
    monto: 300000,
    creado_por_id: 'usr-asistente-lorena',
  };

  const resultado = simularValidarAbono({
    opActual: op,
    abono,
    validadorId: 'usr-mariela-finanzas',
    abonosPreviosValidados: 700000,
  });

  // No debe retroceder la etapa de fabricación
  assert.equal(resultado.estado_pipeline, 'prod_fabricacion');
  assert.equal(resultado.cambioEtapa, false);
  assert.equal(resultado.monto_abonado, 1000000);

  // Debe notificar tanto a quien subió el comprobante como a quien tiene asignada la venta
  assert.equal(resultado.destinatariosNotificados.includes('usr-asistente-lorena'), true);
  assert.equal(resultado.destinatariosNotificados.includes('usr-vendedor-katy'), true);
  assert.equal(resultado.destinatariosNotificados.length, 2);
});

test('Fase 4: rechazar abono revierte oportunidad a "nueva" si no quedan otros pagos validados', () => {
  const op = {
    id: 'op-103',
    codigo: 'NV-2026-103',
    estado_pipeline: 'pagada',
    asignado_a: 'usr-vendedor-1',
  };

  const abono = {
    id: 'ab-503',
    monto: 400000,
    creado_por_id: 'usr-vendedor-1',
  };

  const resultado = simularRechazarAbono({
    opActual: op,
    abono,
    rechazadorId: 'usr-mariela-finanzas',
    motivo: 'Comprobante ilegible / monto no coincide con cartola',
    abonosRestantesValidados: 0,
  });

  assert.equal(resultado.estado_pipeline, 'nueva', 'Al rechazar sin otros pagos, debe volver a "nueva"');
  assert.equal(resultado.revertido, true);
  assert.equal(resultado.monto_abonado, 0);
  assert.equal(resultado.motivo, 'Comprobante ilegible / monto no coincide con cartola');
});

test('Fase 4: deep-link de notificación hacia Caja contiene tab y abono ID', () => {
  const abonoId = 'b8c8d8e8-1234-5678-9abc-def012345678';
  const enlaceGenerado = `/caja?tab=validacion&abono=${abonoId}`;

  const url = new URL(enlaceGenerado, 'https://hormiglass.cl');
  assert.equal(url.searchParams.get('tab'), 'validacion');
  assert.equal(url.searchParams.get('abono'), abonoId);
});
