'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { useAuth } from '../../lib/context/AuthContext';
import { esRutaReventa } from '../../lib/pipeline-ruta';
import { totalAbonado } from '../../lib/oportunidad-finanzas';
import {
  OrdenReventa,
  EstadoReventa,
  OportunidadVenta,
  Cotizacion,
  ChatMensaje,
  VisitaTerreno,
} from '../../lib/types';
import { PdfPreviewModal } from '../../components/PdfPreviewModal';
import {
  Truck,
  Calendar,
  User,
  LayoutGrid,
  List as ListIcon,
  Search,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Building,
  DollarSign,
  FileText,
  MessageSquare,
  Send,
  GripVertical,
} from 'lucide-react';

const ETAPAS_REVENTA: { id: EstadoReventa; label: string; color: string; bg: string; border: string }[] = [
  { id: 'coordinacion_proveedor', label: '1. Coordinación Proveedor', color: 'text-blue-800', bg: 'bg-blue-50', border: 'border-blue-200' },
  { id: 'confirmacion_stock', label: '2. Confirmación Stock', color: 'text-indigo-800', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  { id: 'listo_retiro', label: '3. Listo para Retiro', color: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-200' },
  { id: 'listo_despacho', label: '4. Listo para Despacho', color: 'text-orange-800', bg: 'bg-orange-50', border: 'border-orange-200' },
  { id: 'entregado', label: '5. Entregado al Cliente', color: 'text-emerald-800', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { id: 'postventa', label: '6. Postventa & Seguimiento', color: 'text-purple-800', bg: 'bg-purple-50', border: 'border-purple-200' },
];

const ESTADO_LEGADO_REVENTA: Record<string, EstadoReventa> = {
  reventa_coordinacion: 'coordinacion_proveedor',
  reventa_stock: 'confirmacion_stock',
  reventa_retiro: 'listo_retiro',
  reventa_despacho: 'listo_despacho',
  reventa_entregado: 'entregado',
  reventa_postventa: 'postventa',
  rev_coordinacion: 'coordinacion_proveedor',
  rev_stock: 'confirmacion_stock',
  rev_listo_retiro: 'listo_retiro',
  rev_listo_despacho: 'listo_despacho',
  rev_entregado: 'entregado',
  rev_postventa: 'postventa',
};

function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export default function ReventaPage() {
  const { currentUser } = useAuth();
  const [ordenes, setOrdenes] = useState<(OrdenReventa & { oportunidad?: OportunidadVenta })[]>([]);
  const [loading, setLoading] = useState(true);

  // Vista de Lista primero siempre por defecto
  const [activeTab, setActiveTab] = useState<'lista' | 'tablero'>('lista');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Modal Full Oportunidad
  const [selectedOp, setSelectedOp] = useState<OportunidadVenta | null>(null);
  const [selectedOrden, setSelectedOrden] = useState<OrdenReventa | null>(null);

  // Accordion state (Todas cerradas por defecto)
  const [openSections, setOpenSections] = useState({
    contacto: false,
    productos: false,
    finanzas: false,
    visita: false,
    reventa: false,
  });

  // Full Opportunity Chat / Activities
  const [opActivities, setOpActivities] = useState<ChatMensaje[]>([]);
  const [newChatText, setNewChatText] = useState('');

  const supabase = createClient();

  const loadOrdenes = async () => {
    try {
      setLoading(true);

      // Cargar todas las oportunidades de reventa y las órdenes de reventa
      const [opRes, revRes] = await Promise.all([
        supabase
          .from('oportunidades')
          .select('*, cliente:clientes(*), cotizaciones!cotizaciones_oportunidad_id_fkey(*)')
          .or('rama_destino.eq.reventa,estado_pipeline.in.(entregada,reventa_coordinacion,reventa_stock,reventa_retiro,reventa_despacho,reventa_entregado,reventa_postventa,rev_coordinacion,rev_stock,rev_listo_retiro,rev_listo_despacho,rev_entregado,rev_postventa)'),
        supabase
          .from('ordenes_reventa')
          .select('*'),
      ]);
      if (opRes.error) throw new Error(`Oportunidades: ${opRes.error.message}`);
      if (revRes.error) throw new Error(`Órdenes: ${revRes.error.message}`);

      const revMap = new Map<string, any>();
      (revRes.data || []).forEach((r: any) => {
        if (r.oportunidad_id) revMap.set(r.oportunidad_id, r);
      });

      const combined: (OrdenReventa & { oportunidad?: OportunidadVenta })[] = [];

      (opRes.data || []).forEach((op: any) => {
        const isReventa = esRutaReventa(op);
        if (!isReventa) return; // Solo reventa en esta página

        const revRecord = revMap.get(op.id);
        combined.push({
          id: revRecord?.id || `rev-${op.id}`,
          oportunidad_id: op.id,
          codigo: op.codigo,
          titulo: op.titulo,
          cliente_id: op.cliente_id,
          cliente: op.cliente,
          estado: (revRecord?.estado as EstadoReventa) || ESTADO_LEGADO_REVENTA[op.estado_pipeline] || 'coordinacion_proveedor',
          proveedor_nombre: revRecord?.proveedor_nombre || null,
          fecha_despacho: revRecord?.fecha_despacho || null,
          observaciones: revRecord?.observaciones || 'Vinculado desde Venta Cerrada.',
          notas_postventa: revRecord?.notas_postventa || null,
          oportunidad: op,
        });
      });

      setOrdenes(combined);
    } catch (err) {
      console.error('Error cargando órdenes de reventa:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    loadOrdenes();

    const channel1 = supabase
      .channel('realtime_rev_table')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ordenes_reventa' },
        () => {
          if (!ignore) loadOrdenes();
        }
      )
      .subscribe();

    const channel2 = supabase
      .channel('realtime_rev_ops')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'oportunidades' },
        () => {
          if (!ignore) loadOrdenes();
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, []);

  const moveOrdenState = async (id: string, opId: string, targetEstado: EstadoReventa) => {
    setOrdenes((prev) =>
      prev.map((o) => (o.oportunidad_id === opId || o.id === id ? { ...o, estado: targetEstado } : o))
    );

    if (selectedOrden && (selectedOrden.oportunidad_id === opId || selectedOrden.id === id)) {
      setSelectedOrden({ ...selectedOrden, estado: targetEstado });
    }

    if (isUUID(opId)) {
      try {
        await supabase.from('ordenes_reventa').upsert([
          {
            oportunidad_id: opId,
            codigo: selectedOrden?.codigo || 'OP-2790',
            titulo: selectedOrden?.titulo || 'Orden Reventa',
            cliente_id: selectedOrden?.cliente_id,
            estado: targetEstado,
          },
        ], { onConflict: 'oportunidad_id' });
      } catch (err) {
        console.error('Error moviendo orden de reventa:', err);
      }
    }
  };

  // Helper to open Full Opportunity Modal inside Reventa
  const handleOpenOrdenModal = async (ord: OrdenReventa & { oportunidad?: OportunidadVenta }) => {
    setSelectedOrden(ord);
    const op = ord.oportunidad || {
      id: ord.oportunidad_id,
      codigo: ord.codigo,
      titulo: ord.titulo,
      cliente_id: ord.cliente_id,
      cliente: ord.cliente,
      estado_pipeline: 'entregada',
    } as OportunidadVenta;

    setSelectedOp(op);
    setOpenSections({
      contacto: false,
      productos: false,
      finanzas: false,
      visita: false,
      reventa: false,
    });

    if (isUUID(op.id)) {
      loadActivitiesForOp(op.id);
    }
  };

  const loadActivitiesForOp = async (opId: string) => {
    try {
      const { data } = await supabase
        .from('actividades_op')
        .select('*')
        .eq('oportunidad_id', opId)
        .order('created_at', { ascending: true });

      if (data) {
        setOpActivities(
          data.map((a: any) => ({
            id: a.id,
            usuario_id: a.usuario_id || 'sistema',
            usuario_nombre: a.usuario_nombre || 'Sistema',
            contenido: a.contenido,
            created_at: a.created_at,
          }))
        );
      }
    } catch (err) {
      console.error('Error loading activities:', err);
    }
  };

  const handleSendChatMessage = async () => {
    if (!newChatText.trim() || !selectedOp) return;
    const msgContent = newChatText.trim();
    setNewChatText('');

    const newMsg: ChatMensaje = {
      id: Date.now().toString(),
      usuario_id: currentUser?.id || 'admin',
      usuario_nombre: currentUser?.nombre || 'Administrador',
      contenido: msgContent,
      created_at: new Date().toISOString(),
    };

    setOpActivities((prev) => [...prev, newMsg]);

    if (isUUID(selectedOp.id)) {
      try {
        await supabase.from('actividades_op').insert([
          {
            oportunidad_id: selectedOp.id,
            usuario_id: currentUser?.id || 'admin',
            usuario_nombre: currentUser?.nombre || 'Administrador',
            contenido: msgContent,
          },
        ]);
      } catch (err) {
        console.error('Error sending chat message:', err);
      }
    }
  };

  const getOportunidadTotalValue = (op?: OportunidadVenta) => {
    if (!op) return 0;
    if (!op.cotizaciones || op.cotizaciones.length === 0) return op.monto || 0;
    const aprobada = op.cotizaciones.find((c) => c.estado === 'aprobada');
    if (aprobada) return aprobada.monto_total || 0;
    return op.cotizaciones[0]?.monto_total || op.monto || 0;
  };

  const getOportunidadAbonadoValue = (op?: OportunidadVenta) => {
    return op ? totalAbonado(op) : 0;
  };

  const filteredOrdenes = ordenes.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.codigo?.toLowerCase().includes(q) ||
      o.titulo?.toLowerCase().includes(q) ||
      o.cliente?.nombre?.toLowerCase().includes(q) ||
      o.proveedor_nombre?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 ">
      {/* Top Header Estilo Ventas 100% Idéntico */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase text-[#f97316] bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-200">
              Gestión Logística & Proveedores
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-[#213343] flex items-center gap-2.5">
            <Truck className="w-7 h-7 text-[#f97316]" />
            <span>Reventa y Proveedores</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Misma oportunidad de venta vinculada para la coordinación de compras con proveedores, stock y despachos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Toggle Vista Lista vs Tablero */}
          <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button
              onClick={() => setActiveTab('lista')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-bold text-xs transition ${
                activeTab === 'lista'
                  ? 'bg-[#f97316] text-white shadow-sm'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              <ListIcon className="w-4 h-4" />
              <span>Lista</span>
            </button>
            <button
              onClick={() => setActiveTab('tablero')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-bold text-xs transition ${
                activeTab === 'tablero'
                  ? 'bg-[#f97316] text-white shadow-sm'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Tablero</span>
            </button>
            <Link
              href="/reventa/calendario"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-bold text-xs transition text-gray-600 hover:text-[#213343] hover:bg-white"
            >
              <Calendar className="w-4 h-4 text-[#f97316]" />
              <span>Calendario Reventa</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Barra de Búsqueda */}
      <div className="hg-list-toolbar text-xs">
        <Search className="w-4 h-4 text-gray-400 mr-2" />
        <input
          type="text"
          placeholder="Buscar por código, suministro, cliente o proveedor..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="hg-list-search px-3 text-sm text-[#252b2d] placeholder-gray-400"
        />
      </div>

      {/* VISTA 1: LISTA AGRUPADA POR ESTADOS (EXACTO A IMAGEN 1 DE VENTAS) */}
      {activeTab === 'lista' ? (
        <div className="space-y-4">
          {ETAPAS_REVENTA.map((col) => {
            const isCollapsed = !!collapsedSections[col.id];
            const colOrdenes = filteredOrdenes.filter((o) => o.estado === col.id);

            return (
              <div key={col.id} className="hg-list-group">
                {/* Accordion Group Header Estilo ClickUp */}
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedSections((prev) => ({ ...prev, [col.id]: !prev[col.id] }))
                  }
                  aria-expanded={!isCollapsed}
                  className="hg-list-group-heading w-full justify-between cursor-pointer select-none text-left transition group hover:bg-[#fafaf8]"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-gray-400 group-hover:text-[#213343] transition">
                      {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>

                    <span className="flex items-center gap-2 text-sm font-semibold text-[#252b2d]">
                      <span className={`h-2.5 w-2.5 rounded-full border ${col.bg} ${col.border}`} />
                      <span>{col.label}</span>
                    </span>

                    <span className="hg-list-count">{colOrdenes.length}</span>
                  </div>
                </button>

                {/* Tabla de la etapa */}
                {!isCollapsed && (
                  <div className="border-t border-[#eff0ee]">
                    {colOrdenes.map((ord) => <div key={ord.id} className="hg-list-row">
                      <span className={`h-3 w-3 shrink-0 rounded-full border ${col.bg} ${col.border}`} />
                      <button type="button" onClick={() => handleOpenOrdenModal(ord)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-semibold text-[#252b2d]">{ord.titulo}</span>
                        <span className="block truncate text-xs text-[#8a9390]">{ord.codigo} · {ord.cliente?.nombre || 'Cliente sin asignar'}</span>
                      </button>
                      <div className="hidden items-center gap-2 lg:flex">
                        <span className="hg-list-meta">{ord.proveedor_nombre || 'Proveedor por asignar'}</span>
                        {ord.fecha_despacho && <span className="hg-list-meta">Despacho {ord.fecha_despacho}</span>}
                        <span className="hg-list-meta font-semibold text-[#252b2d]">${getOportunidadTotalValue(ord.oportunidad).toLocaleString('es-CL')}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[#a8afac]" aria-hidden="true" />
                    </div>)}
                    {colOrdenes.length === 0 && (
                      <div className="px-5 py-4 text-xs text-[#8a9390]">
                        No hay órdenes de reventa en esta etapa.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* VISTA 2: TABLERO KANBAN (EXACTO A IMAGEN 2 DE VENTAS) */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4 items-start">
          {ETAPAS_REVENTA.map((col) => {
            const colOrdenes = filteredOrdenes.filter((o) => o.estado === col.id);

            return (
              <div
                key={col.id}
                className="bg-gray-50 rounded-lg border border-gray-200 p-4 flex flex-col min-h-[600px] shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                  <span className={`text-xs font-black uppercase px-3 py-1 rounded-full border ${col.bg} ${col.color} ${col.border}`}>
                    {col.label}
                  </span>
                  <span className="text-xs font-mono font-bold text-gray-600 bg-white px-2.5 py-0.5 rounded-full border border-gray-200">
                    {colOrdenes.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
                  {colOrdenes.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-center text-gray-400 italic text-xs border border-dashed border-gray-200 rounded-lg bg-white/50">
                      Sin órdenes aquí
                    </div>
                  ) : (
                    colOrdenes.map((ord) => {
                      const op = ord.oportunidad;
                      const montoTotal = getOportunidadTotalValue(op);
                      const abonado = getOportunidadAbonadoValue(op);
                      const saldo = Math.max(0, montoTotal - abonado);

                      return (
                        <div
                          key={ord.id}
                          onClick={() => handleOpenOrdenModal(ord)}
                          className="bg-white hover:bg-orange-50/20 p-4 rounded-lg border border-gray-200 hover:border-[#f97316] transition cursor-pointer space-y-3 shadow-sm group"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-mono font-bold text-[#213343]">
                              <GripVertical className="w-3.5 h-3.5 text-gray-400" />
                              <span>{ord.codigo}</span>
                            </div>
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                              Cot. v2
                            </span>
                          </div>

                          <h4 className="font-extrabold text-[#213343] text-sm leading-snug group-hover:text-[#f97316] transition">
                            {ord.titulo}
                          </h4>

                          <div className="flex items-center gap-1.5 text-xs text-[#f97316] font-bold">
                            <User className="w-3.5 h-3.5 text-[#f97316] shrink-0" />
                            <span className="truncate">{ord.cliente?.nombre || 'Jesus Rodriguez'}</span>
                          </div>

                          <div className="pt-2 border-t border-gray-100 text-[11px] space-y-1 font-mono">
                            <div className="flex items-center justify-between text-gray-600">
                              <span>🚚 Despacho:</span>
                              <span>{ord.fecha_despacho || 'Por definir'}</span>
                            </div>
                            {ord.proveedor_nombre && (
                              <div className="flex items-center justify-between text-amber-800 font-bold">
                                <span>🏢 Proveedor:</span>
                                <span>{ord.proveedor_nombre}</span>
                              </div>
                            )}
                          </div>

                          <div className="pt-2 border-t border-gray-100 text-[11px] space-y-1">
                            <div className="flex items-center justify-between font-bold text-gray-700">
                              <span>Total Venta:</span>
                              <span>${montoTotal.toLocaleString('es-CL')}</span>
                            </div>
                            <div className="flex items-center justify-between text-emerald-700 font-bold">
                              <span>Abonado:</span>
                              <span>${abonado.toLocaleString('es-CL')}</span>
                            </div>
                            <div className="flex items-center justify-between text-[#f97316] font-black">
                              <span>Saldo Pendiente:</span>
                              <span>${saldo.toLocaleString('es-CL')}</span>
                            </div>
                          </div>

                          <div className="pt-2 flex items-center justify-between gap-1 border-t border-gray-100">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Estado:</span>
                            <select
                              value={ord.estado}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => moveOrdenState(ord.id, ord.oportunidad_id, e.target.value as EstadoReventa)}
                              className="bg-gray-100 text-[#213343] text-[10px] font-bold rounded-lg px-2 py-1 border border-gray-200 focus:outline-none focus:border-[#f97316]"
                            >
                              {ETAPAS_REVENTA.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FULL UNIFIED OPORTUNIDAD MODAL (Nativo en Reventa sin redirigir) */}
      {selectedOp && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 z-50 "
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedOp(null);
          }}
        >
          <div className="bg-white text-[#252b2d] border border-[#e5e7e4] rounded-lg max-w-7xl w-full p-4 sm:p-6 shadow-sm h-[95vh] overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Columna Izquierda (7/12 Cols) */}
            <div className="lg:col-span-7 flex flex-col h-full overflow-hidden pr-2 border-r border-[#e5e7e4]">
              {/* Header Modal */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7e4] pb-3 text-sm shrink-0">
                <div className="flex items-center gap-2.5 text-gray-600 font-medium">
                  <Building className="w-4 h-4 text-[#f97316]" />
                  <span className="font-bold text-sm text-[#252b2d]">{selectedOp.cliente?.nombre || 'Jesus Rodriguez'}</span>
                  <span className="text-gray-600">/</span>
                  <span className="text-gray-700 font-bold font-mono text-sm">{selectedOp.codigo}</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-indigo-800 uppercase bg-indigo-50 px-3 py-1 rounded-md border border-indigo-200">
                    Estado Logístico: {selectedOrden?.estado?.toUpperCase() || 'REVENTA'}
                  </span>
                  <button
                    onClick={() => setSelectedOp(null)}
                    className="text-gray-400 hover:text-[#252b2d] font-bold text-xl px-2"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Título de la Oportunidad */}
              <div className="py-3 border-b border-[#e5e7e4] shrink-0">
                <h2 className="text-xl font-extrabold text-[#252b2d]">{selectedOp.titulo}</h2>
              </div>

              {/* Acordeones (Todos cerrados por defecto) */}
              <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 py-4 scrollbar-thin">
                {/* Accordion 1: Contacto */}
                <div className="bg-white rounded-lg border border-[#e5e7e4] overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, contacto: !openSections.contacto })}
                    className="w-full p-4 bg-[#f4f5f3] text-[#f97316] font-extrabold text-sm uppercase tracking-normal flex items-center justify-between border-b border-[#e5e7e4]"
                  >
                    <div className="flex items-center gap-2.5">
                      <User className="w-4 h-4 text-[#f97316]" />
                      <span>1. Contacto del Cliente</span>
                    </div>
                    {openSections.contacto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {openSections.contacto && (
                    <div className="p-4 space-y-3 text-xs text-gray-600 bg-[#fafaf9]">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-gray-500 font-bold uppercase text-[10px]">Nombre</span>
                          <p className="font-extrabold text-[#252b2d] text-sm">{selectedOp.cliente?.nombre}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 font-bold uppercase text-[10px]">RUT</span>
                          <p className="font-mono text-gray-600">{selectedOp.cliente?.rut || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Accordion 2: Cotizaciones */}
                <div className="bg-white rounded-lg border border-[#e5e7e4] overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, productos: !openSections.productos })}
                    className="w-full p-4 bg-[#f4f5f3] text-[#f97316] font-extrabold text-sm uppercase tracking-normal flex items-center justify-between border-b border-[#e5e7e4]"
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-[#f97316]" />
                      <span>2. Cotizaciones de la Oportunidad</span>
                    </div>
                    {openSections.productos ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {openSections.productos && (
                    <div className="p-4 space-y-3 text-xs text-gray-600 bg-[#fafaf9]">
                      <p className="italic text-gray-400">Cotización v2 Aprobada ($1.755.250)</p>
                    </div>
                  )}
                </div>

                {/* Accordion 3: Finanzas & Abonos */}
                <div className="bg-white rounded-lg border border-[#e5e7e4] overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, finanzas: !openSections.finanzas })}
                    className="w-full p-4 bg-[#f4f5f3] text-[#f97316] font-extrabold text-sm uppercase tracking-normal flex items-center justify-between border-b border-[#e5e7e4]"
                  >
                    <div className="flex items-center gap-2.5">
                      <DollarSign className="w-4 h-4 text-[#f97316]" />
                      <span>3. Finanzas & Abonos</span>
                    </div>
                    {openSections.finanzas ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {openSections.finanzas && (
                    <div className="p-4 space-y-3 text-xs text-gray-600 bg-[#fafaf9]">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-white rounded-md border border-[#e5e7e4]">
                          <span className="text-[10px] text-gray-500 font-bold uppercase">Total Venta</span>
                          <p className="font-extrabold text-[#252b2d]">${getOportunidadTotalValue(selectedOp).toLocaleString('es-CL')}</p>
                        </div>
                        <div className="p-2 bg-white rounded-md border border-[#e5e7e4]">
                          <span className="text-[10px] text-emerald-400 font-bold uppercase">Abonado</span>
                          <p className="font-extrabold text-emerald-400">${getOportunidadAbonadoValue(selectedOp).toLocaleString('es-CL')}</p>
                        </div>
                        <div className="p-2 bg-white rounded-md border border-[#e5e7e4]">
                          <span className="text-[10px] text-[#f97316] font-bold uppercase">Saldo Pendiente</span>
                          <p className="font-extrabold text-[#f97316]">${(getOportunidadTotalValue(selectedOp) - getOportunidadAbonadoValue(selectedOp)).toLocaleString('es-CL')}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Accordion 6: Datos de Logística & Reventa */}
                <div className="bg-white rounded-lg border border-[#e5e7e4] overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, reventa: !openSections.reventa })}
                    className="w-full p-4 bg-[#f4f5f3] text-[#f97316] font-extrabold text-sm uppercase tracking-normal flex items-center justify-between border-b border-[#e5e7e4]"
                  >
                    <div className="flex items-center gap-2.5">
                      <Truck className="w-4 h-4 text-[#f97316]" />
                      <span>6. Datos de Logística & Reventa</span>
                    </div>
                    {openSections.reventa ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {openSections.reventa && (
                    <div className="p-4 space-y-4 text-xs text-gray-600 bg-[#fafaf9]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-gray-600 mb-1">Estado Logístico</label>
                          <select
                            value={selectedOrden?.estado || 'coordinacion_proveedor'}
                            onChange={(e) => {
                              if (selectedOrden) moveOrdenState(selectedOrden.id, selectedOrden.oportunidad_id, e.target.value as EstadoReventa);
                            }}
                            className="w-full bg-white border border-[#e5e7e4] text-indigo-800 font-bold rounded-md px-3 py-2 text-xs focus:outline-none focus:border-[#f97316]"
                          >
                            {ETAPAS_REVENTA.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-gray-600 mb-1">Proveedor Asignado</label>
                          <input
                            type="text"
                            placeholder="Nombre del proveedor o distribuidor..."
                            value={selectedOrden?.proveedor_nombre || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              if (selectedOrden) {
                                setSelectedOrden({ ...selectedOrden, proveedor_nombre: val });
                                if (isUUID(selectedOrden.oportunidad_id)) {
                                  await supabase.from('ordenes_reventa').upsert([{
                                    oportunidad_id: selectedOrden.oportunidad_id,
                                    codigo: selectedOrden.codigo,
                                    titulo: selectedOrden.titulo,
                                    cliente_id: selectedOrden.cliente_id,
                                    proveedor_nombre: val,
                                  }], { onConflict: 'oportunidad_id' });
                                }
                              }
                            }}
                            className="w-full bg-white border border-[#e5e7e4] text-[#252b2d] rounded-md px-3 py-2 text-xs focus:outline-none focus:border-[#f97316]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-gray-600 mb-1">Fecha Despacho</label>
                          <input
                            type="date"
                            value={selectedOrden?.fecha_despacho || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              if (selectedOrden) {
                                setSelectedOrden({ ...selectedOrden, fecha_despacho: val });
                                if (isUUID(selectedOrden.oportunidad_id)) {
                                  await supabase.from('ordenes_reventa').upsert([{
                                    oportunidad_id: selectedOrden.oportunidad_id,
                                    codigo: selectedOrden.codigo,
                                    titulo: selectedOrden.titulo,
                                    cliente_id: selectedOrden.cliente_id,
                                    fecha_despacho: val,
                                  }], { onConflict: 'oportunidad_id' });
                                }
                              }
                            }}
                            className="w-full bg-white border border-[#e5e7e4] text-[#252b2d] font-mono rounded-md px-3 py-2 text-xs focus:outline-none focus:border-[#f97316]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold text-gray-600 mb-1">Notas de Postventa & Seguimiento</label>
                        <textarea
                          rows={2}
                          placeholder="Añadir observaciones de entrega, garantías o postventa..."
                          value={selectedOrden?.notas_postventa || ''}
                          onChange={async (e) => {
                            const val = e.target.value;
                            if (selectedOrden) {
                              setSelectedOrden({ ...selectedOrden, notas_postventa: val });
                              if (isUUID(selectedOrden.oportunidad_id)) {
                                await supabase.from('ordenes_reventa').upsert([{
                                  oportunidad_id: selectedOrden.oportunidad_id,
                                  codigo: selectedOrden.codigo,
                                  titulo: selectedOrden.titulo,
                                  cliente_id: selectedOrden.cliente_id,
                                  notas_postventa: val,
                                }], { onConflict: 'oportunidad_id' });
                              }
                            }
                          }}
                          className="w-full bg-white border border-[#e5e7e4] text-[#252b2d] rounded-md p-2.5 text-xs focus:outline-none focus:border-[#f97316]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Columna Derecha (5/12 Cols): Feed de Actividades & Chat */}
            <div className="lg:col-span-5 bg-white rounded-lg border border-[#e5e7e4] p-4 flex flex-col justify-between h-full overflow-hidden shadow-sm">
              <div className="space-y-3.5 flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#e5e7e4] pb-3">
                  <h3 className="font-black text-base text-[#252b2d] uppercase tracking-normal flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-[#f97316]" />
                    <span>Actividad & Chat Feed</span>
                  </h3>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
                  {opActivities.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-xs italic">
                      Sin mensajes o actividades registradas.
                    </div>
                  ) : (
                    opActivities.map((act) => (
                      <div key={act.id} className="bg-white p-3 rounded-lg border border-[#e5e7e4] space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-[#f97316]">{act.usuario_nombre}</span>
                          <span className="text-[10px] text-gray-500 font-mono">
                            {new Date(act.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700">{act.contenido}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Chat Input */}
              <div className="pt-3 border-t border-[#e5e7e4] flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Escribir comentario o mensaje..."
                  value={newChatText}
                  onChange={(e) => setNewChatText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChatMessage()}
                  className="flex-1 bg-white border border-[#e5e7e4] text-[#252b2d] rounded-md px-3 py-2 text-xs focus:outline-none focus:border-[#f97316]"
                />
                <button
                  onClick={handleSendChatMessage}
                  className="p-2 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-md transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
