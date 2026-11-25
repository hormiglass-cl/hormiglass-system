'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../../lib/supabase/client';
import { useAuth } from '../../../lib/context/AuthContext';
import { useBreadcrumb } from '../../../lib/context/BreadcrumbContext';
import { useAjuste } from '../../../lib/ajustes';
import {
  Cliente,
  NotaActividad,
  Cotizacion,
  TipoNotaActividad,
  OportunidadVenta,
  Usuario,
  EventoProduccionLogistica,
} from '../../../lib/types';
import { PdfPreviewModal } from '../../../components/PdfPreviewModal';
import { CotizacionModal } from '../../../components/CotizacionModal';
import { ClienteCentroCostos } from '../../../components/clientes/ClienteCentroCostos';
import { SearchableSelect } from '../../../components/SearchableSelect';
import { REGIONES_CHILE, TODAS_COMUNAS_CHILE } from '../../../lib/chile-data';
import { cotizacionVigente, totalAbonado, totalComercial } from '../../../lib/oportunidad-finanzas';
import { mensajeError } from '../../../lib/errores';
import {
  Button,
  CodeStamp,
  Dialog,
  EmptyState,
  Panel,
  RecordLayout,
  StageRail,
  StatusBadge,
  Tone,
} from '../../../components/ui/crm';
import { useToast } from '../../../components/ui/feedback';
import {
  ArrowLeft,
  FileText,
  MessageSquare,
  Send,
  UserCheck,
  Edit,
  Save,
  Bell,
  PhoneCall,
  Calendar,
  Eye,
  FileCheck,
  TrendingUp,
  Clock,
  Plus,
  AlertTriangle,
  ExternalLink,
  Search,
  ChevronDown,
  Mail,
  Phone,
  MapPin,
  UserRound,
} from 'lucide-react';
import { Select, DateInput } from '../../../components/ui/FormControls';

const NICHOS_CLIENTE_DEFAULT = [
  'Constructora B2B',
  'Inmobiliaria',
  'Contratista General',
  'Particular',
  'Distribuidor',
];

const SYSTEM_TIME_ZONE = 'America/Santiago';

function getDateOnly(value?: string | null) {
  if (!value) return '';
  return value.includes('T') ? value.slice(0, 10) : value;
}

function normalizeTime(value?: string | null) {
  const [hours = '09', minutes = '00', seconds = '00'] = (value || '09:00').split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
}

