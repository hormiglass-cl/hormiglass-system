export type UserRole = 'admin' | 'user' | 'mano_obra' | 'finanzas';

export const ROL_NOMBRE: Record<UserRole, string> = {
  admin: 'Administrador',
  user: 'Ejecutivo Comercial',
  mano_obra: 'Mano de Obra',
  finanzas: 'Finanzas y Caja',
};

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rut?: string | null;
  rol: UserRole;
  activo: boolean;
  calendario_visitas?: boolean;
  calendario_produccion?: boolean;
  calendario_reventa?: boolean;
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
  tipo_venta?: 'Instalación' | 'Suministro' | 'Reventa de Material' | string;
  telefono?: string;
  correo?: string;
  correos_secundarios?: string[];
  direccion?: string;
  comuna?: string;
  region?: string;
  asignado_a?: string | null;
  usuario_id?: string | null;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export type TipoNotaActividad = 'nota' | 'reunion' | 'llamada' | 'recordatorio' | 'reclamo';

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
  producto_catalogo_id?: string | null;
  descripcion?: string | null;
  cantidad: number;
  precio_unitario: number;
  descuento_porcentaje?: number;
  total_item: number;
}

export type OrigenProducto = 'fabricacion_propia' | 'reventa';

export interface ProductoCatalogo {
  id: string;
  codigo: string;
  codigo_proveedor?: string | null;
  nombre: string;
  categoria: 'producto' | 'insumo' | 'servicio';
  familia?: string | null;
  subcategoria?: string | null;
  origen?: OrigenProducto | null;
  proveedor_id?: string | null;
  proveedor?: Proveedor | null;
  unidad: string;
  medidas?: string | null;
  color?: string | null;
  peso_kg?: number | null;
  precio_referencia: number;
  costo_referencia: number;
  descripcion?: string | null;
  observaciones?: string | null;
  requiere_revision?: boolean;
  es_demo: boolean;
  activo: boolean;
  created_at?: string;
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
  referencia_cliente?: string;
  fecha_validez?: string;
  comentario_publico?: string;
  fecha_inicio_compromiso?: string;
  fecha_limite_compromiso?: string;
  condiciones_pago?: string;
  observaciones?: string;
  fecha_aprobacion?: string;
  pdf_url?: string;
  created_at?: string;
  cliente?: Cliente;
  oportunidad?: OportunidadVenta;
  items?: CotizacionItem[];
}

export type TipoVenta = 'directa' | 'programacion';
export type ModalidadEntrega = 'retiro' | 'despacho' | 'instalacion';
export type ModalidadRequerimiento = 'solo_material' | 'instalacion';
export type CondicionPago = 'total' | 'abono50' | 'oc' | 'especial';
export type MedioPago = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'webpay' | 'cheque';
export type TipoDocumento = 'boleta' | 'factura' | 'factura_anticipo' | 'nota_venta';
export type EstadoPipeline =
  | 'nueva'
  | 'pagada'
  | 'entregada' // Venta Aprobada (cierre comercial; avanza a producción/reventa sin exigir guía previa)
  | 'prod_pendiente'
  | 'prod_cola'
  | 'prod_fabricacion'
  | 'prod_listo_instalacion'
  | 'prod_instalacion'
  | 'prod_finalizado'
  | 'rev_coordinacion'
  | 'rev_stock'
  | 'rev_listo_retiro'
  | 'rev_listo_despacho'
  | 'rev_entregado'
  | 'rev_postventa'
  | 'programada';
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
  tipo?: 'comentario' | 'actualizacion' | 'abono' | 'reclamo' | 'seguimiento' | string;
}

export type TipoAntecedenteDocumento =
  | 'contrato'
  | 'anexo'
  | 'documento_empresa'
  | 'documento_trabajador'
  | 'otro';

