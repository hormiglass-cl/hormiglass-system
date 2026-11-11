import type { OportunidadVenta } from './types';

// Keep in sync with the oportunidades_perdida_motivo_check constraint.
export const MOTIVOS_PERDIDA = [
  { value: 'precio', label: 'Precio' },
  { value: 'competencia', label: 'Eligió a la competencia' },
  { value: 'sin_respuesta', label: 'No respondió' },
  { value: 'proyecto_cancelado', label: 'Proyecto cancelado' },
  { value: 'otro', label: 'Otro' },
] as const;

export type MotivoPerdida = (typeof MOTIVOS_PERDIDA)[number]['value'];

/** Lost opportunities are closed without a sale; the database sets perdida_at. */
export function esOportunidadPerdida(op: Pick<OportunidadVenta, 'perdida_at'>): boolean {
  return Boolean(op.perdida_at);
}

/** Only an open opportunity that has not reached "Pago Validado" can be lost. */
export function puedeMarcarsePerdida(op: Pick<OportunidadVenta, 'estado_pipeline' | 'perdida_at'>): boolean {
  return op.estado_pipeline === 'nueva' && !esOportunidadPerdida(op);
}

/** A rejected quote never closes the opportunity; it only suggests it when it is the current quote. */
export function sugerirPerdidaPorRechazo(
  op: Pick<OportunidadVenta, 'estado_pipeline' | 'perdida_at' | 'cotizacion_actual_id'>,
  cotizacion: { id: string; estado: string },
): boolean {
  return cotizacion.estado === 'rechazada' &&
    Boolean(op.cotizacion_actual_id) &&
    op.cotizacion_actual_id === cotizacion.id &&
    puedeMarcarsePerdida(op);
}

export function motivoPerdidaLabel(motivo?: string | null): string {
  if (!motivo) return '';
  return MOTIVOS_PERDIDA.find((m) => m.value === motivo)?.label ?? motivo;
}
