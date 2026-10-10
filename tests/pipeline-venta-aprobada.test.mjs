import assert from 'node:assert/strict';
import test from 'node:test';

// Import helpers / logic to verify
import { esRutaReventa } from '../lib/pipeline-ruta.ts';

// Stage index logic used in pipeline & detail page
const PIPELINE_STAGES = [
  { id: 'nueva', label: 'Nueva' },
  { id: 'cotizacion', label: 'Cotización' },
  { id: 'pagada', label: 'Abono / Pago' },
  { id: 'aprobada', label: 'Venta Aprobada' },
  { id: 'operacion', label: 'Abastecimiento' },
  { id: 'entregada', label: 'Cierre / Entrega' },
];

function getStageIndex(estado) {
  if (estado === 'nueva') return 0;
  if (estado === 'pagada') return 2;
  if (estado === 'entregada') return 3;
  if (estado.startsWith('prod_') || estado.startsWith('rev_') || estado === 'programada') {
    if (estado === 'prod_finalizado' || estado === 'rev_entregado') return 5;
    return 4;
  }
  return 1;
}

// Validation rule from validar_cierre_venta trigger
function requiereAcreditacionEntrega(targetState) {
  return ['prod_finalizado', 'rev_entregado'].includes(targetState);
}

// Indicator helper from ventas page
function isUnaccreditedClose(op, deliveryAccreditation = {}) {
  return (
    ['prod_finalizado', 'rev_entregado'].includes(op.estado_pipeline) &&
    deliveryAccreditation[op.id] !== true
  );
}

test('Fase 3: entregada representa Venta Aprobada y NO exige acreditación documental previa', () => {
  // 'entregada' (Venta Aprobada) no debe exigir entrega física acreditada
  assert.equal(
    requiereAcreditacionEntrega('entregada'),
    false,
    'El estado entregada (Venta Aprobada) NO debe requerir entrega acreditada'
  );

  // Solo los cierres reales de entrega la exigen
  assert.equal(
    requiereAcreditacionEntrega('prod_finalizado'),
    true,
    'prod_finalizado debe exigir acreditación de entrega'
  );
  assert.equal(
    requiereAcreditacionEntrega('rev_entregado'),
    true,
    'rev_entregado debe exigir acreditación de entrega'
  );
});

test('Fase 3: oportunidad en Venta Aprobada no se marca como cierre sin acreditar', () => {
  const opAprobada = {
    id: 'op-1',
    codigo: 'NV-2026-001',
    estado_pipeline: 'entregada',
  };

  // Sin acreditar ninguna entrega todavía
  const accreditationMap = { 'op-1': false };

  assert.equal(
    isUnaccreditedClose(opAprobada, accreditationMap),
    false,
    'Una venta aprobada en espera de fabricación NO debe mostrar advertencia de entrega sin acreditar'
  );

  const opProduccionFinalizada = {
    id: 'op-2',
    codigo: 'NV-2026-002',
    estado_pipeline: 'prod_finalizado',
  };
  assert.equal(
    isUnaccreditedClose(opProduccionFinalizada, accreditationMap),
    true,
    'Una orden finalizada sin respaldo sí debe advertir falta de acreditación'
  );
});

test('Fase 3: progresión lógica del ciclo de vida ubica Venta Aprobada antes de fabricación', () => {
  // 0: Nueva
  assert.equal(getStageIndex('nueva'), 0);
  // 2: Pago validado
  assert.equal(getStageIndex('pagada'), 2);
  // 3: Venta Aprobada (entregada)
  assert.equal(getStageIndex('entregada'), 3);
  // 4: En fabricación / programación
  assert.equal(getStageIndex('prod_fabricacion'), 4);
  assert.equal(getStageIndex('rev_coordinacion'), 4);
  // 5: Cierre / Entrega final
  assert.equal(getStageIndex('prod_finalizado'), 5);
  assert.equal(getStageIndex('rev_entregado'), 5);

  assert.equal(PIPELINE_STAGES[3].label, 'Venta Aprobada');
});

test('Fase 3: ventas aprobadas se derivan a la ruta operativa correspondiente', () => {
  assert.equal(
    esRutaReventa({ estado_pipeline: 'entregada', tipo_venta: 'Suministro' }),
    true
  );
  assert.equal(
    esRutaReventa({ estado_pipeline: 'entregada', tipo_venta: 'Instalación' }),
    false
  );
  assert.equal(
    esRutaReventa({ estado_pipeline: 'entregada', rama_destino: 'produccion' }),
    false
  );
  assert.equal(
    esRutaReventa({ estado_pipeline: 'entregada', rama_destino: 'reventa' }),
    true
  );
});
