import type { EventoProduccionLogistica } from './types';

export function claveVehiculo(value?: string | null): string {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function eventosEnConflicto(
  objetivo: EventoProduccionLogistica,
  eventos: EventoProduccionLogistica[],
): EventoProduccionLogistica[] {
  const start = new Date(objetivo.fecha_inicio).getTime();
  const end = new Date(objetivo.fecha_fin).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  return eventos.filter((otro) => {
    if (otro.id === objetivo.id || ['completado', 'no_realizado'].includes(otro.estado)) return false;
    const samePerson = Boolean(objetivo.responsable_id && objetivo.responsable_id === otro.responsable_id);
    const sameVehicle = Boolean(claveVehiculo(objetivo.recurso_vehiculo) &&
      claveVehiculo(objetivo.recurso_vehiculo) === claveVehiculo(otro.recurso_vehiculo));
    if (!samePerson && !sameVehicle) return false;
    return start < new Date(otro.fecha_fin).getTime() && new Date(otro.fecha_inicio).getTime() < end;
  });
}

/** La producción pendiente debe terminar antes del despacho o instalación. */
export function produccionesPendientesAntesDe(
  objetivo: EventoProduccionLogistica,
  eventos: EventoProduccionLogistica[],
): EventoProduccionLogistica[] {
  if (!['despacho_cliente', 'instalacion'].includes(objetivo.tipo_evento)) return [];
  const inicio = new Date(objetivo.fecha_inicio).getTime();
  if (!Number.isFinite(inicio)) return [];
  return eventos.filter((evento) => evento.id !== objetivo.id &&
    evento.oportunidad_id === objetivo.oportunidad_id &&
    evento.tipo_evento === 'produccion' &&
    !['completado', 'no_realizado'].includes(evento.estado) &&
    new Date(evento.fecha_fin).getTime() > inicio);
}
