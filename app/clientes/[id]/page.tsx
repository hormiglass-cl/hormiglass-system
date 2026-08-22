'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../../lib/supabase/client';
import { useAuth } from '../../../lib/context/AuthContext';
import {
  Cliente,
  NotaActividad,
  Cotizacion,
  TipoNotaActividad,
  OportunidadVenta,
  PRODUCTOS_HORMIGLASS,
  Usuario,
  EventoProduccionLogistica,
} from '../../../lib/types';
import { PdfPreviewModal } from '../../../components/PdfPreviewModal';
import { CotizacionModal } from '../../../components/CotizacionModal';
import { SearchableSelect } from '../../../components/SearchableSelect';
import { REGIONES_CHILE, TODAS_COMUNAS_CHILE } from '../../../lib/chile-data';
import { logSistema } from '../../../lib/logger';

const NICHOS_CLIENTE_DEFAULT = [
  'Constructora B2B',
  'Inmobiliaria',
  'Contratista General',
  'Particular',
  'Distribuidor',
];

type ReclamoActividadRow = {
  id: string;
  contenido: string;
  created_at: string;
  usuario_nombre?: string;
  oportunidad_id: string;
};

import {
  ArrowLeft,
  Building,
  FileText,
  MessageSquare,
  Send,
  UserCheck,
  Edit,
  Save,
  X,
  CheckCircle,
  CheckCircle2,
  Bell,
  PhoneCall,
  Calendar,
  Eye,
  FileCheck,
  TrendingUp,
  Clock,
  Plus,
  DollarSign,
  Package,
  HardHat,
  AlertTriangle,
  Truck,
  RotateCcw,
  MapPin,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Filter,
} from 'lucide-react';