function formatSantiagoDateTime(value?: string | null, timeValue?: string | null) {
  if (!value) return 'Sin fecha';

  if (timeValue !== undefined) {
    const [year, month, day] = getDateOnly(value).split('-');
    if (!year || !month || !day) return 'Fecha inválida';
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year} ${normalizeTime(timeValue)}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha inválida';

  const parts = new Intl.DateTimeFormat('es-CL', {
    timeZone: SYSTEM_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '00';

  return `${getPart('day')}/${getPart('month')}/${getPart('year')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
}

function buildReminderDate(fechaRecordatorio: string, horaRecordatorio?: string | null) {
  return new Date(`${getDateOnly(fechaRecordatorio)}T${normalizeTime(horaRecordatorio)}`);
}

type OpActividadRow = {
  id: string;
  contenido: string;
  created_at: string;
  usuario_nombre?: string;
  tipo?: string;
  oportunidad_id: string;
  fecha_recordatorio?: string | null;
  hora_recordatorio?: string | null;
};

const STAGE_CONFIG: Record<string, { label: string; area: string; tone: Tone }> = {
  nueva: { label: 'Nueva oportunidad', area: 'Comercial', tone: 'neutral' },
  pagada: { label: 'Pago validado', area: 'Comercial', tone: 'info' },
  entregada: { label: 'Venta aprobada', area: 'Comercial', tone: 'success' },

  prod_pendiente: { label: 'Pendiente planif.', area: 'Producción', tone: 'warning' },
  prod_cola: { label: 'En cola', area: 'Producción', tone: 'info' },
  prod_fabricacion: { label: 'En fabricación', area: 'Producción', tone: 'accent' },
  prod_listo_instalacion: { label: 'Listo p/ instal.', area: 'Producción', tone: 'info' },
  prod_instalacion: { label: 'En instalación', area: 'Producción', tone: 'accent' },
  prod_finalizado: { label: 'Finalizado', area: 'Producción', tone: 'success' },

  rev_coordinacion: { label: 'Coord. proveedor', area: 'Reventa', tone: 'info' },
  rev_stock: { label: 'Confirm. stock', area: 'Reventa', tone: 'info' },
  rev_listo_retiro: { label: 'Listo retiro', area: 'Reventa', tone: 'warning' },
  rev_listo_despacho: { label: 'Listo despacho', area: 'Reventa', tone: 'accent' },
  rev_entregado: { label: 'Entregado', area: 'Reventa', tone: 'success' },
  rev_postventa: { label: 'Postventa', area: 'Reventa', tone: 'accent' },

  programada: { label: 'En programación', area: 'Legacy', tone: 'info' },
  en_fabricacion: { label: 'En fabricación', area: 'Legacy', tone: 'accent' },
  lista_despacho: { label: 'Listo despacho', area: 'Legacy', tone: 'accent' },
  instalacion: { label: 'En instalación', area: 'Legacy', tone: 'accent' },
  venta_cerrada: { label: 'Venta cerrada', area: 'Legacy', tone: 'success' },
};

function getEtapaObraIndex(estado?: string | null): number {
  if (!estado) return 0;
  switch (estado) {
    case 'nueva':
      return 0;
    case 'pagada':
      return 1;
    case 'entregada':
      return 2;
    case 'prod_pendiente':
    case 'prod_cola':
    case 'prod_fabricacion':
    case 'rev_coordinacion':
    case 'rev_stock':
    case 'rev_listo_retiro':
    case 'programada':
    case 'en_fabricacion':
      return 3;
    case 'rev_listo_despacho':
    case 'lista_despacho':
      return 3;
    case 'prod_listo_instalacion':
    case 'prod_instalacion':
    case 'instalacion':
      return 4;
    case 'prod_finalizado':
    case 'rev_entregado':
    case 'rev_postventa':
    case 'venta_cerrada':
      return 5;
    default:
      return 1;
  }
}

function AsideSection({ title, count, open, onToggle, children }: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          {title}
          {count !== undefined && <span className="hg-list-count">{count}</span>}
        </h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          {open ? 'Cerrar' : 'Ver'}
          <ChevronDown size={13} className={open ? 'rotate-180' : ''} aria-hidden />
        </button>
      </div>
      {open && <div className="space-y-2.5 px-4 pb-4">{children}</div>}
    </section>
  );
}

export default function ClienteDetailPage() {
  const params = useParams();
  const { currentUser } = useAuth();
  const toast = useToast();
  const clienteId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const router = useRouter();
  const { setCustomTitle: setBreadcrumbTitle } = useBreadcrumb();
  const tiposVenta = useAjuste('tipos_venta').valor.lista;

  // Vuelve a la oportunidad desde la que se llegó, o al listado de clientes.
  const volverDesdeFicha = () => {
    const desde = new URLSearchParams(window.location.search).get('desde');
    router.push(desde ? `/ventas?oportunidad=${desde}` : '/clientes');
  };
  useEffect(() => {
    setBreadcrumbTitle(cliente?.nombre ?? null);
    return () => setBreadcrumbTitle(null);
  }, [cliente?.nombre, setBreadcrumbTitle]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [nichosOptions, setNichosOptions] = useState<string[]>(NICHOS_CLIENTE_DEFAULT);

  // Tab and view state
  const [activeTab, setActiveTab] = useState<'actividad' | 'notas' | 'reclamos' | 'metricas'>('actividad');
  const [filtroActividadTipo, setFiltroActividadTipo] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [showNotaDialog, setShowNotaDialog] = useState(false);
  const [asideOpen, setAsideOpen] = useState({ op: true, cot: true, obras: true });
  const toggleAside = (k: 'op' | 'cot' | 'obras') => setAsideOpen((prev) => ({ ...prev, [k]: !prev[k] }));
  const [opTipoVenta, setOpTipoVenta] = useState('Instalación');

  // RUT validation helper functions
  const calcularDV = (rutBody: string): string => {
    const cleanBody = rutBody.replace(/[^0-9]/g, '');
    if (!cleanBody) return '';
    let sum = 0;
    let multiplier = 2;
    for (let i = cleanBody.length - 1; i >= 0; i--) {
      sum += parseInt(cleanBody.charAt(i), 10) * multiplier;
      multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }
    const expectedMod = 11 - (sum % 11);
    if (expectedMod === 11) return '0';
    if (expectedMod === 10) return 'K';
    return expectedMod.toString();
  };

  const validarRutChileno = (rutBody: string, dv: string): { valido: boolean; mensaje?: string } => {
    const cleanBody = rutBody.replace(/[^0-9]/g, '');
    const cleanDv = dv.trim().toUpperCase();
    if (!cleanBody) return { valido: false, mensaje: 'Ingresa el número de RUT' };
    if (cleanBody.length < 7 || cleanBody.length > 8) return { valido: false, mensaje: 'El RUT debe tener entre 7 y 8 dígitos' };
    if (!cleanDv) return { valido: false, mensaje: 'Ingresa el DV' };
    if (!/^[0-9K]$/.test(cleanDv)) return { valido: false, mensaje: 'DV inválido (0-9 o K)' };

    const dvEsperado = calcularDV(cleanBody);
    if (dvEsperado !== cleanDv) {
      return { valido: false, mensaje: `RUT inválido. El DV para ${cleanBody} es ${dvEsperado}` };
    }
    return { valido: true };
  };

  // Edit form state
  const [editNombre, setEditNombre] = useState('');
  const [editRazon, setEditRazon] = useState('');
  const [editRutBody, setEditRutBody] = useState('');
  const [editRutDv, setEditRutDv] = useState('');
  const [editNicho, setEditNicho] = useState('');
  const [editAsignadoA, setEditAsignadoA] = useState<string>('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editCorreo, setEditCorreo] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [editComuna, setEditComuna] = useState('');
  const [editRegion, setEditRegion] = useState('');
  const [editRutError, setEditRutError] = useState('');

  // Activity Notes, Quotes & Opportunities
  const [notas, setNotas] = useState<NotaActividad[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [deliveryAccreditation, setDeliveryAccreditation] = useState<Record<string, boolean>>({});
  const [usuariosList, setUsuariosList] = useState<Usuario[]>([]);
  const [vendedorHistorico, setVendedorHistorico] = useState<{ id: string; nombre: string; usuario_id: string | null } | null>(null);
  const [eventosList, setEventosList] = useState<EventoProduccionLogistica[]>([]);
  const [actividadesOpList, setActividadesOpList] = useState<
    {
      id: string;
      contenido: string;
      created_at: string;
      usuario_nombre?: string;
      tipo: string;
      oportunidad_id: string;
      oportunidad_codigo: string;
      fecha_recordatorio?: string | null;
      hora_recordatorio?: string | null;
    }[]
  >([]);
  const [reclamosList, setReclamosList] = useState<{ id: string; contenido: string; created_at: string; usuario_nombre?: string; oportunidad_codigo?: string }[]>([]);

  // Modales
  const [previewCotizacion, setPreviewCotizacion] = useState<Cotizacion | null>(null);
  const [showCreateQuoteModal, setShowCreateQuoteModal] = useState(false);
  const [showCreateOpModal, setShowCreateOpModal] = useState(false);
  const [opTitulo, setOpTitulo] = useState('');
  const [opMonto, setOpMonto] = useState(1500000);
  const [opFechaLimite, setOpFechaLimite] = useState('');
  const [opOrigen, setOpOrigen] = useState('');
  const [opModalidadRequerimiento, setOpModalidadRequerimiento] = useState<'solo_material' | 'instalacion'>('instalacion');

  // Inline Note Creation Form
  const [nuevaNota, setNuevaNota] = useState('');
  const [tipoActividad, setTipoActividad] = useState<TipoNotaActividad>('nota');
  const [fechaRecordatorio, setFechaRecordatorio] = useState('');
  const [horaRecordatorio, setHoraRecordatorio] = useState('09:00');

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const [clientRes, nichosRes, usersRes] = await Promise.all([
          supabase.from('clientes').select('*').eq('id', clienteId).single(),
          supabase.from('campos_personalizados').select('opciones').eq('campo_supabase', 'nicho').maybeSingle(),
          supabase.from('usuarios').select('*').eq('activo', true).order('nombre', { ascending: true }),
        ]);

        if (ignore) return;
        if (usersRes.error) console.warn('Ficha cliente: no se cargaron los usuarios:', mensajeError(usersRes.error));
        if (nichosRes.error) console.warn('Ficha cliente: no se cargaron los nichos:', mensajeError(nichosRes.error));

        if (usersRes.data) {
          setUsuariosList(usersRes.data as Usuario[]);
        }

        if (nichosRes.data && nichosRes.data.opciones && nichosRes.data.opciones.length > 0) {
          setNichosOptions(nichosRes.data.opciones);
        }

        const clientData = clientRes.data;
        const clientErr = clientRes.error;

        let currentCli: Cliente | null = null;
        if (!clientErr && clientData) {
          currentCli = clientData as Cliente;
        } else {
          // Respaldo: la URL puede traer el RUT en vez del id; se busca solo ese cliente.
          const { data: porRut, error: clientsError } = await supabase.from('clientes').select('*').eq('rut', clienteId).limit(1);
          if (clientsError) throw clientsError;
          currentCli = ((porRut || [])[0] as Cliente | undefined) || null;
        }

        if (ignore || !currentCli) {
          if (!ignore) setLoading(false);
          return;
        }

        if (currentCli.vendedor_historico_id) {
          const { data: vendedor } = await supabase.from('trabajadores')
            .select('id, nombre, usuario_id').eq('id', currentCli.vendedor_historico_id).maybeSingle();
          if (!ignore) setVendedorHistorico(vendedor);
        } else if (!ignore) {
          setVendedorHistorico(null);
        }

        setCliente(currentCli);
        setEditNombre(currentCli.nombre || '');
        setEditRazon(currentCli.apellido_razon_social || currentCli.nombre || '');

        const rawRut = (currentCli.rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
        if (rawRut.length > 1) {
          setEditRutBody(rawRut.slice(0, -1));
          setEditRutDv(rawRut.slice(-1));
        } else {
          setEditRutBody(rawRut);
          setEditRutDv('');
        }

        setEditNicho(currentCli.nicho || 'Constructora B2B');
        setEditAsignadoA(currentCli.asignado_a || '');
        setEditTelefono(currentCli.telefono || '');
        setEditCorreo(currentCli.correo || '');
        setEditDireccion(currentCli.direccion || '');
        setEditComuna(currentCli.comuna || '');
        setEditRegion(currentCli.region || '');

        // 1. Fetch Notes
        const { data: notesData, error: notesError } = await supabase
          .from('notas_actividad')
          .select('*, usuario:usuarios(*)')
          .eq('cliente_id', currentCli.id)
          .order('fecha', { ascending: false });
        if (notesError) console.warn('Ficha cliente: no se cargaron las notas:', mensajeError(notesError));

        if (!ignore) {
          setNotas(notesData ? (notesData as NotaActividad[]) : []);
        }

        // 2. Fetch Quotes
        const { data: quotesData, error: quotesError } = await supabase
          .from('cotizaciones')
          .select('*, items:cotizacion_items(*)')
          .eq('cliente_id', currentCli.id)
          .order('created_at', { ascending: false });
        if (quotesError) console.warn('Ficha cliente: no se cargaron las cotizaciones:', mensajeError(quotesError));

        if (!ignore) {
          setCotizaciones(quotesData ? (quotesData as Cotizacion[]) : []);
        }

        // 3. Fetch Opportunities
        const { data: opData, error: opError } = await supabase
          .from('oportunidades')
          .select('*, cliente:clientes(*), cotizaciones:cotizaciones!cotizaciones_oportunidad_id_fkey(*)');
        if (opError) console.warn('Ficha cliente: no se cargaron las oportunidades:', mensajeError(opError));

        let matchedOps: OportunidadVenta[] = [];
        if (opData) {
          matchedOps = (opData as OportunidadVenta[]).filter(
            (o) =>
              o.cliente_id === currentCli.id ||
              (currentCli.rut && o.cliente?.rut === currentCli.rut) ||
              (currentCli.nombre && o.cliente?.nombre === currentCli.nombre)
          );
          const closedIds = matchedOps.filter((op) => ['prod_finalizado', 'rev_entregado'].includes(op.estado_pipeline)).map((op) => op.id);
          const { data: accreditationRows, error: accreditationError } = closedIds.length
            ? await supabase.rpc('estado_entrega_acreditada', { p_ventas: closedIds })
            : { data: [], error: null };
          if (accreditationError) console.warn('Ficha cliente: no se cargó la acreditación de entrega:', mensajeError(accreditationError));
          if (!ignore) setDeliveryAccreditation(Object.fromEntries(((accreditationRows || []) as { venta_id: string; acreditada: boolean }[]).map((row) => [row.venta_id, row.acreditada])));
          if (!ignore) setOportunidades(matchedOps);
        } else {
          if (!ignore) { setOportunidades([]); setDeliveryAccreditation({}); }
        }

        // 4. Fetch Events & Todas las Actividades Operativas / Comerciales de las Oportunidades
        const opIds = matchedOps.map((o) => o.id);
        if (opIds.length > 0) {
          const [evRes, actOpRes] = await Promise.all([
            supabase
              .from('eventos_produccion_logistica')
              .select('*, responsable:usuarios!responsable_id(*)')
              .in('oportunidad_id', opIds)
              .order('fecha_inicio', { ascending: false }),
            supabase
              .from('actividades_op')
              .select('id, contenido, created_at, usuario_nombre, tipo, oportunidad_id, fecha_recordatorio, hora_recordatorio')
              .in('oportunidad_id', opIds)
              .order('created_at', { ascending: false }),
          ]);
          if (evRes.error) console.warn('Ficha cliente: no se cargaron los eventos:', mensajeError(evRes.error));
          if (actOpRes.error) console.warn('Ficha cliente: no se cargó la actividad:', mensajeError(actOpRes.error));

          if (!ignore) {
            if (evRes.data) setEventosList(evRes.data as EventoProduccionLogistica[]);
            if (actOpRes.data) {
              const allOpActs = (actOpRes.data as OpActividadRow[]).map((r) => {
                const parentOp = matchedOps.find((o) => o.id === r.oportunidad_id);
                return {
                  id: r.id,
                  contenido: r.contenido,
                  created_at: r.created_at,
                  usuario_nombre: r.usuario_nombre,
                  tipo: r.tipo || 'comentario',
                  oportunidad_id: r.oportunidad_id,
                  oportunidad_codigo: parentOp?.codigo || 'OP',
                  fecha_recordatorio: r.fecha_recordatorio,
                  hora_recordatorio: r.hora_recordatorio,
                };
              });
              setActividadesOpList(allOpActs);
              setReclamosList(allOpActs.filter((r) => r.tipo === 'reclamo'));
            }
          }
        } else {
          if (!ignore) {
            setEventosList([]);
            setActividadesOpList([]);
            setReclamosList([]);
          }
        }

        if (!ignore) {
          setLoadError(null);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading client detail from Supabase:', mensajeError(err), err);
        if (!ignore) {
          setLoadError('No se pudo cargar la ficha del cliente. Reintenta más tarde.');
          setLoading(false);
        }
      }
    }

    loadData();

    const channel = supabase
      .channel(`realtime_client_detail_${clienteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notas_actividad' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizaciones' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos_produccion_logistica' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'actividades_op' }, () => loadData())
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, [clienteId, supabase]);

  // Handle Save Edited Client Information
  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditRutError('');
    if (!cliente) return;

    if (editRutBody.trim() || editRutDv.trim()) {
      const val = validarRutChileno(editRutBody, editRutDv);
      if (!val.valido) {
        setEditRutError(val.mensaje || 'RUT inválido.');
        return;
      }
    }

    const formattedRut = editRutBody.trim() ? `${editRutBody.replace(/[^0-9]/g, '')}-${editRutDv.trim().toUpperCase()}` : null;
    const rutNum = parseInt(editRutBody.replace(/[^0-9]/g, ''), 10);
    const tipoClienteCalculado: 'natural' | 'juridica' | null = formattedRut ? (rutNum >= 50000000 ? 'juridica' : 'natural') : null;

    const updatedData = {
      nombre: editNombre,
      apellido_razon_social: editRazon,
      rut: formattedRut,
      tipo_cliente: tipoClienteCalculado,
      nicho: editNicho,
      asignado_a: editAsignadoA || null,
      telefono: editTelefono,
      correo: editCorreo,
      direccion: editDireccion,
      comuna: editComuna,
      region: editRegion,
    };

    try {
      const { data, error } = await supabase
        .from('clientes')
        .update(updatedData)
        .eq('id', cliente.id)
        .select()
        .single();

      if (error) {
        console.error('Error actualizando cliente:', error);
        setEditRutError(mensajeError(error, 'No se pudo actualizar el RUT.'));
        return;
      }

      if (data) {
        setCliente(data as Cliente);
        setIsEditing(false);
        toast({ message: 'Información del cliente actualizada', tone: 'success' });
      }
    } catch (err) {
      console.error('Error saving client:', err);
    }
  };

  // Handle Add Note / Reminder
  const handleAddNota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaNota.trim() || !cliente) return;

    const newNotePayload = {
      cliente_id: cliente.id,
      usuario_id: (currentUser?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentUser.id))
        ? currentUser.id
        : null,
      contenido: nuevaNota.trim(),
      tipo_actividad: tipoActividad,
      fecha_recordatorio: tipoActividad === 'recordatorio' ? fechaRecordatorio : null,
      hora_recordatorio: tipoActividad === 'recordatorio' ? horaRecordatorio : null,
      fecha: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabase
        .from('notas_actividad')
        .insert([newNotePayload])
        .select('*, usuario:usuarios(*)')
        .single();

      if (error) {
        console.error('Error inserting note:', error);
        return;
      }

      if (data) {
        setNotas([data as NotaActividad, ...notas]);
        toast({ message: tipoActividad === 'recordatorio' ? 'Recordatorio programado' : 'Nota guardada', tone: 'success' });
      }

      if (tipoActividad === 'recordatorio') {
        const fechaRecordatorioFormateada = fechaRecordatorio
          ? formatSantiagoDateTime(fechaRecordatorio, horaRecordatorio)
          : '';
        const notifPayload = {
          usuario_id: currentUser?.id || 'usr-admin-01',
          mensaje: `Recordatorio (${cliente.nombre}): ${nuevaNota}${fechaRecordatorioFormateada ? ` - Fecha: ${fechaRecordatorioFormateada}` : ''}`,
          tipo: 'asignacion',
          leido: false,
          entidad_relacionada: 'clientes',
          fecha: new Date().toISOString(),
        };
        await supabase.from('notificaciones').insert([notifPayload]);
      }
    } catch (err) {
      console.error('Error creating note:', err);
    }

    setNuevaNota('');
    setFechaRecordatorio('');
    setTipoActividad('nota');
  };

  // Metrics
  const oportunidadesPagadas = oportunidades.filter((op) => {
    const totalVal = totalComercial(op, op.cotizaciones || []);
    const abonadoVal = totalAbonado(op);
    return totalVal > 0 && abonadoVal >= totalVal;
  });

  const ventasAcumuladas100 = oportunidadesPagadas.reduce((sum, op) => {
    const totalVal = totalComercial(op, op.cotizaciones || []);
    return sum + Number(totalVal);
  }, 0);

  const saldoPendienteTotal = oportunidades.reduce((sum, op) => {
    const totalVal = totalComercial(op, op.cotizaciones || []);
    const abonadoVal = totalAbonado(op);
    const pend = Math.max(0, totalVal - abonadoVal);
    return sum + pend;
  }, 0);

  const eventosActivosCount = eventosList.filter((e) =>
    ['por_hacer', 'en_curso', 'reprogramado'].includes(e.estado)
  ).length;
  const eventosCompletadosCount = eventosList.filter((e) => e.estado === 'completado').length;

  const montoFacturadoObras = oportunidades
    .filter((op) => op.tipo_venta === 'Instalación' || op.tipo_venta === 'Obra')
    .reduce((sum, op) => {
      return sum + totalComercial(op, op.cotizaciones || []);
    }, 0);

  const diffDaysList: number[] = [];
  oportunidades.forEach((op) => {
    const vigente = cotizacionVigente(op, op.cotizaciones || []);
    const cotAprobada = vigente?.estado === 'aprobada' ? vigente : undefined;
    if (
      cotAprobada &&
      cotAprobada.fecha_aprobacion &&
      Array.isArray(op.comprobantes_pago) &&
      op.comprobantes_pago.length > 0
    ) {
      const aprobDate = new Date(cotAprobada.fecha_aprobacion).getTime();
      op.comprobantes_pago.forEach((abono) => {
        const abonoDateStr = abono.fecha_iso;
        if (!abonoDateStr) return;
        const abonoDate = new Date(abonoDateStr).getTime();
        if (!isNaN(aprobDate) && !isNaN(abonoDate) && abonoDate >= aprobDate) {
          const days = Math.round((abonoDate - aprobDate) / (1000 * 3600 * 24));
          diffDaysList.push(days);
        }
      });
    }
  });

  const diasPromedioPago =
    diffDaysList.length > 0 ? Math.round(diffDaysList.reduce((a, b) => a + b, 0) / diffDaysList.length) : null;

  const candidateActivities: {
    titulo: string;
    fecha: string;
    hora?: string;
    dateObj: Date;
    esVencida: boolean;
  }[] = [];

  const ahora = new Date();

  eventosList.forEach((ev) => {
    if (ev.estado !== 'completado' && ev.estado !== 'no_realizado') {
      const d = new Date(ev.fecha_inicio || ev.fecha_evento || '');
      if (!isNaN(d.getTime())) {
        candidateActivities.push({
          titulo: `${ev.titulo} (${ev.tipo_evento})`,
          fecha: d.toISOString().split('T')[0],
          hora: ev.hora_evento || undefined,
          dateObj: d,
          esVencida: d.getTime() < ahora.getTime() && d.toDateString() !== ahora.toDateString(),
        });
      }
    }
  });

  notas.forEach((n) => {
    if (n.tipo_actividad === 'recordatorio' && n.fecha_recordatorio) {
      const d = buildReminderDate(n.fecha_recordatorio, n.hora_recordatorio);
      if (!isNaN(d.getTime())) {
        candidateActivities.push({
          titulo: `Recordatorio: ${n.contenido.slice(0, 30)}...`,
          fecha: n.fecha_recordatorio,
          hora: n.hora_recordatorio || undefined,
          dateObj: d,
          esVencida: d.getTime() < ahora.getTime(),
        });
      }
    }
  });

  candidateActivities.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  const proximaActividad = candidateActivities[0] || null;

  const unifiedTimeline = [
    ...notas.map((n) => ({
      id: `cli-${n.id}`,
      origen: 'cliente' as const,
      tipo: n.tipo_actividad || 'nota',
      contenido: n.contenido,
      fecha: n.fecha,
      usuario_nombre: n.usuario?.nombre || n.autor_historico || 'Sistema',
      fecha_recordatorio: n.fecha_recordatorio,
      hora_recordatorio: n.hora_recordatorio,
      oportunidad_id: undefined as string | undefined,
      oportunidad_codigo: undefined as string | undefined,
    })),
    ...actividadesOpList.map((a) => ({
      id: `op-${a.id}`,
      origen: 'oportunidad' as const,
      tipo: a.tipo || 'comentario',
      contenido: a.contenido,
      fecha: a.created_at,
      usuario_nombre: a.usuario_nombre || 'Sistema',
      fecha_recordatorio: a.fecha_recordatorio,
      hora_recordatorio: a.hora_recordatorio,
      oportunidad_id: a.oportunidad_id,
      oportunidad_codigo: a.oportunidad_codigo,
    })),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const q = busqueda.trim().toLowerCase();
  const coincide = (...campos: (string | null | undefined)[]) =>
    !q || campos.some((c) => (c || '').toLowerCase().includes(q));

  const filteredTimeline = unifiedTimeline.filter((item) => {
    if (!coincide(item.contenido, item.usuario_nombre, item.oportunidad_codigo, item.tipo)) return false;
    if (filtroActividadTipo === 'todos') return true;
    if (filtroActividadTipo === 'oportunidades') return item.origen === 'oportunidad';
    return item.tipo === filtroActividadTipo;
  });
  const notasFiltradas = notas.filter((n) => coincide(n.contenido, n.usuario?.nombre, n.autor_historico));
  const reclamosFiltrados = reclamosList.filter((r) => coincide(r.contenido, r.oportunidad_codigo, r.usuario_nombre));

  if (loading) {
    return (
      <div className="py-16 text-center">
        <p className="t-caption text-ink-muted">Cargando la ficha del cliente...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-panel border border-danger-line bg-danger-soft p-5 text-sm text-danger">
        <p className="font-semibold">{loadError}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-2 text-xs font-semibold underline">
          Reintentar
        </button>
      </div>
    );
  }

  if (!cliente) {
    return (
      <EmptyState
        title="Cliente no encontrado"
        description="No se encontró ningún registro para el identificador seleccionado."
        action={
          <Link href="/clientes">
            <Button variant="primary">Volver al directorio de clientes</Button>
          </Link>
        }
      />
    );
  }

  const tabItems = [
    { id: 'actividad', label: 'Actividad', count: unifiedTimeline.length },
    { id: 'notas', label: 'Notas', count: notas.length },
    { id: 'reclamos', label: 'Reclamos', count: reclamosList.length },
    { id: 'metricas', label: 'Resumen', count: undefined as number | undefined },
  ];

  return (
    <div className="space-y-4 pb-12">
      {/* Record Layout: Perfil (izquierda) | Pestañas de gestión (centro) | Asociados (derecha) */}
      <RecordLayout
        sidebar={
          <Panel>
            <div className="p-4 space-y-4">
              <button
                type="button"
                onClick={volverDesdeFicha}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
              >
                <ArrowLeft size={15} aria-hidden />
                <span>Volver</span>
              </button>

              {/* Perfil resumido */}
              <div className="flex flex-col items-center text-center space-y-2">
                <div
                  aria-hidden
                  className="grid h-16 w-16 place-items-center rounded-full border border-accent-line bg-accent-soft text-xl font-semibold text-accent-ink select-none"
                >
                  <UserRound size={30} aria-hidden />
                </div>
                <div className="min-w-0 max-w-full">
                  <h2 className="t-section text-ink truncate">{cliente.nombre}</h2>
                  <p className="t-caption text-ink-muted truncate">{cliente.apellido_razon_social || cliente.nombre}</p>
                  <div className="mt-1">
                    <CodeStamp>{cliente.rut || 'Sin RUT'}</CodeStamp>
                  </div>
                </div>
              </div>

              {/* Acciones rápidas */}
              <div className="grid grid-cols-4 gap-1 text-center">
                {[
                  { label: 'Nota', icon: MessageSquare, onClick: () => setActiveTab('notas') },
                  { label: 'Venta', icon: TrendingUp, onClick: () => setShowCreateOpModal(true) },
                  { label: 'Cotizar', icon: FileText, onClick: () => setShowCreateQuoteModal(true) },
                  { label: 'Editar', icon: Edit, onClick: () => setIsEditing(true) },
                ].map(({ label, icon: Icon, onClick }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={onClick}
                    className="group flex flex-col items-center gap-1 text-ink-muted transition-colors hover:text-ink"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface transition-colors group-hover:bg-surface-muted">
                      <Icon size={16} aria-hidden />
                    </span>
                    <span className="t-micro font-semibold">{label}</span>
                  </button>
                ))}
              </div>

              {/* Datos del cliente */}
              <div className="-mx-4 border-t border-line-subtle" />

              <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <span className="t-caption text-ink-muted block">Nicho</span>
                    <Select
                      value={cliente.nicho || nichosOptions[0] || 'Constructora B2B'}
                      onChange={async (e) => {
                        const newN = e.target.value;
                        setCliente({ ...cliente, nicho: newN });
                        try {
                          await supabase.from('clientes').update({ nicho: newN }).eq('id', cliente.id);
                          toast({ message: 'Nicho actualizado', tone: 'success' });
                        } catch (err) {
                          console.error('Error updating nicho:', err);
                        }
                      }}
                      className="hg-field-compact w-full"
                    >
                      {nichosOptions.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <span className="t-caption text-ink-muted block">Ejecutivo</span>
                    <Select
                      value={cliente.asignado_a || ''}
                      onChange={async (e) => {
                        const newUid = e.target.value || null;
                        setCliente({ ...cliente, asignado_a: newUid });
                        try {
                          await supabase.from('clientes').update({ asignado_a: newUid }).eq('id', cliente.id);
                          toast({ message: 'Ejecutivo asignado', tone: 'success' });
                        } catch (err) {
                          console.error('Error updating asignado_a on cliente:', err);
                        }
                      }}
                      className="hg-field-compact w-full"
                    >
                      <option value="">-- Sin asignar --</option>
                      {usuariosList.map((u) => (
                        <option key={u.id} value={u.id}>{u.nombre}</option>
                      ))}
                    </Select>
                  </div>
                  {vendedorHistorico && (
                    <div className="space-y-1">
                      <span className="t-caption text-ink-muted block">Vendedor de origen</span>
                      <Link href={`/rrhh/${vendedorHistorico.id}`} className="font-semibold text-ink hover:text-accent-ink">
                        {vendedorHistorico.nombre}{!vendedorHistorico.usuario_id && ' · Sin cuenta CRM'}
                      </Link>
                    </div>
                  )}
                <div className="border-t border-line-subtle pt-3 space-y-3">
                  <div>
                    <span className="t-caption text-ink-muted block">Teléfono de contacto</span>
                    <span className="font-semibold text-ink inline-flex items-center gap-1.5 mt-0.5">
                      <Phone size={13} className="text-ink-muted" aria-hidden />
                      {cliente.telefono || 'No registrado'}
                    </span>
                  </div>
                  {cliente.telefonos_secundarios && cliente.telefonos_secundarios.length > 0 && (
                    <div>
                      <span className="t-caption text-ink-muted block">Teléfonos adicionales</span>
                      <span className="font-semibold text-ink block mt-0.5">
                        {cliente.telefonos_secundarios.join(', ')}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="t-caption text-ink-muted block">Correo electrónico</span>
                    <span className="font-semibold text-ink truncate block mt-0.5">
                      <Mail size={13} className="inline mr-1 text-ink-muted" aria-hidden />
                      {cliente.correo || 'No registrado'}
                    </span>
                  </div>
                  {cliente.correos_secundarios && cliente.correos_secundarios.length > 0 && (
                    <div>
                      <span className="t-caption text-ink-muted block">Correos secundarios</span>
                      <span className="text-ink-muted font-mono block mt-0.5">
                        {cliente.correos_secundarios.join(', ')}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="t-caption text-ink-muted block">Dirección de despacho</span>
                    <span className="font-semibold text-ink block mt-0.5">
                      <MapPin size={13} className="inline mr-1 text-ink-muted" aria-hidden />
                      {cliente.direccion || 'No registrada'}
                    </span>
                  </div>
                  <div>
                    <span className="t-caption text-ink-muted block">Comuna / Región</span>
                    <span className="font-semibold text-ink block mt-0.5">
                      {[cliente.comuna, cliente.region].filter(Boolean).join(', ') || 'No registrada'}
                    </span>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => setIsEditing(true)}
                  >
                    Editar contacto
                  </Button>
                </div>
              </div>
            </div>
          </Panel>
        }
        aside={
          <div className="hg-panel divide-y divide-line-subtle">
            <AsideSection title="Oportunidades" count={oportunidades.length} open={asideOpen.op} onToggle={() => toggleAside('op')}>
              <div className="space-y-2.5">
                {oportunidades.length === 0 ? (
                  <p className="t-caption text-ink-muted text-center py-4">Sin oportunidades registradas</p>
                ) : (
                  oportunidades.map((op) => {
                    const montoDisplay = totalComercial(op, op.cotizaciones || []);
                    const stageInfo = STAGE_CONFIG[op.estado_pipeline] || {
                      label: op.estado_pipeline || 'Sin etapa',
                      area: 'General',
                      tone: 'neutral' as Tone,
                    };
                    const closeWithoutEvidence =
                      ['prod_finalizado', 'rev_entregado'].includes(op.estado_pipeline) &&
                      deliveryAccreditation[op.id] !== true;

                    return (
                      <div
                        key={op.id}
                        className="rounded-control border border-line bg-surface p-3 space-y-2 hover:bg-surface-muted transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="t-num font-bold text-sm text-ink block">
                              ${montoDisplay.toLocaleString('es-CL')} CLP
                            </span>
                            <div className="mt-0.5">
                              <CodeStamp>{op.codigo}</CodeStamp>
                            </div>
                          </div>
                          <StatusBadge tone={closeWithoutEvidence ? 'warning' : stageInfo.tone}>
                            {closeWithoutEvidence ? 'Sin acreditación' : stageInfo.label}
                          </StatusBadge>
                        </div>

                        {/* Riel de Obra Mini */}
                        <div className="pt-1">
                          <StageRail current={getEtapaObraIndex(op.estado_pipeline)} size="mini" />
                        </div>

                        <div className="flex items-center justify-between text-xs text-ink-muted pt-1 border-t border-line-subtle">
                          <span className="inline-flex items-center gap-1 t-num">
                            <Clock size={12} aria-hidden />
                            {op.fecha_limite || 'Sin fecha límite'}
                          </span>
                          <Link
                            href={`/ventas?oportunidad=${op.id}`}
                            className="inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline"
                          >
                            <span>Ver venta</span>
                            <ExternalLink size={12} aria-hidden />
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </AsideSection>

            <AsideSection title="Cotizaciones" count={cotizaciones.length} open={asideOpen.cot} onToggle={() => toggleAside('cot')}>
              <div className="space-y-2.5">
                {cotizaciones.length === 0 ? (
                  <p className="t-caption text-ink-muted text-center py-4">Sin cotizaciones registradas</p>
                ) : (
                  cotizaciones.map((cot) => (
                    <div
                      key={cot.id}
                      className="rounded-control border border-line bg-surface p-2.5 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <CodeStamp>{cot.numero_cotizacion}</CodeStamp>
                          <span className="t-caption text-ink-muted font-mono">v{cot.version || 1}</span>
                        </div>
                        <span className="t-num font-bold text-ink">
                          ${cot.monto_total?.toLocaleString('es-CL')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <StatusBadge
                          tone={
                            cot.estado === 'aprobada' ? 'success' : cot.estado === 'rechazada' ? 'danger' : 'neutral'
                          }
                        >
                          {cot.estado}
                        </StatusBadge>
                        <Button
                          variant="subtle"
                          size="sm"
                          icon={Eye}
                          onClick={() => setPreviewCotizacion(cot)}
                        >
                          PDF
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </AsideSection>

            <AsideSection title="Obras y despachos" count={eventosList.length} open={asideOpen.obras} onToggle={() => toggleAside('obras')}>
              <div className="space-y-2.5">
                {eventosList.length === 0 ? (
                  <p className="t-caption text-ink-muted text-center py-4">Sin eventos programados</p>
                ) : (
                  eventosList.slice(0, 4).map((ev) => (
                    <div key={ev.id} className="rounded-control border border-line bg-surface p-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink truncate max-w-[160px]">{ev.titulo}</span>
                        <StatusBadge tone={ev.estado === 'completado' ? 'success' : 'neutral'}>
                          {ev.estado.replace(/_/g, ' ')}
                        </StatusBadge>
                      </div>
                      <div className="flex items-center justify-between text-ink-muted t-num">
                        <span>{ev.fecha_inicio?.split('T')[0] || ev.fecha_evento}</span>
                        <span className="truncate max-w-[120px]">{ev.responsable?.nombre || 'Sin responsable'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </AsideSection>
          </div>
        }
      >
        {/* PANEL CENTRAL: buscador, pestañas y contenido */}
        <div className="space-y-4">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              type="search"
              aria-label="Buscar en la ficha"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en actividad, notas y reclamos..."
              className="hg-field-compact min-h-9 w-full pl-9"
            />
          </div>

          <div
            role="tablist"
            aria-label="Secciones de la ficha"
            className="flex w-full items-center gap-0.5 rounded-xl bg-surface-muted p-1"
          >
            {tabItems.map((item) => {
              const selected = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(item.id as typeof activeTab)}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-center text-xs font-semibold transition-colors ${
                    selected ? 'bg-surface text-ink shadow-[var(--hg-shadow-card)]' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {item.label}
                  {item.count !== undefined && <span className="t-num text-[11px] font-medium text-ink-muted">{item.count}</span>}
                </button>
              );
            })}
          </div>

          {(activeTab === 'actividad' || activeTab === 'notas') && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {activeTab === 'actividad' ? (
                <div className="relative">
                  <Select
                    aria-label="Filtrar actividad"
                    value={filtroActividadTipo}
                    onChange={(e) => setFiltroActividadTipo(e.target.value)}
                    className="hg-field-compact min-h-8"
                  >
                    <option value="todos">Toda la actividad ({unifiedTimeline.length})</option>
                    <option value="oportunidades">Bitácora de oportunidades ({actividadesOpList.length})</option>
                    <option value="nota">Notas generales</option>
                    <option value="reunion">Reuniones</option>
                    <option value="llamada">Llamadas telefónicas</option>
                    <option value="recordatorio">Recordatorios</option>
                    <option value="seguimiento">Seguimientos comerciales</option>
                  </Select>
                </div>
              ) : (
                <span />
              )}
              <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowNotaDialog(true)}>
                Nueva nota
              </Button>
            </div>
          )}

          {/* PESTAÑA 1: ACTIVIDAD UNIFICADA (CLIENTE + OPORTUNIDADES) */}
          {activeTab === 'actividad' && (() => {
            const esRecordatorio = (n: (typeof filteredTimeline)[number]) => n.tipo === 'recordatorio' || n.tipo === 'seguimiento';
            const pendientes = filteredTimeline.filter(esRecordatorio);
            const historial = filteredTimeline.filter((n) => !esRecordatorio(n));
            const renderItem = (n: (typeof filteredTimeline)[number]) => {
              const isReminder = esRecordatorio(n);
              const Icon = isReminder ? Bell : n.tipo === 'llamada' ? PhoneCall : n.tipo === 'reunion' ? UserCheck : FileCheck;
              const tono = isReminder
                ? 'bg-warning-soft text-warning'
                : n.tipo === 'llamada'
                  ? 'bg-info-soft text-info'
                  : n.tipo === 'reunion'
                    ? 'bg-success-soft text-success'
                    : 'bg-accent-soft text-accent-ink';
              return (
                <article key={n.id} className="rounded-xl border border-line bg-surface p-3.5">
                  <div className="flex items-start gap-3">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tono}`}>
                      <Icon size={15} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <p className="text-xs text-ink">
                          <span className="font-semibold capitalize">{n.tipo}</span>{' '}
                          <span className="text-ink-muted">por {n.usuario_nombre}</span>
                        </p>
                        <span className="t-caption t-num inline-flex items-center gap-1">
                          <Calendar size={12} aria-hidden />
                          {formatSantiagoDateTime(n.fecha)}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-ink-muted">{n.contenido}</p>
                      {n.oportunidad_id && n.oportunidad_codigo && (
                        <Link href={`/ventas?oportunidad=${n.oportunidad_id}`} title="Abrir oportunidad en Ventas" className="inline-block">
                          <CodeStamp>{n.oportunidad_codigo}</CodeStamp>
                        </Link>
                      )}
                      {n.fecha_recordatorio && (
                        <p className="t-caption font-semibold text-warning">
                          Recordatorio: {formatSantiagoDateTime(n.fecha_recordatorio, n.hora_recordatorio)}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            };

            if (filteredTimeline.length === 0) {
              return (
                <EmptyState
                  icon={MessageSquare}
                  title="Sin actividades registradas"
                  description="No hay notas ni registros que coincidan con la búsqueda o el filtro."
                  action={
                    <Button variant="secondary" size="sm" onClick={() => setShowNotaDialog(true)}>
                      Crear una nota
                    </Button>
                  }
                />
              );
            }
            return (
              <div className="space-y-5">
                {pendientes.length > 0 && (
                  <section className="space-y-2.5">
                    <h3 className="text-xs font-semibold text-ink">Próximos recordatorios</h3>
                    {pendientes.map(renderItem)}
                  </section>
                )}
                {historial.length > 0 && (
                  <section className="space-y-2.5">
                    <h3 className="text-xs font-semibold text-ink">Historial de actividad</h3>
                    {historial.map(renderItem)}
                  </section>
                )}
              </div>
            );
          })()}

          {/* PESTAÑA 2: NOTAS */}
          {activeTab === 'notas' && (
            <div className="space-y-2.5">
              {notasFiltradas.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  title="Sin notas"
                  description="Aún no hay notas que coincidan con la búsqueda."
                />
              ) : (
                notasFiltradas.map((n) => (
                  <article key={n.id} className="rounded-xl border border-line bg-surface p-3.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-ink">{n.usuario?.nombre || n.autor_historico || 'Sistema'}</span>
                      <span className="t-caption t-num">{new Date(n.fecha).toLocaleDateString('es-CL')}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-ink-muted">{n.contenido}</p>
                  </article>
                ))
              )}
            </div>
          )}

          {/* PESTAÑA 3: RECLAMOS Y POSTVENTA */}
          {activeTab === 'reclamos' && (
            <div className="space-y-2.5">
              {reclamosFiltrados.length === 0 ? (
                <EmptyState
                  icon={AlertTriangle}
                  title="Sin reclamos abiertos"
                  description="No se registran incidencias ni casos de postventa para este cliente."
                />
              ) : (
                reclamosFiltrados.map((rec) => (
                  <article key={rec.id} className="rounded-xl border border-danger-line bg-danger-soft/40 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs">
                        <CodeStamp>{rec.oportunidad_codigo}</CodeStamp>
                        <span className="text-ink-muted">por {rec.usuario_nombre || 'Ejecutivo'}</span>
                      </div>
                      <span className="t-caption t-num">{new Date(rec.created_at).toLocaleDateString('es-CL')}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-ink">{rec.contenido}</p>
                  </article>
                ))
              )}
            </div>
          )}

          {/* PESTAÑA 4: RESUMEN */}
          {activeTab === 'metricas' && (
            <div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-surface p-4 space-y-1.5">
                    <span className="flex items-center gap-1.5 t-caption"><span aria-hidden className="h-2 w-2 rounded-full bg-success" />Ventas acumuladas (100% pagadas)</span>
                    <span className="t-num block text-xl font-semibold text-ink">${ventasAcumuladas100.toLocaleString('es-CL')} CLP</span>
                    <span className="t-caption block">{oportunidadesPagadas.length} {oportunidadesPagadas.length === 1 ? 'oportunidad pagada' : 'oportunidades pagadas'}</span>
                  </div>
                  <div className="rounded-xl border border-line bg-surface p-4 space-y-1.5">
                    <span className="flex items-center gap-1.5 t-caption"><span aria-hidden className="h-2 w-2 rounded-full bg-warning" />Saldo pendiente por cobrar</span>
                    <span className="t-num block text-xl font-semibold text-ink">${saldoPendienteTotal.toLocaleString('es-CL')} CLP</span>
                    <span className="t-caption block">En oportunidades comerciales activas</span>
                  </div>
                  <div className="rounded-xl border border-line bg-surface p-4 space-y-1.5">
                    <span className="flex items-center gap-1.5 t-caption"><span aria-hidden className="h-2 w-2 rounded-full bg-info" />Obras y logística activas</span>
                    <span className="t-num block text-xl font-semibold text-ink">{eventosActivosCount} <span className="text-xs font-normal text-ink-muted">eventos en curso</span></span>
                    <span className="t-caption block">{eventosCompletadosCount} eventos completados</span>
                  </div>
                  <div className="rounded-xl border border-line bg-surface p-4 space-y-1.5">
                    <span className="flex items-center gap-1.5 t-caption"><span aria-hidden className="h-2 w-2 rounded-full bg-accent" />Facturado en obras / montaje</span>
                    <span className="t-num block text-xl font-semibold text-ink">${montoFacturadoObras.toLocaleString('es-CL')} CLP</span>
                    <span className="t-caption block">Instalación y montaje en terreno</span>
                  </div>
                  <div className="rounded-xl border border-line bg-surface p-4 space-y-1.5">
                    <span className="flex items-center gap-1.5 t-caption"><span aria-hidden className="h-2 w-2 rounded-full bg-ink-muted" />Días promedio de pago</span>
                    <span className="t-num block text-xl font-semibold text-ink">{diasPromedioPago !== null ? `${diasPromedioPago} días` : '—'}</span>
                    <span className="t-caption block">Entre aprobación y primer abono</span>
                  </div>
                  <div className="rounded-xl border border-line bg-surface p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="t-caption font-semibold text-ink block">Próxima actividad</span>
                      {proximaActividad?.esVencida && (
                        <StatusBadge tone="danger">Vencida</StatusBadge>
                      )}
                    </div>
                    {proximaActividad ? (
                      <>
                        <span className="font-semibold text-ink block truncate">{proximaActividad.titulo}</span>
                        <span className="t-caption font-mono text-ink-muted t-num block">{proximaActividad.fecha}</span>
                      </>
                    ) : (
                      <span className="t-caption text-ink-muted italic">Sin actividades pendientes</span>
                    )}
                  </div>
            </div>
            {currentUser?.rol === 'admin' && (
              <ClienteCentroCostos clienteId={cliente.id} oportunidades={oportunidades} />
            )}
            </div>
          )}
        </div>
      </RecordLayout>

      {/* DIÁLOGO: NUEVA NOTA / RECORDATORIO */}
      <Dialog
        open={showNotaDialog}
        onClose={() => setShowNotaDialog(false)}
        title="Nueva nota"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNotaDialog(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-nueva-nota" variant="primary" icon={Send}>
              {tipoActividad === 'recordatorio' ? 'Guardar recordatorio' : 'Guardar nota'}
            </Button>
          </>
        }
      >
        <form
          id="form-nueva-nota"
          onSubmit={async (e) => {
            await handleAddNota(e);
            setShowNotaDialog(false);
          }}
          className="space-y-3"
        >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block t-caption font-semibold text-ink mb-1">Tipo de actividad</label>
                      <Select
                        value={tipoActividad}
                        onChange={(e) => setTipoActividad(e.target.value as TipoNotaActividad)}
                        className="hg-field-compact w-full"
                      >
                        <option value="nota">Nota general</option>
                        <option value="reunion">Reunión con cliente</option>
                        <option value="llamada">Llamada telefónica</option>
                        <option value="recordatorio">Recordatorio programado</option>
                      </Select>
                    </div>

                    {tipoActividad === 'recordatorio' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block t-caption font-semibold text-ink mb-1 flex items-center gap-1">
                            <Calendar size={13} className="text-warning" aria-hidden />
                            <span>Fecha *</span>
                          </label>
                          <DateInput
                            required
                            value={fechaRecordatorio}
                            onChange={(e) => setFechaRecordatorio(e.target.value)}
                            className="hg-field text-xs"
                          />
                        </div>
                        <div>
                          <label className="block t-caption font-semibold text-ink mb-1 flex items-center gap-1">
                            <Clock size={13} className="text-warning" aria-hidden />
                            <span>Hora *</span>
                          </label>
                          <input
                            type="time"
                            required
                            value={horaRecordatorio}
                            onChange={(e) => setHoraRecordatorio(e.target.value)}
                            className="hg-field text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <textarea
                      rows={3}
                      required
                      value={nuevaNota}
                      onChange={(e) => setNuevaNota(e.target.value)}
                      placeholder={
                        tipoActividad === 'recordatorio'
                          ? 'Escribe el detalle del recordatorio...'
                          : 'Escribe el detalle de la reunión, llamada o nota...'
                      }
                      className="hg-field text-xs p-3 leading-relaxed"
                    />
                  </div>

        </form>
      </Dialog>

      {/* DIÁLOGO: EDICIÓN COMPLETA DEL CLIENTE */}
      <Dialog
        open={isEditing}
        onClose={() => setIsEditing(false)}
        title="Editar información del cliente"
        size="lg"
      >
        <form onSubmit={handleSaveClient} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Nombre comercial *</label>
              <input
                type="text"
                required
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
                className="hg-field"
              />
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Razón social *</label>
              <input
                type="text"
                required
                value={editRazon}
                onChange={(e) => setEditRazon(e.target.value)}
                className="hg-field"
              />
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">RUT (opcional)</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={editRutBody}
                  onChange={(e) => setEditRutBody(e.target.value)}
                  placeholder="12345678"
                  className="hg-field flex-1 font-mono"
                />
                <span className="font-semibold text-ink-muted">-</span>
                <input
                  type="text"
                  maxLength={1}
                  value={editRutDv}
                  onChange={(e) => setEditRutDv(e.target.value.toUpperCase())}
                  placeholder="K"
                  className="hg-field w-12 text-center font-mono font-bold"
                />
              </div>
              {editRutError && <span className="t-micro text-danger font-semibold block mt-1">{editRutError}</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Nicho</label>
              <Select
                value={editNicho}
                onChange={(e) => setEditNicho(e.target.value)}
                className="hg-field font-semibold"
              >
                {nichosOptions.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Ejecutivo asignado</label>
              <Select
                value={editAsignadoA}
                onChange={(e) => setEditAsignadoA(e.target.value)}
                className="hg-field font-semibold"
              >
                <option value="">-- Sin asignar --</option>
                {usuariosList.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Teléfono</label>
              <input
                type="text"
                value={editTelefono}
                onChange={(e) => setEditTelefono(e.target.value)}
                className="hg-field"
              />
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Correo electrónico</label>
              <input
                type="email"
                value={editCorreo}
                onChange={(e) => setEditCorreo(e.target.value)}
                className="hg-field"
              />
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Dirección de despacho</label>
              <input
                type="text"
                value={editDireccion}
                onChange={(e) => setEditDireccion(e.target.value)}
                className="hg-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Región</label>
              <SearchableSelect
                value={editRegion}
                onChange={(val) => {
                  setEditRegion(val);
                  setEditComuna('');
                }}
                options={REGIONES_CHILE.map((r) => r.region)}
                placeholder="Seleccionar región..."
              />
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Comuna</label>
              <SearchableSelect
                value={editComuna}
                onChange={(val) => setEditComuna(val)}
                options={
                  editRegion
                    ? (REGIONES_CHILE.find((r) => r.region === editRegion)?.comunas || TODAS_COMUNAS_CHILE)
                    : TODAS_COMUNAS_CHILE
                }
                placeholder="Seleccionar comuna..."
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-line-subtle">
            <Button variant="secondary" onClick={() => setIsEditing(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" icon={Save}>
              Guardar cambios
            </Button>
          </div>
        </form>
      </Dialog>

      {/* DIÁLOGO: CREAR OPORTUNIDAD */}
      <Dialog
        open={showCreateOpModal}
        onClose={() => setShowCreateOpModal(false)}
        title="Nueva oportunidad de venta"
        description={`Crear una orden de venta asociada a ${cliente.nombre}.`}
        size="md"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!opTitulo.trim() || !cliente) return;
            try {
              const now = new Date();
              const year = now.getFullYear();
              const rnd = Math.floor(100 + Math.random() * 900);
              const newCode = `OP-${year}-${rnd}`;

              const newOp = {
                codigo: newCode,
                titulo: opTitulo.trim(),
                cliente_id: cliente.id,
                estado_pipeline: 'nueva',
                monto_estimado: opMonto,
                fecha_inicio: now.toISOString().split('T')[0],
                fecha_limite: opFechaLimite || null,
                tipo_venta: opTipoVenta,
                origen: opOrigen.trim() || null,
                modalidad_requerimiento: opModalidadRequerimiento,
                prioridad: 'normal',
                asignado_a: cliente.asignado_a || null,
              };

              const { data, error } = await supabase
                .from('oportunidades')
                .insert([newOp])
                .select('*, cliente:clientes(*)')
                .single();

              if (error) throw error;
              if (data) {
                setOportunidades([data as OportunidadVenta, ...oportunidades]);
                setShowCreateOpModal(false);
                setOpTitulo('');
                setOpOrigen('');
                setOpTipoVenta('Instalación');
                setOpModalidadRequerimiento('instalacion');
                toast({ message: `Oportunidad ${newCode} creada`, tone: 'success' });
              }
            } catch (err) {
              console.error('Error creating opportunity:', err);
            }
          }}
          className="space-y-3 text-xs"
        >
          <div>
            <label className="block t-caption font-semibold text-ink mb-1">Título del proyecto *</label>
            <input
              type="text"
              required
              placeholder="Ej: Suministro de Bloques de Vidrio Edificio Central"
              value={opTitulo}
              onChange={(e) => setOpTitulo(e.target.value)}
              className="hg-field"
            />
          </div>

          <div>
            <label className="block t-caption font-semibold text-ink mb-1">Tipo de venta</label>
            <Select
              value={opTipoVenta}
              onChange={(e) => setOpTipoVenta(e.target.value)}
              className="hg-field"
            >
              {tiposVenta.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block t-caption font-semibold text-ink mb-1">Monto estimado ($ CLP)</label>
            <input
              type="number"
              min={0}
              value={opMonto}
              onChange={(e) => setOpMonto(Number(e.target.value))}
              className="hg-field font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Origen</label>
              <input
                type="text"
                placeholder="Ej: WhatsApp, referido, web..."
                value={opOrigen}
                onChange={(e) => setOpOrigen(e.target.value)}
                className="hg-field"
              />
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Modalidad</label>
              <Select
                value={opModalidadRequerimiento}
                onChange={(e) => setOpModalidadRequerimiento(e.target.value as 'solo_material' | 'instalacion')}
                className="hg-field font-semibold"
              >
                <option value="solo_material">Sólo material</option>
                <option value="instalacion">Instalación</option>
              </Select>
            </div>
          </div>

          <div>
            <label className="block t-caption font-semibold text-ink mb-1">Fecha límite de cierre</label>
            <DateInput
              value={opFechaLimite}
              onChange={(e) => setOpFechaLimite(e.target.value)}
              className="hg-field"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-line-subtle">
            <Button variant="secondary" onClick={() => setShowCreateOpModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" icon={Plus}>
              Crear oportunidad
            </Button>
          </div>
        </form>
      </Dialog>

      {/* MODAL POPUP PARA PREVISUALIZAR PDF DE COTIZACIÓN */}
      {previewCotizacion && (
        <PdfPreviewModal
          cotizacion={previewCotizacion}
          onClose={() => setPreviewCotizacion(null)}
        />
      )}

      {/* MODAL PARA CREAR COTIZACIÓN */}
      {showCreateQuoteModal && (
        <CotizacionModal
          isOpen={showCreateQuoteModal}
          onClose={() => setShowCreateQuoteModal(false)}
          clienteIdInicial={cliente.id}
          oportunidadIdInicial={oportunidades[0]?.id}
          onSuccess={() => {
            setShowCreateQuoteModal(false);
          }}
        />
      )}
    </div>
  );
}
