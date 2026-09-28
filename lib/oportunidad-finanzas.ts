import type { Cotizacion, OportunidadVenta } from './types';

const estadoVigente = new Set(['enviada', 'aprobada']);

export function cotizacionVigente(
  oportunidad: OportunidadVenta,
  cotizaciones: Cotizacion[],
): Cotizacion | undefined {
  const vinculadas = cotizaciones.filter((cot) => cot.oportunidad_id === oportunidad.id);
  const canonica = vinculadas.find((cot) =>
    cot.id === oportunidad.cotizacion_actual_id && estadoVigente.has(cot.estado)
  );
  if (canonica) return canonica;
  // La última versión en borrador o rechazada no reemplaza el monto vigente.
  return vinculadas.filter((cot) => estadoVigente.has(cot.estado)).sort((a, b) =>
    (b.version || 1) - (a.version || 1) ||
    (b.created_at || '').localeCompare(a.created_at || '') ||
    b.id.localeCompare(a.id)
  )[0];
}

export function totalComercial(op: OportunidadVenta, cotizaciones: Cotizacion[]): number {
  const actual = cotizacionVigente(op, cotizaciones);
  return actual && estadoVigente.has(actual.estado) ? Math.round(Number(actual.monto_total) || 0) : 0;
}

export function totalAbonado(op: OportunidadVenta): number {
  // La columna incluye abonos históricos cuyos respaldos no guardaban un monto.
  if (op.monto_abonado != null && Number.isFinite(Number(op.monto_abonado))) {
    return Math.round(Number(op.monto_abonado));
  }
  return Math.round((op.comprobantes_pago || []).reduce((sum, pago) => sum + (Number(pago.monto) || 0), 0));
}

export function saldoPendiente(op: OportunidadVenta, cotizaciones: Cotizacion[]): number {
  return Math.max(0, totalComercial(op, cotizaciones) - totalAbonado(op));
}
