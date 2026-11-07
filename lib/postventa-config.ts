import type {
  CausaRaizPostventa,
  EstadoPostventa,
  ResolucionPostventa,
  TipoCostoPostventa,
  TipoEvidenciaPostventa,
  TipoProblemaPostventa,
} from './types';
import type { Tone } from '../components/ui/crm';

export const ESTADOS_MAP: Record<EstadoPostventa, { label: string; tone: Tone }> = {
  recibido: { label: 'Recibido', tone: 'neutral' },
  en_revision: { label: 'En revisión', tone: 'warning' },
  visita_programada: { label: 'Visita programada', tone: 'info' },
  reparacion_programada: { label: 'Reparación programada', tone: 'accent' },
  cerrado: { label: 'Cerrado', tone: 'success' },
  abierto: { label: 'Abierto', tone: 'neutral' },
  programado: { label: 'Programado', tone: 'info' },
  en_curso: { label: 'En curso', tone: 'warning' },
  resuelto: { label: 'Resuelto', tone: 'success' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
};

export const TIPOS_PROBLEMA: { value: TipoProblemaPostventa; label: string }[] = [
  { value: 'problema_instalacion', label: 'Problema de instalación' },
  { value: 'producto_defectuoso', label: 'Producto defectuoso' },
  { value: 'problema_fabricacion', label: 'Problema de fabricación' },
  { value: 'dano_transporte', label: 'Daño durante transporte' },
  { value: 'uso_incorrecto', label: 'Uso incorrecto del producto' },
  { value: 'movimiento_terreno', label: 'Movimiento / condiciones del terreno' },
  { value: 'trabajo_adicional', label: 'Trabajo adicional solicitado' },
  { value: 'dano_terceros', label: 'Daño causado por terceros' },
  { value: 'otro', label: 'Otro' },
];

export const ESTADOS_EDITABLES: { value: EstadoPostventa; label: string }[] = [
  { value: 'recibido', label: 'Recibido' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'visita_programada', label: 'Visita programada' },
  { value: 'reparacion_programada', label: 'Reparación programada' },
  { value: 'cerrado', label: 'Cerrado' },
];

export const TIPOS_COSTO: { value: TipoCostoPostventa; label: string }[] = [
  { value: 'materiales', label: 'Materiales' },
  { value: 'flete', label: 'Flete / Traslado' },
  { value: 'mano_obra', label: 'Mano de obra' },
  { value: 'reposicion', label: 'Reposición' },
  { value: 'otro', label: 'Otro' },
];

export const TIPOS_EVIDENCIA: { value: TipoEvidenciaPostventa; label: string }[] = [
  { value: 'antes', label: 'Foto antes del trabajo' },
  { value: 'durante', label: 'Foto durante reparación' },
  { value: 'despues', label: 'Foto después (trabajo finalizado)' },
  { value: 'conformidad', label: 'Acta / firma de conformidad' },
  { value: 'diagnostico', label: 'Informe de diagnóstico' },
];

export const CAUSAS_RAIZ: CausaRaizPostventa[] = [
  'Fabricacion',
  'Instalacion',
  'Despacho',
  'Terreno',
  'Cliente',
  'Proveedor',
  'Transportista',
  'Sin determinar',
];

export const RESOLUCIONES_MAP: Record<ResolucionPostventa, { label: string; desc: string }> = {
  garantia: { label: 'Garantía total', desc: 'Reparación o reposición sin costo para el cliente' },
  responsabilidad_parcial: { label: 'Responsabilidad parcial', desc: 'Acuerdo comercial compartido con el cliente' },
  no_garantia: { label: 'No corresponde garantía', desc: 'Generar cotización por costo de reparación' },
  transportista: { label: 'Transportista externo', desc: 'Derivar cobro o responsabilidad al transportista' },
  en_evaluacion: { label: 'En evaluación', desc: 'Pendiente de diagnóstico técnico definitivo' },
};

export type ColumnaPostventa = 'recibido' | 'en_revision' | 'visita_programada' | 'reparacion_programada' | 'cerrado';

/** Columna del tablero a la que pertenece un estado (incluye estados heredados). */
export function columnaDe(estado: EstadoPostventa): ColumnaPostventa | null {
  if (['recibido', 'abierto'].includes(estado)) return 'recibido';
  if (['en_revision', 'en_curso'].includes(estado)) return 'en_revision';
  if (['visita_programada', 'programado'].includes(estado)) return 'visita_programada';
  if (estado === 'reparacion_programada') return 'reparacion_programada';
  if (['cerrado', 'resuelto'].includes(estado)) return 'cerrado';
  return null;
}

/** Valor del filtro "Estado" que agrupa todas las etapas no cerradas. */
export const ESTADOS_EN_CURSO = 'recibido|en_revision|visita_programada|reparacion_programada';