export interface AntecedenteDocumento {
  id: string;
  oportunidad_id?: string;
  nombre: string;
  tipo: TipoAntecedenteDocumento;
  url: string;
  bucket_id?: string;
  storage_path?: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  fecha_iso: string;
  subido_por?: string;
  subido_por_id?: string | null;
  eliminado?: boolean;
  eliminado_en?: string | null;
  eliminado_por?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type EmpresaHormiglass = 'comercial' | 'transportes' | 'inmobiliaria';

export interface Empresa {
  id: string;
  slug: EmpresaHormiglass | string;
  razon_social: string;
  rut: string;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
}

export type TipoCuentaBancaria = 'corriente' | 'vista' | 'mercado_pago' | 'efectivo' | 'otro';

export interface CuentaBancaria {
  id: string;
  empresa_id: string;
  banco: string;
  tipo_cuenta: TipoCuentaBancaria;
  numero_cuenta?: string;
  alias: string;
  saldo_inicial: number;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
  empresa?: Empresa;
}
export type CategoriaDocumentoAdministracion = 'general' | 'prevencion_riesgo' | 'legal';
export type SeccionAdministracionEmpresa =
  | 'cuentas_por_cobrar'
  | 'sueldos_administrativos'
  | 'pendientes_generales'
  | 'contabilidad_impuestos'
  | 'finiquitos'
  | 'legal'
  | 'prevencion_riesgos'
  | 'documentos'
  | 'obras_faenas';

export interface AdministracionDocumento {
  id: string;
  empresa: EmpresaHormiglass;
  seccion: SeccionAdministracionEmpresa;
  categoria: CategoriaDocumentoAdministracion;
  nombre: string;
  descripcion?: string | null;
  bucket_id: string;
  storage_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  subido_por_id?: string | null;
  subido_por_nombre?: string | null;
  eliminado: boolean;
  eliminado_en?: string | null;
  eliminado_por?: string | null;
  created_at: string;
  updated_at?: string;
}

export type RecurrenciaRecordatorio = 'ninguna' | 'diaria' | 'semanal' | 'mensual';
export type EstadoRecordatorio = 'por_hacer' | 'en_curso' | 'requiere_actualizacion' | 'completada';
export type UrgenciaRecordatorio = 'baja' | 'media' | 'alta' | 'critica';
export type TipoRecordatorioActividad =
  | 'comentario'
  | 'creacion'
  | 'estado_cambiado'
  | 'urgencia_cambiada'
  | 'actualizacion'
  | 'archivo';

export interface Recordatorio {
  id: string;
  empresa: EmpresaHormiglass;
  seccion: SeccionAdministracionEmpresa;
  estado: EstadoRecordatorio;
  urgencia: UrgenciaRecordatorio;
  titulo: string;
  descripcion?: string | null;
  asignado_a_id: string;
  creado_por_id?: string | null;
  fecha_vencimiento: string;
  recurrencia: RecurrenciaRecordatorio;
  recurrencia_dia_mes?: number | null;
  recurrencia_dia_semana?: number | null;
  completado: boolean;
  completado_en?: string | null;
  ultimo_completado_en?: string | null;
  veces_completado: number;
  activo: boolean;
  created_at: string;
  updated_at?: string;
  asignado_a?: Usuario;
  creado_por?: Usuario;
}

export interface RecordatorioActividad {
  id: string;
  recordatorio_id: string;
  tipo: TipoRecordatorioActividad;
  contenido: string;
  usuario_id?: string | null;
  usuario_nombre?: string | null;
  archivo_bucket?: string | null;
  archivo_path?: string | null;
  archivo_nombre?: string | null;
  archivo_mime_type?: string | null;
  archivo_size_bytes?: number | null;
  created_at: string;
}

export interface VisitaTerreno {
  id: string;
  oportunidad_id: string;
  tecnico_visita: 'Felipe Valverde' | 'Marcos Catalán' | 'Edith Tapia' | string;
  tecnico_id?: string | null;
  responsable_calendario_id?: string | null;
  fecha_visita_terreno: string;
  hora_visita_terreno?: string;
  estado_visita?: 'programada' | 'realizada' | 'cancelada' | string;
  observaciones_visita?: string;
  created_at?: string;
  oportunidad?: OportunidadVenta;
  tecnico?: Usuario;
  responsable_calendario?: ResponsableCalendario;
}

export type EstadoAbono = 'pendiente' | 'validado' | 'rechazado' | 'anulado';

export interface Abono {
  id: string;
  oportunidad_id: string;
  monto: number;
  fecha: string;
  nota?: string | null;
  comprobante_url?: string | null;
  comprobante_nombre?: string | null;
  estado: EstadoAbono;
  motivo_rechazo?: string | null;
  cuenta_bancaria_id?: string | null;
  caja_movimiento_id?: string | null;
  creado_por_id?: string | null;
  creado_por_nombre?: string | null;
  validado_por_id?: string | null;
  validado_por_nombre?: string | null;
  validado_at?: string | null;
  created_at?: string;
  updated_at?: string;
  cuenta_bancaria?: CuentaBancaria;
  oportunidad?: {
    id: string;
    codigo: string;
    titulo: string;
    cliente?: {
      id: string;
      nombre?: string;
      apellido_razon_social?: string;
      nombre_completo?: string;
      razon_social?: string;
      rut?: string;
    };
  };
}

export interface ComprobantePago {
  id?: string;
  monto?: number;
  fecha?: string;
  fecha_iso?: string;
  nota?: string;
  estado?: EstadoAbono;
  motivo_rechazo?: string;
  cuenta_bancaria_id?: string;
  banco_alias?: string;
  creado_por?: string;
  comprobante_nombre?: string;
  comprobante_url?: string;
  validado_por?: string;
  validado_at?: string;
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
  tipo_venta?: 'Instalación' | 'Suministro' | 'Reventa de Material' | string;
  origen?: string | null;
  seguimiento_resultado?: string | null;
  proxima_accion?: string | null;
  proxima_accion_fecha?: string | null;
  seguimiento_responsable_id?: string | null;
  modalidad_requerimiento?: ModalidadRequerimiento | string;
  rama_destino?: 'produccion' | 'reventa' | null;
  abastecimiento?: 'fabricar' | 'compra_proveedor' | 'stock' | null;
  forma_entrega?: 'retiro_cliente' | 'retiro_proveedor' | 'despacho_propio' | 'despacho_subcontratado' | null;
  fecha_prometida?: string | null;
  fecha_tentativa_produccion?: string | null;
  fecha_tentativa_entrega?: string | null;
  direccion_obra?: string | null;
  transporte?: string | null;
  responsable_operativo_id?: string | null;
  entrega_manual_confirmada?: boolean;
  entrega_manual_motivo?: string | null;
  fecha_vencimiento_cobro?: string | null;
  rama_definida_en?: string | null;
  rama_definida_por?: string | null;
  comuna?: string;
  region?: string;
  direccion?: string;
  /** @deprecated No existe como columna en public.oportunidades — usar monto_estimado. */
  monto?: number;
  monto_estimado?: number;
  probabilidad?: number;
  notas_venta?: unknown[];
  ordenes_compra?: unknown[];
  requiere_visita_terreno?: boolean;
  visitas_terreno?: VisitaTerreno[];
  tecnico_visita?: 'Felipe Valverde' | 'Marcos Catalán' | 'Edith Tapia' | string;
  tecnico_id?: string | null;
  tecnico?: Usuario;
  responsable_visita_id?: string | null;
  responsable_visita?: ResponsableCalendario;
  fecha_visita_terreno?: string;
  hora_visita_terreno?: string;
  estado_visita?: 'programada' | 'realizada' | 'cancelada' | string;
  observaciones_visita?: string;
  modalidad_entrega?: ModalidadEntrega;
  condicion_pago?: CondicionPago;
  productos?: string[];
  comprobantes_pago?: ComprobantePago[];
  monto_abonado?: number;
  requiere_antecedentes?: boolean;
  antecedentes?: AntecedenteDocumento[];
  /** @deprecated No existe tabla `abonos` en Supabase — el embed .select('*, abonos(*)') no resuelve nada. Usar comprobantes_pago (ver Fase 4 del plan de seguridad). */
  abonos?: Abono[];
  chat_mensajes?: ChatMensaje[];
  chat_interno?: ChatMensaje[];
  created_at?: string;
  updated_at?: string;
  cliente?: Cliente;
  usuario_asignado?: Usuario;
  cotizaciones?: Cotizacion[];
  cotizacion_actual?: Cotizacion;
  cotizacion_actual_id?: string;
  produccion_diaria?: ProduccionDiaria[];
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
  direccion?: string;
  comuna?: string;
  region?: string;
  created_at?: string;
}

export type EstadoOrdenCompra = 'borrador' | 'emitida' | 'aprobada' | 'recibida' | 'pagada' | 'cancelada';

export interface OrdenCompraItem {
  id?: string;
  orden_compra_id?: string;
  articulo_codigo?: string;
  producto_catalogo_id?: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  total_item: number;
}

export interface OrdenCompraAsignacion {
  id: string;
  orden_compra_id: string;
  orden_compra_item_id: string;
  oportunidad_id: string;
  cantidad: number;
  costo_asignado: number;
  unidad?: string | null;
  notas?: string | null;
  oportunidad?: OportunidadVenta;
}

export interface OrdenCompra {
  id: string;
  numero_oc: string;
  proveedor_id: string;
  oportunidad_id?: string;
  usuario_id?: string;
  fecha_emision: string;
  version?: number;
  estado: EstadoOrdenCompra;
  envie_a_nombre: string;
  envie_a_rut: string;
  envie_a_contacto: string;
  envie_a_direccion: string;
  envie_a_telefono: string;
  envie_a_email: string;
  condicion_pago: string;
  contacto_pago_nombre?: string;
  contacto_pago_telefono?: string;
  contacto_pago_email?: string;
  instrucciones_especiales?: string;
  subtotal: number;
  iva_porcentaje: number;
  monto_iva: number;
  costo_envio: number;
  otros_cargos: number;
  monto_total: number;
  pdf_url?: string;
  caja_movimiento_id?: string | null;
  fecha_pago?: string | null;
  pagado_por_id?: string | null;
  created_at?: string;
  updated_at?: string;
  proveedor?: Proveedor;
  oportunidad?: OportunidadVenta;
  tipo_compra?: 'reventa' | 'insumos_fabricacion';
  asignaciones?: OrdenCompraAsignacion[];
  items?: OrdenCompraItem[];
}

export interface ProduccionDiaria {
  id: string;
  oportunidad_id: string;
  orden_produccion_id?: string | null;
  cotizacion_id?: string | null;
  cotizacion_item_id?: string | null;
  producto: string;
  cantidad_producida: number;
  fecha_produccion: string;
  responsable_id?: string | null;
  responsable_calendario_id?: string | null;
  responsable?: Usuario;
  observaciones?: string;
  registrado_por?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OrdenProduccionItem {
  id: string;
  orden_produccion_id: string;
  cotizacion_item_id?: string | null;
  producto: string;
  cantidad_objetivo: number;
  unidad?: string | null;
}

export interface OrdenProduccion {
  id: string;
  oportunidad_id: string;
  estado: 'planificada' | 'en_curso' | 'completada' | 'cancelada';
  fecha_inicio?: string | null;
  fecha_objetivo?: string | null;
  responsable_id?: string | null;
  notas?: string | null;
  items?: OrdenProduccionItem[];
}

export interface GuiaDespachoItem {
  id: string;
  guia_despacho_id: string;
  cotizacion_item_id?: string | null;
  producto: string;
  cantidad_planificada: number;
  cantidad_cargada: number;
  cantidad_recibida: number;
}

export interface GuiaDespachoDocumento {
  id: string;
  guia_despacho_id: string;
  tipo: 'carga' | 'firma' | 'conformidad' | 'otro';
  nombre: string;
  archivo_path: string;
}

export interface GuiaDespacho {
  id: string;
  oportunidad_id: string;
  numero_guia: string;
  estado: 'planificada' | 'cargada' | 'entregada' | 'cancelada';
  fecha_salida?: string | null;
  origen?: string | null;
  destino?: string | null;
  vehiculo?: string | null;
  chofer?: string | null;
  tipo_transporte?: 'propio' | 'subcontratado' | 'retiro_cliente' | 'retiro_proveedor';
  costo_estimado?: number;
  costo_real?: number;
  costo_real_confirmado?: boolean;
  recibido_por?: string | null;
  carga_verificada_por?: string | null;
  carga_verificada_at?: string | null;
  entrega_confirmada_por?: string | null;
  entrega_confirmada_at?: string | null;
  carga_verificada: boolean;
  entrega_conforme: boolean;
  confirmada_manualmente: boolean;
  entrega_manual_motivo?: string | null;
  items?: GuiaDespachoItem[];
  documentos?: GuiaDespachoDocumento[];
}

export interface OperacionExcepcion {
  id: string;
  tipo: 'exceso_produccion' | 'firma_entrega' | 'entrega_manual';
  oportunidad_id: string;
  orden_produccion_id?: string | null;
  cotizacion_item_id?: string | null;
  guia_despacho_id?: string | null;
  cantidad_excedente?: number | null;
  motivo: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  solicitado_por: string;
  resuelto_por?: string | null;
  solicitado_at: string;
  resuelto_at?: string | null;
}

export interface PostventaCaso {
  id: string;
  oportunidad_id: string;
  tipo: 'faltante' | 'defecto' | 'cantidad_adicional' | 'otro';
  estado: 'abierto' | 'programado' | 'en_curso' | 'resuelto' | 'cancelado';
  descripcion: string;
  cantidad_adicional?: number | null;
  autorizacion_cliente?: string | null;
  fecha_compromiso?: string | null;
  responsable_id?: string | null;
  evento_id?: string | null;
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

export type CajaClasificacion =
  | 'costo_directo'
  | 'gasto_operacional'
  | 'gasto_administrativo'
  | 'gasto_financiero'
  | 'ingreso_operacional'
  | 'ingreso_no_operacional';

export interface CajaCategoria {
  id: string;
  nombre: string;
  tipo: TipoMovimientoCaja;
  clasificacion: CajaClasificacion;
  descripcion?: string | null;
  activo: boolean;
  orden: number;
  created_at?: string;
  updated_at?: string;
  subcategorias?: CajaSubcategoria[];
}

export interface CajaSubcategoria {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion?: string | null;
  activo: boolean;
  orden: number;
  created_at?: string;
  updated_at?: string;
  categoria?: CajaCategoria;
}

export interface MargenPorNV {
  oportunidad_id: string;
  codigo: string;
  titulo: string;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  cliente_rut?: string | null;
  vendedor_id?: string | null;
  vendedor_nombre?: string | null;
  estado_pipeline: string;
  fecha_creacion: string;
  numero_cotizacion?: string | null;
  valor_cotizado_neto: number;
  valor_cotizado_total: number;
  total_ingresos_validados: number;
  costo_compras_asignadas: number;
  costo_fletes_despacho: number;
  costo_caja_directo: number;
  costo_postventa?: number;
  costo_directo_total: number;
  margen_bruto_real: number;
  margen_bruto_proyectado: number;
  porcentaje_margen_proyectado: number;
  porcentaje_margen_real: number;
}

export interface MovimientoCaja {
  id: string;
  tipo: TipoMovimientoCaja;
  monto: number;
  categoria: string;
  descripcion?: string;
  venta_id?: string;
  pedido_proveedor_id?: string;
  usuario_id: string;
  cuenta_bancaria_id?: string | null;
  oportunidad_id?: string | null;
  empresa_id?: string | null;
  categoria_id?: string | null;
  subcategoria_id?: string | null;
  orden_compra_id?: string | null;
  proveedor_id?: string | null;
  fecha: string;
  usuario?: Usuario;
  cuenta_bancaria?: CuentaBancaria;
  empresa?: Empresa;
  categoria_rel?: CajaCategoria;
  subcategoria?: CajaSubcategoria;
  orden_compra?: OrdenCompra;
  proveedor?: Proveedor;
  oportunidad?: OportunidadVenta;
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

export type EstadoPlanificacion =
  | 'pendiente'
  | 'cola_produccion'
  | 'fabricacion'
  | 'listo_instalacion'
  | 'instalacion'
  | 'finalizado';

export interface ProyectoPlanificacion {
  id: string;
  oportunidad_id: string;
  codigo: string;
  titulo: string;
  cliente_id: string;
  cliente?: Cliente;
  estado: EstadoPlanificacion;
  cuadrilla_id?: string | null;
  encargado_fabricacion_id?: string | null;
  cuadrilla?: Usuario;
  encargado_fabricacion?: Usuario;
  fecha_estimada_instalacion?: string;
  fecha_estimada_produccion?: string;
  observaciones?: string;
  created_at?: string;
}

export type TipoEventoProduccionLogistica = 'obra' | 'produccion' | 'reventa' | 'logistica' |
  'retiro_proveedor' | 'despacho_cliente' | 'instalacion' | 'postventa' | 'logistica_interna';
export type EstadoEventoProduccionLogistica =
  | 'por_hacer'
  | 'en_curso'
  | 'reprogramado'
  | 'completado'
  | 'no_realizado';
export type ContextoEventoProduccionLogistica = 'produccion_logistica' | 'reventa_logistica';
export type TipoCalendarioResponsable = 'visitas_terreno' | 'produccion_logistica' | 'reventa_logistica';

export interface EventoProduccionLogistica {
  id: string;
  contexto?: ContextoEventoProduccionLogistica;
  oportunidad_id: string;
  planificacion_id?: string | null;
  tipo_evento: TipoEventoProduccionLogistica;
  titulo: string;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_evento?: string;
  hora_evento?: string | null;
  responsable_id?: string | null;
  recurso_vehiculo?: string | null;
  orden_compra_id?: string | null;
  guia_despacho_id?: string | null;
  conflicto_confirmado_motivo?: string | null;
  motivo_reprogramacion?: string | null;
  responsable_calendario_id?: string | null;
  responsable?: Usuario;
  responsable_calendario?: ResponsableCalendario;
  estado: EstadoEventoProduccionLogistica | string;
  observaciones?: string | null;
  registrado_por?: string | null;
  oportunidad?: OportunidadVenta;
  created_at?: string;
  updated_at?: string;
}

export interface ResponsableCalendario {
  id: string;
  nombre: string;
  rut?: string | null;
  cargo?: string | null;
  telefono?: string | null;
  email?: string | null;
  calendarios: TipoCalendarioResponsable[];
  activo: boolean;
  created_at?: string;
  updated_at?: string;
}

export type EstadoReventa =
  | 'coordinacion_proveedor'
  | 'confirmacion_stock'
  | 'listo_retiro'
  | 'listo_despacho'
  | 'entregado'
  | 'postventa';

export interface OrdenReventa {
  id: string;
  oportunidad_id: string;
  codigo: string;
  titulo: string;
  cliente_id: string;
  cliente?: Cliente;
  proveedor_nombre?: string;
  estado: EstadoReventa;
  fecha_despacho?: string;
  observaciones?: string;
  notas_postventa?: string;
  created_at?: string;
}

// ==============================================================================
// TIPOS RECURSOS HUMANOS (RR.HH.)
// ==============================================================================

export type EstadoDisponibilidad =
  | 'disponible'
  | 'en_terreno'
  | 'permiso'
  | 'licencia'
  | 'vacaciones'
  | 'falta';

export type CategoriaDocumentoTrabajador =
  | 'contratos'
  | 'anexos'
  | 'liquidaciones'
  | 'comprobantes'
  | 'licencias'
  | 'certificados'
  | 'otros';

export type TipoPermisoAusencia =
  | 'permiso'
  | 'vacaciones'
  | 'licencia_medica'
  | 'falta_injustificada'
  | 'dia_administrativo';

export type EstadoPermiso = 'aprobado' | 'pendiente' | 'rechazado';

export const CARGOS_RRHH_DEFAULT = [
  'Maestro de Obra & Instalación',
  'Técnico Visita a Terreno',
  'Jefe de Patio & Logística',
  'Gerente Comercial & Ventas',
  'Instalador Especialista',
  'Ayudante de Cuadrilla',
  'Operario de Planta & Fabricación',
  'Chofer / Despachador',
  'Coordinador de Planificación',
  'Ejecutivo de Ventas',
  'Administración & Finanzas',
];

export const AREAS_RRHH_DEFAULT = [
  'Operaciones & Terreno',
  'Taller & Planta',
  'Comercial & Ventas',
  'Logística & Despacho',
  'Administración & Finanzas',
];

export interface Trabajador {
  id: string;
  nombre: string;
  rut: string;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  comuna?: string | null;
  region?: string | null;
  cargo: string;
  area: string;
  tipo_contrato: string;
  fecha_ingreso?: string;
  sueldo_base?: number;
  estado_disponibilidad: EstadoDisponibilidad;
  activo: boolean;
  contacto_emergencia_nombre?: string | null;
  contacto_emergencia_telefono?: string | null;
  banco?: string | null;
  tipo_cuenta?: string | null;
  numero_cuenta?: string | null;
  usuario_id?: string | null;
  observaciones?: string | null;
  created_at?: string;
  updated_at?: string;
  documentos?: TrabajadorDocumento[];
  permisos?: TrabajadorPermisoAusencia[];
  liquidaciones?: TrabajadorLiquidacion[];
  notas?: TrabajadorNota[];
  asistencias?: TrabajadorAsistencia[];
}

export interface TrabajadorDocumento {
  id: string;
  trabajador_id: string;
  categoria: CategoriaDocumentoTrabajador;
  nombre_archivo: string;
  url: string;
  storage_path?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  fecha_emision?: string;
  subido_por?: string | null;
  notas?: string | null;
  created_at?: string;
}

export interface TrabajadorPermisoAusencia {
  id: string;
  trabajador_id: string;
  tipo: TipoPermisoAusencia;
  fecha_inicio: string;
  fecha_fin: string;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  jornada_completa: boolean;
  motivo?: string | null;
  estado: EstadoPermiso;
  bloquea_calendario: boolean;
  comprobante_url?: string | null;
  aprobado_por?: string | null;
  created_at?: string;
}

export interface TrabajadorLiquidacion {
  id: string;
  trabajador_id: string;
  mes: number;
  anio: number;
  monto_sueldo_base: number;
  bonos: number;
  descuentos: number;
  monto_liquido: number;
  estado_pago: 'pendiente' | 'pagado';
  fecha_pago?: string;
  comprobante_url?: string | null;
  created_at?: string;
}

export interface TrabajadorNota {
  id: string;
  trabajador_id: string;
  usuario_id?: string | null;
  tipo: 'nota' | 'felicitacion' | 'amonestacion' | 'evaluacion' | 'seguimiento';
  contenido: string;
  usuario?: Usuario;
  created_at?: string;
}

export type EstadoAsistencia =
  | 'presente'
  | 'atraso'
  | 'salida_temprana'
  | 'ausente_justificado'
  | 'ausente_injustificado'
  | 'en_terreno';

export type OrigenAsistencia = 'manual' | 'geovictoria' | 'zkteco' | 'app_movil';

export interface TrabajadorAsistencia {
  id: string;
  trabajador_id: string;
  fecha: string;
  hora_entrada?: string | null;
  hora_salida?: string | null;
  estado: EstadoAsistencia;
  minutos_atraso?: number;
  origen: OrigenAsistencia;
  observaciones?: string | null;
  creado_por?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ==============================================================================
// TIPOS MÓDULO INTEGRAL DE POSTVENTA Y GARANTÍAS
// ==============================================================================

export type EstadoPostventa =
  | 'recibido'
  | 'en_revision'
  | 'visita_programada'
  | 'reparacion_programada'
  | 'cerrado'
  | 'abierto'
  | 'programado'
  | 'en_curso'
  | 'resuelto'
  | 'cancelado';

export type CausaRaizPostventa =
  | 'Fabricacion'
  | 'Instalacion'
  | 'Despacho'
  | 'Terreno'
  | 'Cliente'
  | 'Proveedor'
  | 'Transportista'
  | 'Sin determinar';

export type ResolucionPostventa =
  | 'garantia'
  | 'responsabilidad_parcial'
  | 'no_garantia'
  | 'transportista'
  | 'en_evaluacion';

export type TipoProblemaPostventa =
  | 'producto_defectuoso'
  | 'problema_fabricacion'
  | 'problema_instalacion'
  | 'dano_transporte'
  | 'uso_incorrecto'
  | 'movimiento_terreno'
  | 'trabajo_adicional'
  | 'dano_terceros'
  | 'faltante'
  | 'defecto'
  | 'cantidad_adicional'
  | 'otro';

export type TipoEvidenciaPostventa =
  | 'antes'
  | 'durante'
  | 'despues'
  | 'conformidad'
  | 'diagnostico'
  | 'otro';

export type TipoCostoPostventa =
  | 'materiales'
  | 'flete'
  | 'mano_obra'
  | 'reposicion'
  | 'traslado'
  | 'otro';

export interface AntecedentesVentaPostventa {
  cotizado_verificado: boolean;
  contratado_verificado: boolean;
  entregado_verificado: boolean;
  condiciones_terreno?: string;
  observaciones_instalacion?: string;
  guia_recepcion_verificada?: boolean;
  pagos_al_dia?: boolean;
}

export interface EvidenciaPostventa {
  id: string;
  caso_id: string;
  tipo_evidencia: TipoEvidenciaPostventa;
  archivo_url: string;
  nombre_archivo?: string | null;
  descripcion?: string | null;
  usuario_id?: string | null;
  created_at: string;
}

export interface CostoPostventa {
  id: string;
  caso_id: string;
  tipo_costo: TipoCostoPostventa;
  descripcion: string;
  monto: number;
  proveedor_o_maestro?: string | null;
  fecha: string;
  created_at: string;
}

export interface CasoPostventa {
  id: string;
  folio: string;
  oportunidad_id: string;
  vendedor_id?: string | null;
  cuadrilla_id?: string | null;
  cliente_id?: string | null;
  obra?: string | null;
  producto_id?: string | null;
  producto_texto?: string | null;
  tipo: TipoProblemaPostventa;
  tipo_problema?: string | null;
  estado: EstadoPostventa;
  descripcion: string;
  causa_raiz?: CausaRaizPostventa | null;
  resolucion?: ResolucionPostventa | null;
  antecedentes_venta?: AntecedentesVentaPostventa | null;
  cobertura_garantia_doc?: string | null;
  cantidad_adicional?: number | null;
  autorizacion_cliente?: string | null;
  fecha_compromiso?: string | null;
  fecha_reclamo?: string;
  fecha_cierre?: string | null;
  cerrado_por?: string | null;
  conformidad_cliente: boolean;
  conformidad_observaciones?: string | null;
  costo_total: number;
  responsable_id?: string | null;
  evento_id?: string | null;
  created_at: string;

  // Relaciones
  oportunidad?: OportunidadVenta | null;
  cliente?: Cliente | null;
  vendedor?: Usuario | null;
  cuadrilla?: Trabajador | null;
  producto?: ProductoCatalogo | null;
  evidencias?: EvidenciaPostventa[];
  costos?: CostoPostventa[];
}
