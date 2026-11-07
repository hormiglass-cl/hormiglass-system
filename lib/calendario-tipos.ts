import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Container,
  Factory,
  HardHat,
  MapPin,
  RotateCcw,
  ShoppingCart,
  Truck,
  XCircle,
} from 'lucide-react';
import type { ElementType } from 'react';
import type { Tone } from '../components/ui/crm';
import type { TipoEventoProduccionLogistica } from './types';

export type CalendarioKind = 'terreno' | 'produccion' | 'reventa' | 'orden';

export interface CalendarioKindConfig {
  label: string;
  /** Nombre corto para la pestaña y el selector. */
  short: string;
  icon: ElementType;
  /** Evento en la grilla (fondo suave + borde + texto). */
  chip: string;
  /** Punto o barra de color sólido. */
  solid: string;
  /** Fondo del botón de selección activo. */
  active: string;
}

// Clases escritas completas para que Tailwind las detecte.
export const CALENDARIO_KINDS: Record<CalendarioKind, CalendarioKindConfig> = {
  terreno: {
    label: 'Visitas a terreno',
    short: 'Terreno',
    icon: MapPin,
    chip: 'border-success-line bg-success-soft text-success hover:bg-success-soft/70',
    solid: 'bg-success',
    active: 'border-success-line bg-success-soft text-success',
  },
  produccion: {
    label: 'Producción y logística',
    short: 'Producción',
    icon: Factory,
    chip: 'border-accent-line bg-accent-soft text-accent-ink hover:bg-accent-soft/70',
    solid: 'bg-accent',
    active: 'border-accent-line bg-accent-soft text-accent-ink',
  },
  reventa: {
    label: 'Reventa y logística',
    short: 'Reventa',
    icon: Container,
    chip: 'border-info-line bg-info-soft text-info hover:bg-info-soft/70',
    solid: 'bg-info',
    active: 'border-info-line bg-info-soft text-info',
  },
  orden: {
    label: 'Órdenes de producción',
    short: 'Órdenes de producción',
    icon: HardHat,
    chip: 'border-violet-line bg-violet-soft text-violet hover:bg-violet-soft/70',
    solid: 'bg-violet',
    active: 'border-violet-line bg-violet-soft text-violet',
  },
};

export const KIND_ORDER: CalendarioKind[] = ['terreno', 'produccion', 'reventa', 'orden'];

export const ESTADO_LABELS: Record<string, string> = {
  por_hacer: 'Por hacer',
  en_curso: 'En curso',
  reprogramado: 'Reprogramado',
  completado: 'Completado',
  no_realizado: 'No realizado',
  programada: 'Programada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  planificada: 'Planificada',
  completada: 'Completada',
};

export const ESTADOS_EVENTO_CONFIG: Record<string, { label: string; tone: Tone; icon: ElementType }> = {
  por_hacer: { label: 'Por hacer', tone: 'info', icon: Clock },
  en_curso: { label: 'En curso', tone: 'accent', icon: RotateCcw },
  reprogramado: { label: 'Reprogramado', tone: 'warning', icon: AlertTriangle },
  completado: { label: 'Completado', tone: 'success', icon: CheckCircle2 },
  no_realizado: { label: 'No realizado', tone: 'danger', icon: XCircle },
};

export const TIPOS_EVENTO_CONFIG: Record<
  TipoEventoProduccionLogistica,
  { label: string; icon: ElementType; tone: Tone }
> = {
  obra: { label: 'Obra / Instalación', icon: HardHat, tone: 'accent' },
  produccion: { label: 'Fabricación Planta', icon: Factory, tone: 'info' },
  reventa: { label: 'Reventa / Coordinación', icon: ShoppingCart, tone: 'info' },
  logistica: { label: 'Despacho & Logística', icon: Truck, tone: 'success' },
  retiro_proveedor: { label: 'Retiro de proveedor', icon: Truck, tone: 'warning' },
  despacho_cliente: { label: 'Despacho a cliente', icon: Truck, tone: 'success' },
  instalacion: { label: 'Instalación', icon: HardHat, tone: 'accent' },
  postventa: { label: 'Postventa', icon: HardHat, tone: 'danger' },
  logistica_interna: { label: 'Logística interna', icon: Truck, tone: 'neutral' },
};

/** Etiqueta del "tipo" para el filtro común a todos los calendarios. */
export const TIPO_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(TIPOS_EVENTO_CONFIG).map(([k, v]) => [k, v.label])),
  visita: 'Visita a terreno',
  orden: 'Orden de producción',
};

export interface VisitaRow {
  id: string;
  fecha_visita_terreno: string | null;
  hora_visita_terreno: string | null;
  estado_visita: string | null;
  observaciones_visita?: string | null;
  tecnico_id: string | null;
  tecnico?: { id: string; nombre: string } | null;
  oportunidad?: {
    id: string;
    codigo: string;
    titulo: string;
    requiere_visita_terreno?: boolean | null;
    cliente?: { nombre?: string; rut?: string | null; direccion?: string | null; comuna?: string | null } | null;
  } | null;
}

export interface OrdenItemRow {
  cotizacion_item_id?: string | null;
  producto: string;
  cantidad_objetivo: number;
  unidad?: string | null;
}

export interface OrdenRow {
  id: string;
  estado: string;
  oportunidad_id: string;
  fecha_inicio?: string | null;
  fecha_objetivo?: string | null;
  responsable_id?: string | null;
  notas?: string | null;
  items?: OrdenItemRow[];
  responsable?: { id: string; nombre: string } | null;
  oportunidad?: { codigo?: string; titulo?: string } | null;
}
