import type { GrupoInsumoCaja } from './types';

export const MEDIOS_PAGO = [
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'debito', label: 'Débito' },
  { id: 'credito', label: 'Crédito' },
  { id: 'flow', label: 'Flow' },
  { id: 'getnet', label: 'Getnet' },
  { id: 'cheque', label: 'Cheque' },
  { id: 'vale_vista', label: 'Vale vista' },
  { id: 'link_pago', label: 'Link de pago' },
] as const;

export type MedioPagoCaja = (typeof MEDIOS_PAGO)[number]['id'];

export const TIPOS_DOCUMENTO_CAJA = [
  { id: 'factura', label: 'Factura' },
  { id: 'factura_exenta', label: 'Factura exenta' },
  { id: 'boleta_exenta', label: 'Boleta exenta' },
  { id: 'boleta_honorarios', label: 'Boleta de honorarios' },
  { id: 'comprobante', label: 'Comprobante' },
  { id: 'nota_venta', label: 'Nota de venta' },
  { id: 'orden_compra', label: 'Orden de compra' },
  { id: 'liquidacion_sueldo', label: 'Liquidación de sueldo' },
  { id: 'formulario', label: 'Formulario' },
  { id: 'contrato_cuota', label: 'Contrato / Cuota' },
  { id: 'no_aplica', label: 'No aplica' },
] as const;

export type TipoDocumentoCaja = (typeof TIPOS_DOCUMENTO_CAJA)[number]['id'];

export const GRUPOS_INSUMO_CAJA: Record<GrupoInsumoCaja, { label: string }> = {
  materia_prima: { label: 'Materia prima' },
  combustible: { label: 'Combustible' },
  otro: { label: 'Otro insumo' },
};

const MEDIO_MAP = new Map<string, string>(MEDIOS_PAGO.map((m) => [m.id, m.label]));
const DOC_MAP = new Map<string, string>(TIPOS_DOCUMENTO_CAJA.map((d) => [d.id, d.label]));

export function labelMedioPago(value?: string | null): string {
  if (!value) return '—';
  return MEDIO_MAP.get(value) || value;
}

export function labelTipoDocumento(value?: string | null): string {
  if (!value) return '—';
  return DOC_MAP.get(value) || value;
}
