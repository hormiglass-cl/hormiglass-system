'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../../lib/supabase/client';
import { useAuth } from '../../../lib/context/AuthContext';
import { Cliente, NotaActividad, Cotizacion, TipoNotaActividad, OportunidadVenta, PRODUCTOS_HORMIGLASS } from '../../../lib/types';
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
} from 'lucide-react';

const STAGE_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  nueva: { label: 'Nueva Oportunidad', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300' },
  pagada: { label: 'Pago Validado', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-300' },
  venta_cerrada: { label: 'Venta Cerrada', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300' },
  programada: { label: 'Pendiente Planificación', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-300' },
  en_fabricacion: { label: 'En Cola de Fabricación', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-300' },
  lista_despacho: { label: 'Listo para Despacho', bg: 'bg-cyan-50', text: 'text-cyan-800', border: 'border-cyan-300' },
  instalacion: { label: 'Instalación / Terreno', bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-300' },
  entregada: { label: 'Entregada & Cierre', bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-300' },
};

const renderStageBadge = (stage: string) => {
  const conf = STAGE_CONFIG[stage] || {
    label: stage.replace(/_/g, ' ').toUpperCase(),
    bg: 'bg-orange-50',
    text: 'text-[#F7931F]',
    border: 'border-orange-200',
  };
  return (
    <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border shadow-2xs ${conf.bg} ${conf.text} ${conf.border}`}>
      {conf.label}
    </span>
  );
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
      return { valido: false, mensaje: `RUT Inválido. El DV para ${cleanBody} es ${dvEsperado}` };
    }
    return { valido: true };
  };

  // Edit form state
  const [editNombre, setEditNombre] = useState('');
  const [editRazon, setEditRazon] = useState('');
  const [editRutBody, setEditRutBody] = useState('');
  const [editRutDv, setEditRutDv] = useState('');
  const [editNicho, setEditNicho] = useState('');
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

  // Modales
  const [selectedOpportunity, setSelectedOpportunity] = useState<OportunidadVenta | null>(null);
  const [previewCotizacion, setPreviewCotizacion] = useState<Cotizacion | null>(null);
  const [showCreateQuoteModal, setShowCreateQuoteModal] = useState(false);
  const [showCreateOpModal, setShowCreateOpModal] = useState(false);
  const [opTitulo, setOpTitulo] = useState('');
  const [opMonto, setOpMonto] = useState(1500000);
  const [opFechaLimite, setOpFechaLimite] = useState('');

  // Inline Quote Creation Form
  const [quoteProducto, setQuoteProducto] = useState(PRODUCTOS_HORMIGLASS[0]);
  const [quoteCantidad, setQuoteCantidad] = useState(10);
  const [quotePrecio, setQuotePrecio] = useState(45000);
  const [quoteCondiciones, setQuoteCondiciones] = useState('50% abono / 50% al despacho');

  const [nuevaNota, setNuevaNota] = useState('');
  const [tipoActividad, setTipoActividad] = useState<TipoNotaActividad>('nota');
  const [fechaRecordatorio, setFechaRecordatorio] = useState('');
  const [horaRecordatorio, setHoraRecordatorio] = useState('09:00');

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const [clientRes, nichosRes] = await Promise.all([
          supabase.from('clientes').select('*').eq('id', clienteId).single(),
          supabase.from('campos_personalizados').select('opciones').eq('campo_supabase', 'nicho').maybeSingle(),
        ]);

        if (ignore) return;

        if (nichosRes.data && nichosRes.data.opciones && nichosRes.data.opciones.length > 0) {
          setNichosOptions(nichosRes.data.opciones);
        }

        const clientData = clientRes.data;
        const clientErr = clientRes.error;

        let currentCli: Cliente | null = null;
        if (!clientErr && clientData) {
          currentCli = clientData as Cliente;
        } else {
          // Attempt fallback lookup by exact match if ID wasn't UUID or direct match
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
        setEditTelefono(currentCli.telefono || '');
        setEditCorreo(currentCli.correo || '');
        setEditDireccion(currentCli.direccion || '');
        setEditComuna(currentCli.comuna || '');
        setEditRegion(currentCli.region || '');

        // 1. Fetch Notes strictly from Supabase
        const { data: notesData } = await supabase
          .from('notas_actividad')
          .select('*, usuario:usuarios(*)')
          .eq('cliente_id', currentCli.id)
          .order('fecha', { ascending: false });

        if (!ignore) {
          setNotas(notesData ? (notesData as NotaActividad[]) : []);
        }

        // 2. Fetch Quotes strictly from Supabase for this client
        const { data: quotesData } = await supabase
          .from('cotizaciones')
          .select('*, items:cotizacion_items(*)')
          .eq('cliente_id', currentCli.id)
          .order('created_at', { ascending: false });

        if (!ignore) {
          setCotizaciones(quotesData ? (quotesData as Cotizacion[]) : []);
        }

        // 3. Fetch Opportunities strictly from Supabase for this client
        const { data: opData } = await supabase
          .from('oportunidades')
          .select('*, cliente:clientes(*), cotizaciones(*)');

        if (!ignore) {
          if (opData) {
            const matchedOps = (opData as OportunidadVenta[]).filter(
              (o) =>
                o.cliente_id === currentCli.id ||
                (currentCli.rut && o.cliente?.rut === currentCli.rut) ||
                (currentCli.nombre && o.cliente?.nombre === currentCli.nombre)
            );
            setOportunidades(matchedOps);
          } else {
            setOportunidades([]);
          }
          setLoading(false);
        }

      } catch (err) {
        console.error('Error loading client detail from Supabase:', err);
        if (!ignore) setLoading(false);
      }
    }

    loadData();

    // Supabase Realtime channel subscription for instant client card updates
    const channel = supabase
      .channel(`realtime_client_detail_${clienteId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notas_actividad',
        },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clientes',
        },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cotizaciones',
        },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'oportunidades',
        },
        () => {
          loadData();
        }
      )
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
      setEditRutError(val.mensaje || 'RUT inválido. Verifica el número y el dígito verificador.');
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
        console.error('Error actualizando cliente en Supabase:', error);
        setEditRutError(`Error al actualizar en Supabase: ${error.message}`);
        return;
      }

      if (data) {
        setCliente(data as Cliente);
      } else {
        setCliente({ ...cliente, ...updatedData });
      }

      setIsEditing(false);
      setSaveSuccess(true);

      await logSistema({
        tipo_accion: 'actualizacion',
        entidad: 'clientes',
        entidad_id: cliente.id,
        descripcion: `Información del cliente ${editNombre} (${formattedRut}) actualizada en Supabase`,
        usuario_id: currentUser?.id,
        datos_anteriores: cliente,
        datos_nuevos: updatedData,
      });

      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving client updates:', err);
      setEditRutError(`Error al guardar en Supabase: ${err.message || 'Error de conexión'}`);
    }
  };

  // Inline Quote Creation strictly in Supabase
  const handleCreateQuoteDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliente) return;

    const subtotal = quoteCantidad * quotePrecio;
    const iva = Math.round(subtotal * 0.19);
    const total = subtotal + iva;
    const numCot = `COT-${Math.floor(1000 + Math.random() * 9000)}`;

    const validUserId = (currentUser?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentUser.id)) ? currentUser.id : null;

    try {
      const { data: cotData, error: cotErr } = await supabase
        .from('cotizaciones')
        .insert([{
          numero_cotizacion: numCot,
          cliente_id: cliente.id,
          usuario_id: validUserId,
          version: 1,
          estado: 'borrador',
          subtotal,
          descuento: 0,
          iva_porcentaje: 19,
          monto_iva: iva,
          monto_total: total,
          condiciones_pago: quoteCondiciones,
        }])
        .select('*, cliente:clientes(*)')
        .single();

      if (cotErr || !cotData) {
        console.error('Error creating cotizacion in Supabase:', cotErr);
        return;
      }

      // Insert item
      const { data: itemData } = await supabase
        .from('cotizacion_items')
        .insert([{
          cotizacion_id: cotData.id,
          producto: quoteProducto,
          cantidad: quoteCantidad,
          precio_unitario: quotePrecio,
          descuento_porcentaje: 0,
          total_item: subtotal,
        }])
        .select('*');

      const createdCot: Cotizacion = {
        ...cotData as Cotizacion,
        items: itemData ? itemData : [{
          producto: quoteProducto,
          cantidad: quoteCantidad,
          precio_unitario: quotePrecio,
          total_item: subtotal,
        }],
      };

      setCotizaciones([createdCot, ...cotizaciones]);
      setShowCreateQuoteModal(false);
      setPreviewCotizacion(createdCot);
    } catch (err) {
      console.error('Error creating quote in Supabase:', err);
    }
  };

  // Create Opportunity for this client strictly in Supabase
  const handleCreateOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opTitulo.trim() || !cliente) return;

    const validUserId = (currentUser?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentUser.id)) ? currentUser.id : null;
    const autoCodigo = `OP-${Math.floor(1000 + Math.random() * 9000)}`;

    const newOpPayload = {
      codigo: autoCodigo,
      titulo: opTitulo.trim(),
      cliente_id: cliente.id,
      monto_estimado: opMonto,
      estado_pipeline: 'nueva',
      probabilidad: 50,
      fecha_limite: opFechaLimite || new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split('T')[0],
      asignado_a: validUserId,
    };

    try {
      const { data, error } = await supabase
        .from('oportunidades')
        .insert([newOpPayload])
        .select('*, cliente:clientes(*)')
        .single();

      if (!error && data) {
        setOportunidades([data as OportunidadVenta, ...oportunidades]);
        setShowCreateOpModal(false);
        setOpTitulo('');
        setOpMonto(1500000);
        setOpFechaLimite('');
      } else {
        console.error('Error creating opportunity in Supabase:', error);
      }
    } catch (err) {
      console.error('Error in handleCreateOpportunity:', err);
    }
  };

  // Add Activity Note / Reminder strictly in Supabase
  const handleAddNota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaNota.trim() || !cliente) return;

    const validUserId = (currentUser?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentUser.id)) ? currentUser.id : null;

    const notePayload = {
      cliente_id: cliente.id,
      usuario_id: validUserId,
      contenido: nuevaNota,
      tipo_actividad: tipoActividad,
      fecha_recordatorio: tipoActividad === 'recordatorio' && fechaRecordatorio ? fechaRecordatorio : null,
      hora_recordatorio: tipoActividad === 'recordatorio' && horaRecordatorio ? horaRecordatorio : null,
      fecha: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabase
        .from('notas_actividad')
        .insert([notePayload])
        .select('*, usuario:usuarios(*)')
        .single();

      if (!error && data) {
        setNotas([data as NotaActividad, ...notas]);
      } else {
        console.error('Error creating note in Supabase:', error);
      }

      if (tipoActividad === 'recordatorio') {
        const notifPayload = {
          usuario_id: currentUser?.id || 'usr-admin-01',
          mensaje: `RECORDATORIO (${cliente.nombre}): ${nuevaNota}${fechaRecordatorio ? ` - Fecha: ${fechaRecordatorio} a las ${horaRecordatorio}` : ''}`,
          tipo: 'asignacion',
          leido: false,
          entidad_relacionada: 'clientes',
          fecha: new Date().toISOString(),
        };

        await supabase.from('notificaciones').insert([notifPayload]);
      }

    } catch (err) {
      console.error('Error creating note/reminder:', err);
    }

    setNuevaNota('');
    setFechaRecordatorio('');
    setTipoActividad('nota');
  };

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
    <div className="space-y-6 text-[#363636]">
      {/* Botón Volver & Header */}
      <div>
        <Link
          href="/clientes"
          className="text-xs text-gray-500 hover:text-[#F7931F] font-bold flex items-center gap-1 mb-3 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Directorio de Clientes</span>
        </Link>

        {saveSuccess && (
          <div className="mb-4 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs px-4 py-3 rounded-xl flex items-center gap-2 font-bold animate-fadeIn">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>¡Información del cliente actualizada exitosamente!</span>
          </div>
        )}

        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase text-[#F7931F]">Nicho de Mercado:</span>
                <select
                  value={cliente.nicho || nichosOptions[0] || 'Constructora B2B'}
                  onChange={async (e) => {
                    const newN = e.target.value;
                    setCliente({ ...cliente, nicho: newN });
                    try {
                      await supabase.from('clientes').update({ nicho: newN }).eq('id', cliente.id);
                    } catch (err) {
                      console.error('Error updating nicho:', err);
                    }
                  }}
                  className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-orange-50 text-[#F7931F] border border-orange-200 focus:outline-none focus:ring-1 focus:ring-[#F7931F] cursor-pointer"
                >
                  {nichosOptions.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase text-purple-700">Tipo Venta Habitual:</span>
                <select
                  value={cliente.tipo_venta || 'Instalación'}
                  onChange={async (e) => {
                    const newTipo = e.target.value;
                    setCliente({ ...cliente, tipo_venta: newTipo });
                    try {
                      await supabase.from('clientes').update({ tipo_venta: newTipo }).eq('id', cliente.id);
                    } catch (err) {
                      console.error('Error updating tipo_venta:', err);
                    }
                  }}
                  className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-purple-50 text-purple-900 border border-purple-200 focus:outline-none focus:ring-1 focus:ring-purple-400 cursor-pointer"
                >
                  <option value="Instalación">Instalación</option>
                  <option value="Suministro">Suministro</option>
                  <option value="Reventa de Material">Reventa de Material</option>
                </select>
              </div>
            </div>
            <h1 className="text-2xl font-extrabold text-[#363636]">{cliente.nombre}</h1>
            <p className="text-xs text-gray-600 mt-1">
              Razón Social: <strong className="text-[#363636] font-semibold">{cliente.apellido_razon_social || cliente.nombre}</strong> · RUT: <strong className="text-[#363636] font-mono">{cliente.rut}</strong>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateOpModal(true)}
              className="bg-[#363636] hover:bg-black text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition flex items-center gap-2"
            >
              <TrendingUp className="w-4 h-4 text-[#F7931F]" />
              <span>Crear Oportunidad</span>
            </button>

            <button
              onClick={() => setShowCreateQuoteModal(true)}
              className="bg-[#F7931F] hover:bg-[#e08316] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              <span>Crear Cotización</span>
            </button>
          </div>
        </div>
      </div>

      {/* Formulario de Edición Completa */}
      {isEditing && (
        <div className="bg-orange-50/60 p-6 rounded-2xl border border-orange-200 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-orange-200 pb-3">
            <h3 className="font-extrabold text-sm text-[#363636] flex items-center gap-2">
              <Edit className="w-4 h-4 text-[#F7931F]" />
              <span>Editar Toda la Información del Cliente</span>
            </h3>
          </div>

          <form onSubmit={handleSaveClient} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nombre Comercial *</label>
                <input
                  type="text"
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Razón Social Completa</label>
                <input
                  type="text"
                  value={editRazon}
                  onChange={(e) => setEditRazon(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">RUT Empresa / Persona *</label>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1">
                    <input
                      type="text"
                      required
                      maxLength={8}
                      placeholder="12345678"
                      value={editRutBody}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setEditRutBody(val);
                      }}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-mono text-xs focus:outline-none focus:border-[#F7931F]"
                    />
                  </div>
                  <span className="font-extrabold text-gray-400 text-sm">-</span>
                  <div className="w-14">
                    <input
                      type="text"
                      required
                      maxLength={1}
                      placeholder="K"
                      value={editRutDv}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9kK]/g, '').toUpperCase();
                        setEditRutDv(val);
                      }}
                      className="w-full bg-white border border-gray-300 rounded-xl px-2 py-2 text-center text-[#363636] font-mono font-bold text-xs uppercase focus:outline-none focus:border-[#F7931F]"
                    />
                  </div>
                </div>
                {editRutBody && (
                  <div className="mt-1">
                    {validarRutChileno(editRutBody, editRutDv).valido ? (
                      <span className="text-[10px] text-emerald-600 font-bold">
                        ✓ RUT Válido ({editRutBody}-{editRutDv.toUpperCase()})
                      </span>
                    ) : (
                      <span className="text-[10px] text-red-500 font-bold">
                        {validarRutChileno(editRutBody, editRutDv).mensaje}
                      </span>
                    )}
                  </div>
                )}
                {editRutError && (
                  <span className="text-[10px] text-red-600 font-bold block mt-0.5">{editRutError}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nicho de Mercado</label>
                <input
                  type="text"
                  value={editNicho}
                  onChange={(e) => setEditNicho(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

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
                <label className="block font-bold text-gray-700 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  value={editCorreo}
                  onChange={(e) => setEditCorreo(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Dirección de Despacho / Obra</label>
                <input
                  type="text"
                  value={editDireccion}
                  onChange={(e) => setEditDireccion(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div>
                <SearchableSelect
                  label="Región"
                  value={editRegion}
                  onChange={(val) => setEditRegion(val)}
                  options={REGIONES_CHILE.map((r) => r.region)}
                  placeholder="Seleccionar o buscar región..."
                />
              </div>

              <div>
                <SearchableSelect
                  label="Comuna"
                  value={editComuna}
                  onChange={(val) => {
                    setEditComuna(val);
                    if (!editRegion && val) {
                      const foundReg = REGIONES_CHILE.find((r) => r.comunas.includes(val));
                      if (foundReg) {
                        setEditRegion(foundReg.region);
                      }
                    }
                  }}
                  options={
                    editRegion
                      ? (REGIONES_CHILE.find((r) => r.region === editRegion)?.comunas || TODAS_COMUNAS_CHILE)
                      : TODAS_COMUNAS_CHILE
                  }
                  placeholder="Seleccionar o buscar comuna..."
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
                <span>Guardar Cambios</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Info y Timeline Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda: Información de Contacto, Oportunidades y Cotizaciones */}
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="font-extrabold text-sm text-[#363636] border-b border-gray-200 pb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Building className="w-4 h-4 text-[#F7931F]" />
                <span>Información de Contacto</span>
              </span>
              <button
                onClick={() => setIsEditing(true)}
                className="text-[11px] text-[#F7931F] font-bold hover:underline"
              >
                Editar
              </button>
            </h3>

            <div className="space-y-3 text-xs text-gray-700">
              <div>
                <span className="text-gray-500 text-[11px] block font-semibold">Teléfono de Contacto</span>
                <span className="font-bold text-[#363636]">{cliente.telefono || 'No registrado'}</span>
              </div>
              <div>
                <span className="text-gray-500 text-[11px] block font-semibold">Correo Electrónico Primario</span>
                <span className="font-bold text-[#363636]">{cliente.correo || 'No registrado'}</span>
              </div>
              {cliente.correos_secundarios && cliente.correos_secundarios.length > 0 && (
                <div>
                  <span className="text-gray-500 text-[11px] block font-semibold">Correos Secundarios</span>
                  <span className="font-mono text-gray-600">{cliente.correos_secundarios.join(', ')}</span>
                </div>
              )}
              <div>
                <span className="text-gray-500 text-[11px] block font-semibold">Dirección de Despacho / Obra</span>
                <span className="font-bold text-[#363636] block">{cliente.direccion || 'No registrada'}</span>
              </div>
              <div>
                <span className="text-gray-500 text-[11px] block font-semibold">Comuna / Región</span>
                <span className="font-bold text-[#363636] block">
                  {[cliente.comuna, cliente.region].filter(Boolean).join(', ') || 'No registrada'}
                </span>
              </div>
            </div>
          </div>

          {/* Sección de Oportunidades de Venta (Abre popup directo) */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
            <h3 className="font-extrabold text-sm text-[#363636] border-b border-gray-200 pb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#F7931F]" />
                <span>Oportunidades de Venta</span>
              </span>
              <span className="bg-orange-100 text-[#F7931F] text-xs px-2 py-0.5 rounded-full font-bold">
                {oportunidades.length}
              </span>
            </h3>

            {oportunidades.length > 0 ? (
              <div className="space-y-2.5">
                {oportunidades.map((op) => (
                  <Link
                    key={op.id}
                    href={`/ventas?oportunidad=${op.id}`}
                    className="p-3 bg-orange-50/60 hover:bg-orange-100/80 rounded-xl border border-orange-200 text-xs space-y-1.5 cursor-pointer transition group block"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold font-mono text-[#363636]">{op.codigo}</span>
                      {renderStageBadge(op.estado_pipeline)}
                    </div>
                    <p className="font-extrabold text-[#363636] group-hover:text-[#F7931F] transition">{op.titulo}</p>
                    <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1 border-t border-orange-200/60">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-amber-600" />
                        {op.fecha_limite || 'Sin límite'}
                      </span>
                      <span className="text-[#F7931F] font-extrabold text-[11px]">
                        Ver Detalle Completo en Pipeline →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">Sin oportunidades registradas.</p>
            )}
          </div>

          {/* Historial Comercial de Cotizaciones */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
            <h3 className="font-extrabold text-sm text-[#363636] border-b border-gray-200 pb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#F7931F]" />
                <span>Cotizaciones del Cliente</span>
              </span>
              <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-bold">
                {cotizaciones.length}
              </span>
            </h3>

            {cotizaciones.length > 0 ? (
              cotizaciones.map((cot) => (
                <div key={cot.id} className="p-3 bg-gray-50 hover:bg-orange-50/40 rounded-xl border border-gray-200 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#363636]">{cot.numero_cotizacion} (v{cot.version || 1})</span>
                    <span className="text-[#F7931F] font-extrabold">${cot.monto_total?.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
                    <span className="capitalize font-semibold text-gray-600">Estado: {cot.estado}</span>
                    <button
                      onClick={() => setPreviewCotizacion(cot)}
                      className="text-[#F7931F] hover:underline font-bold flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Previsualizar PDF</span>
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-500">Sin cotizaciones registradas para este cliente.</p>
            )}
          </div>
        </div>

        {/* Columna Derecha: Timeline de Notas & Recordatorios */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <h2 className="text-lg font-extrabold text-[#363636] flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#F7931F]" />
              <span>Notas de Actividad & Recordatorios</span>
            </h2>
            <span className="text-xs text-gray-500 font-semibold">{notas.length} registradas</span>
          </div>

          {/* Formulario Agregar Nota / Recordatorio */}
          <form onSubmit={handleAddNota} className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Tipo de Actividad</label>
                <select
                  value={tipoActividad}
                  onChange={(e) => setTipoActividad(e.target.value as TipoNotaActividad)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                >
                  <option value="nota">📝 Nota General</option>
                  <option value="reunion">🤝 Reunión con Cliente</option>
                  <option value="llamada">📞 Llamada Telefónica</option>
                  <option value="recordatorio">🔔 Recordatorio In-App</option>
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
                className="bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold text-xs px-4 py-2 rounded-xl transition flex items-center gap-2 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{tipoActividad === 'recordatorio' ? 'Guardar Recordatorio' : 'Guardar Nota'}</span>
              </button>
            </div>
          </form>

          {/* Lista Timeline de Notas */}
          <div className="space-y-4 pt-2">
            {notas.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No hay notas guardadas aún para este cliente.</p>
            ) : (
              notas.map((n) => {
                const isReminder = n.tipo_actividad === 'recordatorio';
                return (
                  <div
                    key={n.id}
                    className={`p-4 rounded-xl border space-y-2 ${
                      isReminder
                        ? 'bg-amber-50/70 border-amber-300'
                        : 'bg-gray-50 border-gray-200'
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
                        <span className="font-extrabold text-[#363636]">{n.usuario?.nombre || 'Usuario CRM'}</span>
                        <span className="text-[10px] text-[#363636] bg-white font-bold px-2 py-0.5 rounded-full uppercase border border-gray-200">
                          {n.tipo_actividad || 'nota'}
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-500 font-mono">
                        {new Date(n.fecha).toLocaleDateString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p className="text-xs text-[#363636] leading-relaxed pl-4 border-l-2 border-[#F7931F]">
                      {n.contenido}
                    </p>

                    {n.fecha_recordatorio && (
                      <p className="text-[11px] text-amber-800 font-bold pt-1">
                        📅 Recordatorio programado para: {n.fecha_recordatorio}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal Popup para Ver Oportunidad Completa en Ficha */}
      {selectedOpportunity && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl text-[#363636] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold text-[#F7931F] uppercase">
                  DETALLE DE OPORTUNIDAD EN PIPELINE
                </span>
                <h3 className="text-lg font-extrabold text-[#363636] flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#F7931F]" />
                  <span>{selectedOpportunity.titulo}</span>
                </h3>
              </div>
              <button
                onClick={() => setSelectedOpportunity(null)}
                className="text-gray-400 hover:text-[#363636] text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-200">
                <div>
                  <span className="text-gray-500 font-bold block">Código:</span>
                  <span className="font-mono font-black text-sm text-[#363636]">{selectedOpportunity.codigo}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-bold block">Estado en Pipeline:</span>
                  <span className="inline-block text-[10px] font-black uppercase bg-[#F7931F] text-white px-2.5 py-0.5 rounded-full mt-0.5">
                    {selectedOpportunity.estado_pipeline}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 font-bold block">Fecha Limite:</span>
                  <span className="font-medium text-gray-700">{selectedOpportunity.fecha_limite || 'Sin fecha'}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-bold block">Asignado A:</span>
                  <span className="font-semibold text-gray-800">{selectedOpportunity.usuario_asignado?.nombre || 'Ejecutivo Ventas'}</span>
                </div>
              </div>

              {/* Productos seleccionados */}
              <div className="bg-orange-50/60 p-4 rounded-2xl border border-orange-200 space-y-2">
                <span className="font-bold text-[#F7931F] flex items-center gap-1.5">
                  <Package className="w-4 h-4" />
                  <span>Productos del Proyecto</span>
                </span>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(selectedOpportunity.productos || ['Soleras A-1', 'Adocretos 6cm']).map((prod, i) => (
                    <span key={i} className="bg-white border border-orange-300 text-[#363636] font-bold text-[11px] px-2.5 py-1 rounded-xl shadow-xs">
                      {prod}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                <Link
                  href="/ventas"
                  className="text-xs font-bold text-[#F7931F] hover:underline flex items-center gap-1"
                >
                  <span>Ver todas en el Pipeline Completo →</span>
                </Link>

                <button
                  onClick={() => setSelectedOpportunity(null)}
                  className="px-5 py-2 bg-[#363636] hover:bg-black text-white text-xs font-bold rounded-xl transition"
                >
                  Cerrar Modal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Emisión Rápida de Cotización en Ficha */}
      {/* Modal Unificado de Cotización */}
      <CotizacionModal
        isOpen={showCreateQuoteModal}
        onClose={() => setShowCreateQuoteModal(false)}
        clienteIdInicial={cliente?.id}
        onSuccess={() => window.location.reload()}
      />

      {/* Modal para Crear Oportunidad de Venta */}
      {showCreateOpModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-[#363636]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-extrabold text-[#363636] flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#F7931F]" />
                <span>Crear Nueva Oportunidad</span>
              </h3>
              <button
                onClick={() => setShowCreateOpModal(false)}
                className="text-gray-400 hover:text-[#363636] text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Oportunidad asociada a <strong className="text-[#363636] font-bold">{cliente.nombre}</strong> ({cliente.rut}).
            </p>

            <form onSubmit={handleCreateOpportunity} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Título de la Oportunidad *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Suministro de Soleras Maipú - Etapa 2"
                  value={opTitulo}
                  onChange={(e) => setOpTitulo(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Monto Estimado ($ CLP)</label>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    value={opMonto}
                    onChange={(e) => setOpMonto(Number(e.target.value))}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Fecha Límite Cierre</label>
                  <input
                    type="date"
                    value={opFechaLimite}
                    onChange={(e) => setOpFechaLimite(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowCreateOpModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#F7931F] hover:bg-[#e08316] text-white rounded-xl font-extrabold transition shadow-md flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear Oportunidad</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Visor PDF Reusable */}
      <PdfPreviewModal
        cotizacion={previewCotizacion}
        onClose={() => setPreviewCotizacion(null)}
      />
    </div>
  );
}