const STAGE_CONFIG: Record<string, { label: string; area: string; step: number; totalSteps: number; bg: string; text: string; border: string }> = {
  nueva: { label: 'Nueva oportunidad', area: 'Comercial y ventas', step: 1, totalSteps: 3, bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300' },
  pagada: { label: 'Pago validado', area: 'Comercial y ventas', step: 2, totalSteps: 3, bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-300' },
  entregada: { label: 'Venta cerrada', area: 'Comercial y ventas', step: 3, totalSteps: 3, bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300' },

  prod_pendiente: { label: 'Pendiente planificación', area: 'Producción y logística', step: 1, totalSteps: 6, bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300' },
  prod_cola: { label: 'En cola de fabricación', area: 'Producción y logística', step: 2, totalSteps: 6, bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-300' },
  prod_fabricacion: { label: 'En fabricación', area: 'Producción y logística', step: 3, totalSteps: 6, bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-300' },
  prod_listo_instalacion: { label: 'Listo p/ instalación', area: 'Producción y logística', step: 4, totalSteps: 6, bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-300' },
  prod_instalacion: { label: 'En instalación', area: 'Producción y logística', step: 5, totalSteps: 6, bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-300' },
  prod_finalizado: { label: 'Finalizado / entregado', area: 'Producción y logística', step: 6, totalSteps: 6, bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300' },

  rev_coordinacion: { label: 'Coordinación proveedor', area: 'Reventa y logística', step: 1, totalSteps: 6, bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-300' },
  rev_stock: { label: 'Confirmación stock', area: 'Reventa y logística', step: 2, totalSteps: 6, bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-300' },
  rev_listo_retiro: { label: 'Listo para retiro', area: 'Reventa y logística', step: 3, totalSteps: 6, bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300' },
  rev_listo_despacho: { label: 'Listo para despacho', area: 'Reventa y logística', step: 4, totalSteps: 6, bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-300' },
  rev_entregado: { label: 'Entregado al cliente', area: 'Reventa y logística', step: 5, totalSteps: 6, bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300' },
  rev_postventa: { label: 'Postventa & seguimiento', area: 'Reventa y logística', step: 6, totalSteps: 6, bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-300' },

  programada: { label: 'En programación', area: 'Legacy', step: 3, totalSteps: 5, bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-300' },
  en_fabricacion: { label: 'En fabricación', area: 'Legacy', step: 4, totalSteps: 5, bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-300' },
  lista_despacho: { label: 'Listo para despacho', area: 'Legacy', step: 4, totalSteps: 5, bg: 'bg-cyan-50', text: 'text-cyan-800', border: 'border-cyan-300' },
  instalacion: { label: 'En instalación', area: 'Legacy', step: 4, totalSteps: 5, bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-300' },
  venta_cerrada: { label: 'Venta cerrada', area: 'Legacy', step: 5, totalSteps: 5, bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300' },
};

export default function ClienteDetailPage() {
  const params = useParams();
  const { currentUser } = useAuth();
  const clienteId = params.id as string;
  const supabase = createClient();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [nichosOptions, setNichosOptions] = useState<string[]>(NICHOS_CLIENTE_DEFAULT);

  // Tab and view state
  const [activeTab, setActiveTab] = useState<'actividad' | 'notas' | 'reclamos' | 'metricas'>('actividad');
  const [filtroActividadTipo, setFiltroActividadTipo] = useState<string>('todos');
  const [isContactInfoExpanded, setIsContactInfoExpanded] = useState(true);

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
  const [editTipoVenta, setEditTipoVenta] = useState('Instalación');
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
  const [usuariosList, setUsuariosList] = useState<Usuario[]>([]);
  const [eventosList, setEventosList] = useState<EventoProduccionLogistica[]>([]);
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
          // Fallback lookup
          const { data: allClis } = await supabase.from('clientes').select('*');
          if (allClis && allClis.length > 0) {
            currentCli = (allClis as Cliente[]).find((c) => c.id === clienteId || c.rut === clienteId) || allClis[0] as Cliente;
          }
        }

        if (ignore || !currentCli) {
          if (!ignore) setLoading(false);
          return;
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
        setEditTipoVenta(currentCli.tipo_venta || 'Instalación');
        setEditAsignadoA(currentCli.asignado_a || '');
        setEditTelefono(currentCli.telefono || '');
        setEditCorreo(currentCli.correo || '');
        setEditDireccion(currentCli.direccion || '');
        setEditComuna(currentCli.comuna || '');
        setEditRegion(currentCli.region || '');

        // 1. Fetch Notes
        const { data: notesData } = await supabase
          .from('notas_actividad')
          .select('*, usuario:usuarios(*)')
          .eq('cliente_id', currentCli.id)
          .order('fecha', { ascending: false });

        if (!ignore) {
          setNotas(notesData ? (notesData as NotaActividad[]) : []);
        }

        // 2. Fetch Quotes
        const { data: quotesData } = await supabase
          .from('cotizaciones')
          .select('*, items:cotizacion_items(*)')
          .eq('cliente_id', currentCli.id)
          .order('created_at', { ascending: false });

        if (!ignore) {
          setCotizaciones(quotesData ? (quotesData as Cotizacion[]) : []);
        }

        // 3. Fetch Opportunities
        const { data: opData } = await supabase
          .from('oportunidades')
          .select('*, cliente:clientes(*), cotizaciones(*)');

        let matchedOps: OportunidadVenta[] = [];
        if (opData) {
          matchedOps = (opData as OportunidadVenta[]).filter(
            (o) =>
              o.cliente_id === currentCli.id ||
              (currentCli.rut && o.cliente?.rut === currentCli.rut) ||
              (currentCli.nombre && o.cliente?.nombre === currentCli.nombre)
          );
          if (!ignore) setOportunidades(matchedOps);
        } else {
          if (!ignore) setOportunidades([]);
        }

        // 4. Fetch Events & Reclamos for these opportunities
        const opIds = matchedOps.map((o) => o.id);
        if (opIds.length > 0) {
          const [evRes, reclamosRes] = await Promise.all([
            supabase
              .from('eventos_produccion_logistica')
              .select('*, responsable:usuarios!responsable_id(*)')
              .in('oportunidad_id', opIds)
              .order('fecha_inicio', { ascending: false }),
            supabase
              .from('actividades_op')
              .select('id, contenido, created_at, usuario_nombre, tipo, oportunidad_id')
              .in('oportunidad_id', opIds)
              .eq('tipo', 'reclamo')
              .order('created_at', { ascending: false }),
          ]);

          if (!ignore) {
            if (evRes.data) setEventosList(evRes.data as EventoProduccionLogistica[]);
            if (reclamosRes.data) {
              const mappedReclamos = (reclamosRes.data as ReclamoActividadRow[]).map((r) => {
                const parentOp = matchedOps.find((o) => o.id === r.oportunidad_id);
                return {
                  id: r.id,
                  contenido: r.contenido,
                  created_at: r.created_at,
                  usuario_nombre: r.usuario_nombre,
                  oportunidad_codigo: parentOp?.codigo || 'OP',
                };
              });
              setReclamosList(mappedReclamos);
            }
          }
        } else {
          if (!ignore) {
            setEventosList([]);
            setReclamosList([]);
          }
        }

        if (!ignore) setLoading(false);
      } catch (err) {
        console.error('Error loading client detail from Supabase:', err);
        if (!ignore) setLoading(false);
      }
    }

    loadData();

    // Supabase Realtime channel subscription
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
  }, [clienteId]);

  // Handle Save Edited Client Information
  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditRutError('');
    if (!cliente) return;

    const val = validarRutChileno(editRutBody, editRutDv);
    if (!val.valido) {
      setEditRutError(val.mensaje || 'RUT inválido.');
      return;
    }

    const formattedRut = `${editRutBody.replace(/[^0-9]/g, '')}-${editRutDv.trim().toUpperCase()}`;
    const rutNum = parseInt(editRutBody.replace(/[^0-9]/g, ''), 10);
    const tipoClienteCalculado: 'natural' | 'juridica' = rutNum >= 50000000 ? 'juridica' : 'natural';

    const updatedData = {
      nombre: editNombre,
      apellido_razon_social: editRazon,
      rut: formattedRut,
      tipo_cliente: tipoClienteCalculado,
      nicho: editNicho,
      tipo_venta: editTipoVenta,
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
        setEditRutError(`Error: ${error.message}`);
        return;
      }

      if (data) {
        setCliente(data as Cliente);
        setIsEditing(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
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
      }

      if (tipoActividad === 'recordatorio') {
        const notifPayload = {
          usuario_id: currentUser?.id || 'usr-admin-01',
          mensaje: `Recordatorio (${cliente.nombre}): ${nuevaNota}${fechaRecordatorio ? ` - Fecha: ${fechaRecordatorio} a las ${horaRecordatorio}` : ''}`,
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

  // ===== MÉTRICAS CONSOLIDADAS DE LA FICHA DE CLIENTE (Sin Cotizaciones Abiertas) =====
  // 1. Ventas acumuladas 100% pagadas
  const oportunidadesPagadas = oportunidades.filter((op) => {
    const aprobada = op.cotizaciones?.find((c) => c.estado === 'aprobada');
    const totalVal = aprobada?.monto_total || op.cotizacion_actual?.monto_total || op.monto_estimado || 0;
    const abonadoVal = Number(op.monto_abonado || 0);
    return totalVal > 0 && abonadoVal >= totalVal;
  });

  const ventasAcumuladas100 = oportunidadesPagadas.reduce((sum, op) => {
    const aprobada = op.cotizaciones?.find((c) => c.estado === 'aprobada');
    const totalVal = aprobada?.monto_total || op.cotizacion_actual?.monto_total || op.monto_estimado || 0;
    return sum + Number(totalVal);
  }, 0);

  // 2. Saldo pendiente total
  const saldoPendienteTotal = oportunidades.reduce((sum, op) => {
    const aprobada = op.cotizaciones?.find((c) => c.estado === 'aprobada');
    const totalVal = aprobada?.monto_total || op.cotizacion_actual?.monto_total || op.monto_estimado || 0;
    const abonadoVal = Number(op.monto_abonado || 0);
    const pend = Math.max(0, totalVal - abonadoVal);
    return sum + pend;
  }, 0);

  // 3. Obras / Producción / Logística activas
  const eventosActivosCount = eventosList.filter((e) =>
    ['por_hacer', 'en_curso', 'reprogramado'].includes(e.estado)
  ).length;
  const eventosCompletadosCount = eventosList.filter((e) => e.estado === 'completado').length;

  // 4. Última oportunidad
  const sortedOps = [...oportunidades].sort(
    (a, b) =>
      new Date(b.created_at || b.fecha_inicio || '').getTime() -
      new Date(a.created_at || a.fecha_inicio || '').getTime()
  );
  const ultimaOportunidad = sortedOps[0] || null;

  // 5. Monto facturado en obras
  const montoFacturadoObras = oportunidades
    .filter((op) => op.tipo_venta === 'Instalación' || op.tipo_venta === 'Obra')
    .reduce((sum, op) => {
      const aprobada = op.cotizaciones?.find((c) => c.estado === 'aprobada');
      return sum + Number(aprobada?.monto_total || 0);
    }, 0);

  // 6. Días promedio de pago
  const diffDaysList: number[] = [];
  oportunidades.forEach((op) => {
    const cotAprobada = op.cotizaciones?.find((c) => c.estado === 'aprobada' && c.fecha_aprobacion);
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

  // 7. Próxima actividad
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
      const d = new Date(`${n.fecha_recordatorio}T${n.hora_recordatorio || '09:00'}:00`);
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

  // Helper for Client Initials Avatar
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  // Helper for filtered activities timeline
  const filteredNotas = notas.filter((n) => {
    if (filtroActividadTipo === 'todos') return true;
    return n.tipo_actividad === filtroActividadTipo;
  });

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-500 font-medium">
        Cargando la ficha del cliente...
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="p-12 text-center text-red-500 font-bold space-y-4">
        <p>Cliente no encontrado.</p>
        <Link href="/clientes" className="text-sm underline text-[#F7931F]">
          Volver a la lista de clientes
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-[#363636] animate-fadeIn pb-12">
      {/* Botón Volver & Notificación de Éxito */}
      <div className="flex items-center justify-between">
        <Link
          href="/clientes"
          className="text-xs text-gray-500 hover:text-[#F7931F] font-bold flex items-center gap-1 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al directorio de clientes</span>
        </Link>

        {saveSuccess && (
          <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 font-bold animate-fadeIn">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Información actualizada exitosamente</span>
          </div>
        )}
      </div>

      {/* MODAL DE EDICIÓN COMPLETA */}
      {isEditing && (
        <div className="bg-orange-50/70 p-6 rounded-3xl border border-orange-200 shadow-md space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-orange-200 pb-3">
            <h3 className="font-extrabold text-base text-[#363636] flex items-center gap-2">
              <Edit className="w-5 h-5 text-[#F7931F]" />
              <span>Editar información del cliente</span>
            </h3>
            <button
              onClick={() => setIsEditing(false)}
              className="p-1.5 hover:bg-orange-100 rounded-xl text-gray-500 hover:text-gray-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveClient} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nombre fantasía / comercial *</label>
                <input
                  type="text"
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Razón social *</label>
                <input
                  type="text"
                  required
                  value={editRazon}
                  onChange={(e) => setEditRazon(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">RUT empresa o persona *</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={editRutBody}
                    onChange={(e) => setEditRutBody(e.target.value)}
                    placeholder="12345678"
                    className="flex-1 bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-mono focus:outline-none focus:border-[#F7931F]"
                  />
                  <span className="font-bold text-gray-400">-</span>
                  <input
                    type="text"
                    required
                    maxLength={1}
                    value={editRutDv}
                    onChange={(e) => setEditRutDv(e.target.value.toUpperCase())}
                    placeholder="K"
                    className="w-12 text-center bg-white border border-gray-300 rounded-xl px-2 py-2 text-[#363636] font-mono font-bold focus:outline-none focus:border-[#F7931F]"
                  />
                </div>
                {editRutError && <span className="text-[10px] text-red-600 font-bold block mt-1">{editRutError}</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nicho de mercado</label>
                <select
                  value={editNicho}
                  onChange={(e) => setEditNicho(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                >
                  {nichosOptions.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Tipo de venta habitual</label>
                <select
                  value={editTipoVenta}
                  onChange={(e) => setEditTipoVenta(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                >
                  <option value="Instalación">Instalación</option>
                  <option value="Suministro">Suministro</option>
                  <option value="Reventa de Material">Reventa de Material</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Ejecutivo asignado</label>
                <select
                  value={editAsignadoA}
                  onChange={(e) => setEditAsignadoA(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                >
                  <option value="">-- Sin asignar --</option>
                  {usuariosList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Teléfono</label>
                <input
                  type="text"
                  value={editTelefono}
                  onChange={(e) => setEditTelefono(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Correo electrónico</label>
                <input
                  type="email"
                  value={editCorreo}
                  onChange={(e) => setEditCorreo(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Dirección de despacho</label>
                <input
                  type="text"
                  value={editDireccion}
                  onChange={(e) => setEditDireccion(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Región</label>
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
                <label className="block font-bold text-gray-700 mb-1">Comuna</label>
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

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#F7931F] hover:bg-[#e08316] text-white rounded-xl font-extrabold transition shadow-md flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Guardar cambios</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== LAYOUT HUBSPOT EN 3 COLUMNAS MODULARES ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* ========================================================= */}
        {/* COLUMNA 1: PERFIL DEL CLIENTE & CONTACTO (~28% width)   */}
        {/* ========================================================= */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-4">
            {/* Avatar Grande con Iniciales & Nombre */}
            <div className="flex flex-col items-center text-center space-y-2 pt-2">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-white font-black text-xl flex items-center justify-center shadow-md">
                  {getInitials(cliente.nombre)}
                </div>
                <button
                  onClick={() => setIsEditing(true)}
                  className="absolute bottom-0 right-0 p-1.5 bg-white hover:bg-gray-100 rounded-full border border-gray-200 shadow-xs text-gray-600 hover:text-[#F7931F] transition"
                  title="Editar cliente"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <h1 className="text-lg font-black text-[#363636] leading-tight">{cliente.nombre}</h1>
                <p className="text-xs text-gray-500 mt-0.5">{cliente.apellido_razon_social || cliente.nombre}</p>
                <p className="text-xs font-mono font-bold text-gray-600 mt-0.5">{cliente.rut}</p>
              </div>
            </div>

            {/* Badges de Atributos Clave con Nombre Propio y tamaño estándar */}
            <div className="space-y-3 pt-3 border-t border-gray-100 text-xs">
              {/* Nicho */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-gray-500 shrink-0">Nicho:</span>
                <select
                  value={cliente.nicho || nichosOptions[0] || 'Constructora B2B'}
                  onChange={async (e) => {
                    const newN = e.target.value;
                    setCliente({ ...cliente, nicho: newN });
                    try {
                      const { error } = await supabase.from('clientes').update({ nicho: newN }).eq('id', cliente.id);
                      if (error) console.error('Error updating nicho:', error);
                    } catch (err) {
                      console.error('Error updating nicho:', err);
                    }
                  }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-orange-50 text-[#F7931F] border border-orange-200 focus:outline-none focus:ring-1 focus:ring-[#F7931F] cursor-pointer min-w-[150px] truncate"
                >
                  {nichosOptions.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              {/* Tipo de Venta */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-gray-500 shrink-0">Tipo de venta:</span>
                <select
                  value={cliente.tipo_venta || 'Instalación'}
                  onChange={async (e) => {
                    const newTipo = e.target.value;
                    setCliente({ ...cliente, tipo_venta: newTipo });
                    try {
                      const { error } = await supabase.from('clientes').update({ tipo_venta: newTipo }).eq('id', cliente.id);
                      if (error) console.error('Error updating tipo_venta:', error);
                    } catch (err) {
                      console.error('Error updating tipo_venta:', err);
                    }
                  }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-purple-50 text-purple-900 border border-purple-200 focus:outline-none focus:ring-1 focus:ring-purple-400 cursor-pointer min-w-[150px] truncate"
                >
                  <option value="Instalación">Instalación</option>
                  <option value="Suministro">Suministro</option>
                  <option value="Reventa de Material">Reventa de Material</option>
                </select>
              </div>

              {/* Ejecutivo Asignado (Persistencia Corregida a asignado_a) */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-gray-500 shrink-0">Ejecutivo:</span>
                <select
                  value={cliente.asignado_a || ''}
                  onChange={async (e) => {
                    const newUid = e.target.value || null;
                    setCliente({ ...cliente, asignado_a: newUid });
                    try {
                      const { error } = await supabase.from('clientes').update({ asignado_a: newUid }).eq('id', cliente.id);
                      if (error) console.error('Error updating asignado_a on cliente:', error);
                    } catch (err) {
                      console.error('Error updating asignado_a on cliente:', err);
                    }
                  }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-50 text-blue-900 border border-blue-200 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer min-w-[150px] truncate"
                >
                  <option value="">-- Sin asignar --</option>
                  {usuariosList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Fila de Botones de Acción Rápida (Sin Email ni Llamar) */}
            <div className="pt-3 border-t border-gray-100">
              <div className="grid grid-cols-3 gap-2 text-center">
                <button
                  type="button"
                  onClick={() => setActiveTab('notas')}
                  className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-gray-50 hover:bg-orange-50 hover:text-[#F7931F] text-gray-700 transition group border border-gray-200 shadow-2xs cursor-pointer"
                  title="Crear nota o recordatorio"
                >
                  <MessageSquare className="w-4 h-4 mb-1 text-[#F7931F] group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold">Nota</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCreateOpModal(true)}
                  className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-gray-50 hover:bg-orange-50 hover:text-[#F7931F] text-gray-700 transition group border border-gray-200 shadow-2xs cursor-pointer"
                  title="Crear oportunidad"
                >
                  <TrendingUp className="w-4 h-4 mb-1 text-[#F7931F] group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold">Oportunidad</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCreateQuoteModal(true)}
                  className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-gray-50 hover:bg-orange-50 hover:text-[#F7931F] text-gray-700 transition group border border-gray-200 shadow-2xs cursor-pointer"
                  title="Crear cotización"
                >
                  <FileText className="w-4 h-4 mb-1 text-[#F7931F] group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold">Cotización</span>
                </button>
              </div>
            </div>

            {/* Acordeón Información de Contacto */}
            <div className="pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsContactInfoExpanded(!isContactInfoExpanded)}
                className="w-full flex items-center justify-between text-xs font-black text-[#363636] hover:text-[#F7931F] transition py-1"
              >
                <span className="flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-[#F7931F]" />
                  <span>Información de contacto</span>
                </span>
                {isContactInfoExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {isContactInfoExpanded && (
                <div className="space-y-3 pt-2 text-xs text-gray-700 animate-fadeIn">
                  <div>
                    <span className="text-gray-400 text-xs block font-semibold">Teléfono de contacto</span>
                    <span className="font-bold text-[#363636] text-xs">{cliente.telefono || 'No registrado'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs block font-semibold">Correo electrónico</span>
                    <span className="font-bold text-[#363636] text-xs truncate block">{cliente.correo || 'No registrado'}</span>
                  </div>
                  {cliente.correos_secundarios && cliente.correos_secundarios.length > 0 && (
                    <div>
                      <span className="text-gray-400 text-xs block font-semibold">Correos secundarios</span>
                      <span className="font-mono text-gray-600 text-xs block">{cliente.correos_secundarios.join(', ')}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-400 text-xs block font-semibold">Dirección de despacho</span>
                    <span className="font-bold text-[#363636] text-xs block">{cliente.direccion || 'No registrada'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs block font-semibold">Comuna / Región</span>
                    <span className="font-bold text-[#363636] text-xs block">
                      {[cliente.comuna, cliente.region].filter(Boolean).join(', ') || 'No registrada'}
                    </span>
                  </div>

                  <button
                    onClick={() => setIsEditing(true)}
                    className="w-full text-center py-2 bg-gray-50 hover:bg-orange-50 text-[#F7931F] font-bold text-xs rounded-xl border border-orange-200 transition mt-2 cursor-pointer"
                  >
                    Editar datos de contacto
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* COLUMNA 2: PESTAÑAS Y ACTIVIDAD CENTRAL (~44% width)     */}
        {/* ========================================================= */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Header de Pestañas estilo Minimalista */}
            <div className="flex items-center border-b border-gray-200 px-4 pt-2 bg-gray-50/50 gap-2 overflow-x-auto text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('actividad')}
                className={`pb-3 px-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'actividad'
                    ? 'border-[#F7931F] text-[#F7931F] font-extrabold'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Actividad</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono font-bold">
                  {notas.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('notas')}
                className={`pb-3 px-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'notas'
                    ? 'border-[#F7931F] text-[#F7931F] font-extrabold'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Notas & recordatorios</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('reclamos')}
                className={`pb-3 px-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'reclamos'
                    ? 'border-red-500 text-red-600 font-extrabold'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span>Reclamos / postventa</span>
                {reclamosList.length > 0 && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                    {reclamosList.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('metricas')}
                className={`pb-3 px-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'metricas'
                    ? 'border-[#F7931F] text-[#F7931F] font-extrabold'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>Resumen & métricas</span>
              </button>
            </div>

            {/* CONTENIDO DE CADA PESTAÑA */}
            <div className="p-5 space-y-4">
              
              {/* PESTAÑA 1: TIMELINE DE ACTIVIDAD */}
              {activeTab === 'actividad' && (
                <div className="space-y-4">
                  {/* Filtro de Actividad */}
                  <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3 text-xs">
                    <div className="flex items-center gap-1.5 text-gray-500">
                      <Filter className="w-4 h-4 text-gray-400" />
                      <span className="font-semibold text-xs">Filtrar por:</span>
                    </div>
                    <select
                      value={filtroActividadTipo}
                      onChange={(e) => setFiltroActividadTipo(e.target.value)}
                      className="text-xs font-semibold bg-gray-50 border border-gray-300 rounded-xl px-3 py-1.5 text-[#363636] focus:outline-none focus:border-[#F7931F] cursor-pointer"
                    >
                      <option value="todos">Toda la actividad ({notas.length})</option>
                      <option value="nota">Notas generales</option>
                      <option value="reunion">Reuniones</option>
                      <option value="llamada">Llamadas telefónicas</option>
                      <option value="recordatorio">Recordatorios</option>
                    </select>
                  </div>

                  {/* Lista Cronológica */}
                  <div className="space-y-3">
                    {filteredNotas.length === 0 ? (
                      <div className="p-8 text-center text-gray-400 text-xs italic">
                        No hay actividades registradas con este filtro.
                      </div>
                    ) : (
                      filteredNotas.map((n) => {
                        const isReminder = n.tipo_actividad === 'recordatorio';
                        return (
                          <div
                            key={n.id}
                            className={`p-3.5 rounded-2xl border space-y-2 ${
                              isReminder ? 'bg-amber-50/60 border-amber-200' : 'bg-gray-50 border-gray-200'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                {isReminder ? (
                                  <Bell className="w-4 h-4 text-amber-600" />
                                ) : n.tipo_actividad === 'llamada' ? (
                                  <PhoneCall className="w-4 h-4 text-blue-600" />
                                ) : n.tipo_actividad === 'reunion' ? (
                                  <UserCheck className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <FileCheck className="w-4 h-4 text-[#F7931F]" />
                                )}
                                <span className="font-extrabold text-[#363636] text-xs">{n.usuario?.nombre || 'Usuario CRM'}</span>
                                <span className="text-xs text-[#363636] bg-white font-bold px-2 py-0.5 rounded-full capitalize border border-gray-200">
                                  {n.tipo_actividad || 'nota'}
                                </span>
                              </div>
                              <span className="text-xs text-gray-500 font-mono">
                                {new Date(n.fecha).toLocaleDateString('es-CL', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>

                            <p className="text-xs text-[#363636] leading-relaxed pl-3 border-l-2 border-[#F7931F]">
                              {n.contenido}
                            </p>

                            {n.fecha_recordatorio && (
                              <p className="text-xs text-amber-800 font-bold pt-0.5">
                                Recordatorio: {n.fecha_recordatorio} a las {n.hora_recordatorio || '09:00'}
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* PESTAÑA 2: NOTAS & RECORDATORIOS */}
              {activeTab === 'notas' && (
                <div className="space-y-4">
                  {/* Formulario Agregar Nota / Recordatorio */}
                  <form onSubmit={handleAddNota} className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block font-bold text-gray-700 mb-1">Tipo de actividad</label>
                        <select
                          value={tipoActividad}
                          onChange={(e) => setTipoActividad(e.target.value as TipoNotaActividad)}
                          className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                        >
                          <option value="nota">Nota general</option>
                          <option value="reunion">Reunión con cliente</option>
                          <option value="llamada">Llamada telefónica</option>
                          <option value="recordatorio">Recordatorio in-app</option>
                        </select>
                      </div>

                      {tipoActividad === 'recordatorio' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block font-bold text-amber-800 mb-1 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-amber-600" />
                              <span>Fecha *</span>
                            </label>
                            <input
                              type="date"
                              required
                              value={fechaRecordatorio}
                              onChange={(e) => setFechaRecordatorio(e.target.value)}
                              className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-amber-800 mb-1 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              <span>Hora *</span>
                            </label>
                            <input
                              type="time"
                              required
                              value={horaRecordatorio}
                              onChange={(e) => setHoraRecordatorio(e.target.value)}
                              className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
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
                            : 'Escribe el detalle de la reunión o llamada...'
                        }
                        className="w-full bg-white border border-gray-300 rounded-xl p-3 text-xs text-[#363636] placeholder-gray-400 focus:outline-none focus:border-[#F7931F] font-medium"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold text-xs px-4 py-2 rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                        <span>{tipoActividad === 'recordatorio' ? 'Guardar recordatorio' : 'Guardar nota'}</span>
                      </button>
                    </div>
                  </form>

                  {/* Lista de notas */}
                  <div className="space-y-3">
                    {notas.map((n) => (
                      <div key={n.id} className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 text-xs space-y-1.5">
                        <div className="flex justify-between items-center text-gray-500 text-xs">
                          <span className="font-bold text-[#363636]">{n.usuario?.nombre || 'Usuario CRM'}</span>
                          <span className="font-mono text-gray-400">{new Date(n.fecha).toLocaleDateString('es-CL')}</span>
                        </div>
                        <p className="text-gray-700 leading-relaxed">{n.contenido}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PESTAÑA 3: RECLAMOS & POSTVENTA */}
              {activeTab === 'reclamos' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2 text-xs">
                    <span className="font-extrabold text-red-600 flex items-center gap-1.5 text-xs">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Reclamos e incidencias registradas</span>
                    </span>
                    <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                      {reclamosList.length} {reclamosList.length === 1 ? 'reclamo' : 'reclamos'}
                    </span>
                  </div>

                  {reclamosList.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-xs italic bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      Sin reclamos ni incidencias abiertas para este cliente.
                    </div>
                  ) : (
                    reclamosList.map((rec) => (
                      <div key={rec.id} className="p-3.5 bg-red-50/70 rounded-2xl border border-red-200 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold font-mono text-red-800">{rec.oportunidad_codigo}</span>
                            <span className="text-gray-600 font-medium">· Por {rec.usuario_nombre || 'Vendedor'}</span>
                          </div>
                          <span className="font-mono text-gray-400 text-xs">
                            {new Date(rec.created_at).toLocaleDateString('es-CL')}
                          </span>
                        </div>
                        <p className="text-red-950 font-medium leading-relaxed">{rec.contenido}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* PESTAÑA 4: RESUMEN & MÉTRICAS (SIN KPI DE COTIZACIONES ABIERTAS) */}
              {activeTab === 'metricas' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 font-bold border-b border-gray-100 pb-2">
                    Métricas consolidadas de rendimiento comercial y operativo
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* 1. Ventas Acumuladas 100% */}
                    <div className="p-3.5 bg-emerald-50/60 rounded-2xl border border-emerald-200 space-y-1">
                      <span className="text-xs font-bold text-emerald-800 block">Ventas acumuladas (100%)</span>
                      <span className="text-base font-black text-emerald-700 block">
                        ${ventasAcumuladas100.toLocaleString('es-CL')} CLP
                      </span>
                      <span className="text-xs text-gray-500 block">
                        {oportunidadesPagadas.length} {oportunidadesPagadas.length === 1 ? 'oportunidad pagada' : 'oportunidades pagadas'}
                      </span>
                    </div>

                    {/* 2. Saldo Pendiente */}
                    <div className="p-3.5 bg-amber-50/60 rounded-2xl border border-amber-200 space-y-1">
                      <span className="text-xs font-bold text-amber-800 block">Saldo pendiente</span>
                      <span className="text-base font-black text-amber-700 block">
                        ${saldoPendienteTotal.toLocaleString('es-CL')} CLP
                      </span>
                      <span className="text-xs text-gray-500 block">Por cobrar en oportunidades activas</span>
                    </div>

                    {/* 3. Obras & Logística Activas */}
                    <div className="p-3.5 bg-blue-50/60 rounded-2xl border border-blue-200 space-y-1">
                      <span className="text-xs font-bold text-blue-800 block">Obras & logística activas</span>
                      <span className="text-base font-black text-blue-700 block">
                        {eventosActivosCount} <span className="text-xs font-normal">eventos en curso</span>
                      </span>
                      <span className="text-xs text-gray-500 block">{eventosCompletadosCount} eventos completados</span>
                    </div>

                    {/* 4. Facturado en Obras */}
                    <div className="p-3.5 bg-purple-50/60 rounded-2xl border border-purple-200 space-y-1">
                      <span className="text-xs font-bold text-purple-800 block">Facturado en obras</span>
                      <span className="text-base font-black text-purple-700 block">
                        ${montoFacturadoObras.toLocaleString('es-CL')} CLP
                      </span>
                      <span className="text-xs text-gray-500 block">Instalación y montaje en terreno</span>
                    </div>

                    {/* 5. Días Promedio de Pago */}
                    <div className="p-3.5 bg-indigo-50/60 rounded-2xl border border-indigo-200 space-y-1">
                      <span className="text-xs font-bold text-indigo-800 block">Días promedio de pago</span>
                      <span className="text-base font-black text-indigo-700 block">
                        {diasPromedioPago !== null ? `${diasPromedioPago} días` : '—'}
                      </span>
                      <span className="text-xs text-gray-500 block">Entre aprobación y primer abono</span>
                    </div>

                    {/* 6. Próxima Actividad */}
                    <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-600 block">Próxima actividad</span>
                        {proximaActividad?.esVencida && (
                          <span className="bg-red-500 text-white font-black text-[10px] px-1.5 py-0.2 rounded uppercase">
                            Vencida
                          </span>
                        )}
                      </div>
                      {proximaActividad ? (
                        <>
                          <span className="text-xs font-black text-[#363636] block truncate">{proximaActividad.titulo}</span>
                          <span className="text-xs font-mono text-gray-400 block">{proximaActividad.fecha}</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Sin actividades pendientes</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* COLUMNA 3: ASOCIADOS / DEALS & COTIZACIONES (~28% width) */}
        {/* ========================================================= */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* SECCIÓN 1: OPORTUNIDADES DE VENTA (DEALS) */}
          <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <h3 className="font-extrabold text-xs text-[#363636] flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-[#F7931F]" />
                <span>Oportunidades ({oportunidades.length})</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateOpModal(true)}
                className="text-xs font-extrabold text-[#F7931F] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar</span>
              </button>
            </div>

            {oportunidades.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-2">Sin oportunidades registradas.</p>
            ) : (
              <div className="space-y-2.5">
                {oportunidades.map((op) => {
                  const cotAprob = op.cotizaciones?.find((c) => c.estado === 'aprobada');
                  const montoDisplay = cotAprob?.monto_total || op.cotizacion_actual?.monto_total || op.monto_estimado || 0;
                  const stageInfo = STAGE_CONFIG[op.estado_pipeline] || {
                    ...STAGE_CONFIG.nueva,
                    label: op.estado_pipeline || 'Sin etapa',
                    area: 'Sin área definida',
                  };

                  return (
                    <div
                      key={op.id}
                      className="p-3.5 bg-gray-50 hover:bg-orange-50/50 rounded-2xl border border-gray-200 text-xs space-y-2 transition group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-black text-sm text-[#363636] group-hover:text-[#F7931F] transition block">
                            ${montoDisplay.toLocaleString('es-CL')} CLP
                          </span>
                          <span className="font-mono text-xs text-gray-500 font-bold block mt-0.5">{op.codigo}</span>
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${stageInfo.bg} ${stageInfo.text} ${stageInfo.border}`}>
                          {stageInfo.label}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500 font-bold">
                        <span>{stageInfo.area}</span>
                        <span className="font-mono">{stageInfo.step}/{stageInfo.totalSteps}</span>
                      </div>

                      {(op.origen || op.modalidad_requerimiento) && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                          {op.origen && (
                            <span className="px-2 py-0.5 rounded-lg bg-white border border-gray-200 text-gray-600">
                              Origen: {op.origen}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-lg bg-white border border-orange-200 text-[#F7931F]">
                            {op.modalidad_requerimiento === 'solo_material' ? 'Sólo material' : 'Instalación'}
                          </span>
                        </div>
                      )}

                      {/* Progreso visual de etapa según el área real del pipeline */}
                      <div
                        className="grid gap-1 pt-1"
                        style={{ gridTemplateColumns: `repeat(${stageInfo.totalSteps}, minmax(0, 1fr))` }}
                      >
                        {Array.from({ length: stageInfo.totalSteps }).map((_, idx) => (
                          <div
                            key={idx}
                            className={`h-1.5 rounded-full transition ${
                              idx < stageInfo.step ? 'bg-[#F7931F]' : 'bg-gray-200'
                            }`}
                          />
                        ))}
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500 pt-1.5 border-t border-gray-200/60">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          {op.fecha_limite || 'Sin fecha'}
                        </span>
                        <Link
                          href={`/ventas?oportunidad=${op.id}`}
                          className="text-[#F7931F] font-bold hover:underline flex items-center gap-0.5"
                        >
                          <span>Ver en pipeline</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECCIÓN 2: COTIZACIONES DEL CLIENTE */}
          <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <h3 className="font-extrabold text-xs text-[#363636] flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#F7931F]" />
                <span>Cotizaciones ({cotizaciones.length})</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateQuoteModal(true)}
                className="text-xs font-extrabold text-[#F7931F] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Crear</span>
              </button>
            </div>

            {cotizaciones.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-2">Sin cotizaciones registradas.</p>
            ) : (
              <div className="space-y-2">
                {cotizaciones.map((cot) => (
                  <div
                    key={cot.id}
                    className="p-3 bg-gray-50 hover:bg-orange-50/40 rounded-2xl border border-gray-200 text-xs space-y-1.5 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#363636] font-mono text-xs">
                        {cot.numero_cotizacion} (v{cot.version || 1})
                      </span>
                      <span className="text-[#F7931F] font-black text-xs">${cot.monto_total?.toLocaleString('es-CL')}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="capitalize font-semibold text-gray-600 text-xs px-2.5 py-0.5 rounded-full bg-white border border-gray-200">
                        {cot.estado}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreviewCotizacion(cot)}
                        className="text-[#F7931F] hover:underline font-bold flex items-center gap-1 text-xs cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Previsualizar PDF</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECCIÓN 3: EVENTOS & OBRAS PROGRAMADAS */}
          <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <h3 className="font-extrabold text-xs text-[#363636] flex items-center gap-1.5">
                <HardHat className="w-4 h-4 text-[#F7931F]" />
                <span>Obras & despachos ({eventosList.length})</span>
              </h3>
            </div>

            {eventosList.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-2">Sin eventos programados para este cliente.</p>
            ) : (
              <div className="space-y-2">
                {eventosList.slice(0, 4).map((ev) => (
                  <div key={ev.id} className="p-3 bg-gray-50 rounded-2xl border border-gray-200 text-xs space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-[#363636] truncate max-w-[160px]">{ev.titulo}</span>
                      <span className="capitalize text-xs font-bold text-gray-600 px-2 py-0.5 rounded bg-white border">
                        {ev.estado.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-gray-500 text-xs font-mono">
                      <span>{ev.fecha_inicio?.split('T')[0] || ev.fecha_evento}</span>
                      <span>{ev.responsable?.nombre || 'Sin responsable'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

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

      {/* MODAL PARA CREAR OPORTUNIDAD */}
      {showCreateOpModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-[#363636]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-black text-[#363636] flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#F7931F]" />
                <span>Nueva oportunidad de venta</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateOpModal(false)}
                className="p-1 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

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
                    tipo_venta: cliente.tipo_venta || 'Instalación',
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
                    setOpModalidadRequerimiento('instalacion');
                  }
                } catch (err) {
                  console.error('Error creating opportunity:', err);
                }
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-gray-700 mb-1">Título del proyecto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Suministro de Bloques de Vidrio Edificio Central"
                  value={opTitulo}
                  onChange={(e) => setOpTitulo(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Monto estimado ($ CLP)</label>
                <input
                  type="number"
                  min={0}
                  value={opMonto}
                  onChange={(e) => setOpMonto(Number(e.target.value))}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Origen</label>
                  <input
                    type="text"
                    placeholder="Ej: WhatsApp, referido, web..."
                    value={opOrigen}
                    onChange={(e) => setOpOrigen(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Sólo material o instalación</label>
                  <select
                    value={opModalidadRequerimiento}
                    onChange={(e) => setOpModalidadRequerimiento(e.target.value as 'solo_material' | 'instalacion')}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-bold focus:outline-none focus:border-[#F7931F]"
                  >
                    <option value="solo_material">Sólo material</option>
                    <option value="instalacion">Instalación</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Fecha límite de cierre</label>
                <input
                  type="date"
                  value={opFechaLimite}
                  onChange={(e) => setOpFechaLimite(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateOpModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold rounded-xl transition shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear oportunidad</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
