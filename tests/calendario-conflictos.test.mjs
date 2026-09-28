import assert from 'node:assert/strict';
import test from 'node:test';
import { eventosEnConflicto, produccionesPendientesAntesDe } from '../lib/calendario-conflictos.ts';

const base = {
  id: 'a', fecha_inicio: '2026-09-16T12:00:00Z', fecha_fin: '2026-09-16T14:00:00Z',
  responsable_id: 'persona-1', recurso_vehiculo: 'Camión 1', estado: 'por_hacer',
};

test('detecta superposición de persona o vehículo entre calendarios', () => {
  const eventos = [
    { ...base, id: 'b', contexto: 'reventa_logistica', fecha_inicio: '2026-09-16T13:00:00Z', fecha_fin: '2026-09-16T15:00:00Z', responsable_id: 'persona-2' },
    { ...base, id: 'c', fecha_inicio: '2026-09-16T14:00:00Z', fecha_fin: '2026-09-16T15:00:00Z' },
    { ...base, id: 'd', fecha_inicio: '2026-09-16T13:00:00Z', fecha_fin: '2026-09-16T15:00:00Z', estado: 'completado' },
  ];
  assert.deepEqual(eventosEnConflicto(base, eventos).map((event) => event.id), ['b']);
});

test('reconoce el mismo vehículo con espacios, guiones y mayúsculas diferentes', () => {
  const otro = { ...base, id: 'b', responsable_id: 'persona-2', recurso_vehiculo: 'CAMION-1' };
  assert.deepEqual(eventosEnConflicto(base, [otro]).map((item) => item.id), ['b']);
});

test('avisa despacho anterior al fin de producción pendiente, pero no producción completada', () => {
  const despacho = { ...base, id: 'despacho', oportunidad_id: 'venta-1', tipo_evento: 'despacho_cliente',
    fecha_inicio: '2026-09-16T12:00:00Z' };
  const produccion = { ...base, id: 'produccion', oportunidad_id: 'venta-1', tipo_evento: 'produccion',
    fecha_fin: '2026-09-16T14:00:00Z' };
  assert.deepEqual(produccionesPendientesAntesDe(despacho, [produccion]).map((event) => event.id), ['produccion']);
  assert.deepEqual(produccionesPendientesAntesDe(despacho, [{ ...produccion, estado: 'completado' }]), []);
  assert.deepEqual(produccionesPendientesAntesDe({ ...despacho, tipo_evento: 'retiro_proveedor' }, [produccion]), []);
});
