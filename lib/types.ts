export type UserRole = 'admin' | 'ventas' | 'finanzas' | 'administracion' | 'programacion';

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: UserRole;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
}

export type TipoCliente = 'natural' | 'juridica';

export const NICHOS_CLIENTE_DEFAULT = [
  'Constructora B2B',
  'Inmobiliaria',
  'Paisajismo & Jardinería',
  'Obras Viales & Soleras',
  'Arquitectura & Diseño',
  'Particular B2C',
];

export interface Cliente {
  id: string;
  nombre: string;
  apellido_razon_social?: string;
  rut: string;
  tipo_cliente?: TipoCliente;
  nicho?: string;
  telefono?: string;
  correo?: string;
  correos_secundarios?: string[];
  direccion?: string;
  comuna?: string;
  asignado_a?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export type TipoNotaActividad = 'nota' | 'reunion' | 'llamada' | 'recordatorio';

export interface NotaActividad {
  id: string;
  cliente_id: string;
  usuario_id: string;
  contenido: string;
  tipo_actividad?: TipoNotaActividad;
  fecha_recordatorio?: string;
  hora_recordatorio?: string;
  fecha: string;
  usuario?: Usuario;
}

export type EstadoCotizacion = 'borrador' | 'enviada' | 'aprobada' | 'declinada' | 'rechazada';

export interface CotizacionItem {
  id?: string;
  cotizacion_id?: string;
  producto: string;
  cantidad: number;
  precio_unitario: number;
  descuento_porcentaje?: number;
  total_item: number;
}

export interface Cotizacion {
  id: string;
  numero_cotizacion: string;
  cliente_id: string;
  usuario_id: string;
  oportunidad_id?: string;
  version?: number;
  estado: EstadoCotizacion;
  subtotal: number;
  descuento: number;
  iva_porcentaje: number;
  monto_iva: number;
  monto_total: number;
  plazo_entrega?: string;
  fecha_inicio_compromiso?: string;
  fecha_limite_compromiso?: string;
  condiciones_pago?: string;
  observaciones?: string;
  pdf_url?: string;
  created_at?: string;
  cliente?: Cliente;
  oportunidad?: OportunidadVenta;
  items?: CotizacionItem[];
}

export type TipoVenta = 'directa' | 'programacion';
export type ModalidadEntrega = 'retiro' | 'despacho' | 'instalacion';
export type CondicionPago = 'total' | 'abono50' | 'oc' | 'especial';
export type MedioPago = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'webpay' | 'cheque';
export type TipoDocumento = 'boleta' | 'factura' | 'factura_anticipo' | 'nota_venta';
export type EstadoPipeline = 'nueva' | 'pagada' | 'programada' | 'entregada';
export type PrioridadOportunidad = 'urgente' | 'alta' | 'normal';

export const PRODUCTOS_HORMIGLASS = [
  'Adocésped',
  'Adocretos',
  'Adoquines piedra',
  'Baldosas',
  'Basas para pilares',
  'Bordes de piscina',
  'Bloques de cemento',
  'Cemento',
  'Maceteros',
  'Pastelones',
  'Piedras naturales',
  'Pigmentos',
  'Tapas de cámara',
  'Materiales de Cierre',
  'Soleras',
  'Solerillas',
  'Cierre Perimetral',
];

export interface ChatMensaje {
  id: string;
  usuario_id: string;
  usuario_nombre: string;
  texto?: string;
  contenido?: string;
  menciones?: string[];
  created_at: string;
  tipo?: 'comentario' | 'actualizacion' | 'abono' | string;
}

export interface OportunidadVenta {
  id: string;
  codigo: string;
  titulo: string;
  cliente_id: string;
  estado_pipeline: EstadoPipeline;
  fecha_inicio: string;
  fecha_limite?: string | null;
  asignado_a?: string | null;
  prioridad?: PrioridadOportunidad;
  modalidad_entrega?: ModalidadEntrega;
  condicion_pago?: CondicionPago;
  productos?: string[];
  comprobantes_pago?: string[];
  notas_venta?: string[];
  ordenes_compra?: string[];
  monto_abonado?: number;
  chat_mensajes?: ChatMensaje[];
  chat_interno?: ChatMensaje[];
  created_at?: string;
  cliente?: Cliente;
  usuario_asignado?: Usuario;
  cotizaciones?: Cotizacion[];
  cotizacion_actual?: Cotizacion;
  cotizacion_actual_id?: string;
}

export interface Venta {
  id: string;
  numero_venta: string;
  cotizacion_id?: string;
  cliente_id: string;
  tipo_venta: TipoVenta;
  modalidad_entrega: ModalidadEntrega;
  condicion_pago: CondicionPago;
  medio_pago: MedioPago;
  monto_total: number;
  monto_abonado: number;
  saldo_pendiente: number;
  tipo_documento?: TipoDocumento;
  numero_documento?: string;
  estado_pipeline: EstadoPipeline;
  fecha_solicitada?: string;
  fecha_comprometida?: string;
  asignado_a?: string;
  aprobado_admin?: boolean;
  incluye_escombros?: boolean;
  comision_registrada?: boolean;
  poliza_emitida?: boolean;
  created_at?: string;
  cliente?: Cliente;
}

export interface Proveedor {
  id: string;
  nombre: string;
  rut: string;
  contacto?: string;
  telefono?: string;
  correo?: string;
  created_at?: string;
}

export type EstadoPedidoProveedor = 'solicitado' | 'oc_generada' | 'esperando_entrega' | 'recibido';

export interface PedidoProveedor {
  id: string;
  proveedor_id: string;
  venta_id?: string;
  descripcion: string;
  monto: number;
  estado: EstadoPedidoProveedor;
  fecha: string;
  created_at?: string;
  proveedor?: Proveedor;
}

export type TipoMovimientoCaja = 'ingreso' | 'egreso';

export interface MovimientoCaja {
  id: string;
  tipo: TipoMovimientoCaja;
  monto: number;
  categoria: string;
  descripcion?: string;
  venta_id?: string;
  pedido_proveedor_id?: string;
  usuario_id: string;
  fecha: string;
  usuario?: Usuario;
}

export interface Notificacion {
  id: string;
  usuario_id?: string;
  mensaje: string;
  tipo?: 'mencion' | 'asignacion' | 'general' | 'info' | 'recordatorio';
  link_url?: string;
  leido: boolean;
  entidad_relacionada?: string;
  fecha: string;
}

