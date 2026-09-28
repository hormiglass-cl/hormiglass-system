import type { OportunidadVenta } from './types';

type OportunidadConRuta = Pick<OportunidadVenta, 'rama_destino' | 'estado_pipeline' | 'tipo_venta'>;

export function esRutaReventa(oportunidad: OportunidadConRuta): boolean {
  if (oportunidad.rama_destino) return oportunidad.rama_destino === 'reventa';
  if (oportunidad.estado_pipeline?.startsWith('rev_')) return true;
  if (oportunidad.estado_pipeline?.startsWith('prod_')) return false;
  return oportunidad.tipo_venta === 'Suministro' || oportunidad.tipo_venta === 'Reventa de Material';
}
