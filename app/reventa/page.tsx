'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { useAuth } from '../../lib/context/AuthContext';
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

      const [opRes, revRes] = await Promise.all([
        supabase
          .from('oportunidades')
          .select('*, cliente:clientes(*), cotizaciones(*), abonos(*)')
          .eq('estado_pipeline', 'entregada'),
        supabase
          .from('ordenes_reventa')
          .select('*'),
      ]);

      const revMap = new Map<string, any>();
      (revRes.data || []).forEach((r: any) => {
        if (r.oportunidad_id) revMap.set(r.oportunidad_id, r);
      });

      const combined: (OrdenReventa & { oportunidad?: OportunidadVenta })[] = [];

      (opRes.data || []).forEach((op: any) => {
        const isReventa = op.tipo_venta === 'Suministro' || op.tipo_venta === 'Reventa de Material';
        if (!isReventa) return; // Solo reventa en esta página

        const revRecord = revMap.get(op.id);
        combined.push({
          id: revRecord?.id || `rev-${op.id}`,
          oportunidad_id: op.id,
          codigo: op.codigo,
          titulo: op.titulo,
          cliente_id: op.cliente_id,
          cliente: op.cliente,
          estado: (revRecord?.estado as EstadoReventa) || 'coordinacion_proveedor',
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
    if (!op || !op.abonos || op.abonos.length === 0) return 0;
    return op.abonos.reduce((sum, a) => sum + (a.monto || 0), 0);
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
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Top Header Estilo Ventas 100% Idéntico */}
      <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase text-[#F7931F] bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-200">
              Gestión Logística & Proveedores
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-[#363636] flex items-center gap-2.5">
            <Truck className="w-7 h-7 text-[#F7931F]" />
            <span>Pipeline de Reventa & Proveedores</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Misma oportunidad de venta vinculada para la coordinación de compras con proveedores, stock y despachos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Toggle Vista Lista vs Tablero */}
          <div className="flex items-center bg-gray-100 p-1 rounded-2xl border border-gray-200">
            <button
              onClick={() => setActiveTab('lista')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs transition ${
                activeTab === 'lista'
                  ? 'bg-[#F7931F] text-white shadow-sm'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              <ListIcon className="w-4 h-4" />
              <span>Lista</span>
            </button>
            <button
              onClick={() => setActiveTab('tablero')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs transition ${
                activeTab === 'tablero'
                  ? 'bg-[#F7931F] text-white shadow-sm'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Tablero</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Búsqueda */}
      <div className="flex items-center bg-white border border-gray-200 rounded-2xl px-4 py-2.5 text-xs shadow-sm">
        <Search className="w-4 h-4 text-gray-400 mr-2" />
        <input
          type="text"
          placeholder="Buscar por código, suministro, cliente o proveedor..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-transparent text-[#363636] focus:outline-none placeholder-gray-400 font-semibold"
        />
      </div>

      {/* VISTA 1: LISTA AGRUPADA POR ESTADOS (EXACTO A IMAGEN 1 DE VENTAS) */}
      {activeTab === 'lista' ? (
        <div className="space-y-6 animate-fadeIn">
          {ETAPAS_REVENTA.map((col) => {
            const isCollapsed = !!collapsedSections[col.id];
            const colOrdenes = filteredOrdenes.filter((o) => o.estado === col.id);

            return (
              <div key={col.id} className="space-y-2 mb-6">
                {/* Accordion Group Header Estilo ClickUp */}
                <div
                  onClick={() =>
                    setCollapsedSections((prev) => ({ ...prev, [col.id]: !prev[col.id] }))
                  }
                  className="flex items-center justify-between py-2 px-1 border-b border-gray-200/80 cursor-pointer select-none transition group"
                >
                  <div className="flex items-center gap-2.5">
                    <button type="button" className="text-gray-400 group-hover:text-[#363636] transition">
                      {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 ${col.bg} ${col.color} border ${col.border} shadow-2xs`}>
                      <div className="w-2 h-2 rounded-full border border-current shadow-xs" />
                      <span>{col.label}</span>
                    </span>

                    <span className="font-mono text-xs text-gray-500 font-extrabold bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                      {colOrdenes.length}
                    </span>
                  </div>
                </div>

                {/* Tabla de la etapa */}
                {!isCollapsed && (
                  <div>
                    {colOrdenes.length === 0 ? (
                      <div className="py-4 px-2 text-xs text-gray-400 italic">
                        No hay órdenes de reventa en esta etapa.
                      </div>
                    ) : (
                      <div className="overflow-x-auto bg-white rounded-2xl border border-gray-200/80 shadow-xs">
                        <table className="w-full text-left text-xs min-w-[1050px] table-fixed border-collapse">
                          <thead className="text-gray-500 uppercase text-xs font-extrabold border-b border-gray-200 bg-gray-50/50">
                            <tr>
                              <th className="py-3 px-3 w-10 text-center"></th>
                              <th className="py-3 px-3 w-28 text-left font-extrabold uppercase tracking-wider">Código</th>
                              <th className="py-3 px-3 text-left font-extrabold uppercase tracking-wider">Oportunidad / Suministro</th>
                              <th className="py-3 px-3 text-left font-extrabold uppercase tracking-wider">Cliente</th>
                              <th className="py-3 px-3 text-left font-extrabold uppercase tracking-wider">Proveedor</th>
                              <th className="py-3 px-3 text-left font-extrabold uppercase tracking-wider">Prioridad</th>
                              <th className="py-3 px-3 text-left font-extrabold uppercase tracking-wider">Fecha Despacho</th>
                              <th className="py-3 px-3 text-right font-extrabold uppercase tracking-wider">Monto Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-semibold text-[#363636]">
                            {colOrdenes.map((ord) => {
                              const op = ord.oportunidad;
                              const monto = getOportunidadTotalValue(op);

                              return (
                                <tr
                                  key={ord.id}
                                  className="hover:bg-orange-50/40 transition group cursor-pointer text-xs"
                                  onClick={() => handleOpenOrdenModal(ord)}
                                >
                                  <td className="py-3 px-3 text-center">
                                    <div className="w-3 h-3 rounded-full border border-gray-400 bg-white group-hover:border-[#F7931F] mx-auto" />
                                  </td>
                                  <td className="py-3 px-3 font-mono font-bold text-[#F7931F]">{ord.codigo}</td>
                                  <td className="py-3 px-3 font-bold text-[#363636]">{ord.titulo}</td>
                                  <td className="py-3 px-3 text-[#F7931F] font-bold">
                                    {ord.cliente?.nombre || 'Jesus Rodriguez'}
                                  </td>
                                  <td className="py-3 px-3 text-amber-700 font-bold">{ord.proveedor_nombre || 'Por asignar'}</td>
                                  <td className="py-3 px-3">
                                    <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[11px] font-bold">
                                      {op?.prioridad || 'Alta'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 font-mono text-gray-600">{ord.fecha_despacho || 'Por definir'}</td>
                                  <td className="py-3 px-3 text-right font-bold text-[#363636]">
                                    ${monto.toLocaleString('es-CL')}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
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
                className="bg-gray-50 rounded-3xl border border-gray-200 p-4 flex flex-col min-h-[600px] shadow-sm space-y-3"
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
                    <div className="h-32 flex items-center justify-center text-center text-gray-400 italic text-xs border border-dashed border-gray-200 rounded-2xl bg-white/50">
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
                          className="bg-white hover:bg-orange-50/20 p-4 rounded-2xl border border-gray-200 hover:border-[#F7931F] transition cursor-pointer space-y-3 shadow-sm group"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-mono font-bold text-[#363636]">
                              <GripVertical className="w-3.5 h-3.5 text-gray-400" />
                              <span>{ord.codigo}</span>
                            </div>
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                              Cot. v2
                            </span>
                          </div>

                          <h4 className="font-extrabold text-[#363636] text-sm leading-snug group-hover:text-[#F7931F] transition">
                            {ord.titulo}
                          </h4>

                          <div className="flex items-center gap-1.5 text-xs text-[#F7931F] font-bold">
                            <User className="w-3.5 h-3.5 text-[#F7931F] shrink-0" />
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
                            <div className="flex items-center justify-between text-[#F7931F] font-black">
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
                              className="bg-gray-100 text-[#363636] text-[10px] font-bold rounded-lg px-2 py-1 border border-gray-200 focus:outline-none focus:border-[#F7931F]"
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
          className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 z-50 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedOp(null);
          }}
        >
          <div className="bg-[#18181b] text-gray-100 border border-gray-800 rounded-3xl max-w-7xl w-full p-4 sm:p-6 shadow-2xl h-[95vh] overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Columna Izquierda (7/12 Cols) */}
            <div className="lg:col-span-7 flex flex-col h-full overflow-hidden pr-2 border-r border-gray-800/80">
              {/* Header Modal */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3 text-sm shrink-0">
                <div className="flex items-center gap-2.5 text-gray-300 font-medium">
                  <Building className="w-4 h-4 text-[#F7931F]" />
                  <span className="font-bold text-sm text-white">{selectedOp.cliente?.nombre || 'Jesus Rodriguez'}</span>
                  <span className="text-gray-600">/</span>
                  <span className="text-gray-200 font-bold font-mono text-sm">{selectedOp.codigo}</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-indigo-400 uppercase bg-indigo-950/60 px-3 py-1 rounded-xl border border-indigo-700/50">
                    Estado Logístico: {selectedOrden?.estado?.toUpperCase() || 'REVENTA'}
                  </span>
                  <button
                    onClick={() => setSelectedOp(null)}
                    className="text-gray-400 hover:text-white font-bold text-xl px-2"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Título de la Oportunidad */}
              <div className="py-3 border-b border-gray-800 shrink-0">
                <h2 className="text-xl font-extrabold text-white">{selectedOp.titulo}</h2>
              </div>

              {/* Acordeones (Todos cerrados por defecto) */}
              <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 py-4 scrollbar-thin">
                {/* Accordion 1: Contacto */}
                <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, contacto: !openSections.contacto })}
                    className="w-full p-4 bg-[#27272a] text-[#F7931F] font-extrabold text-sm uppercase tracking-wider flex items-center justify-between border-b border-gray-800"
                  >
                    <div className="flex items-center gap-2.5">
                      <User className="w-4 h-4 text-[#F7931F]" />
                      <span>1. Contacto del Cliente</span>
                    </div>
                    {openSections.contacto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {openSections.contacto && (
                    <div className="p-4 space-y-3 text-xs text-gray-300 bg-[#1e1e22]">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-gray-500 font-bold uppercase text-[10px]">Nombre</span>
                          <p className="font-extrabold text-white text-sm">{selectedOp.cliente?.nombre}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 font-bold uppercase text-[10px]">RUT</span>
                          <p className="font-mono text-gray-300">{selectedOp.cliente?.rut || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Accordion 2: Cotizaciones */}
                <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, productos: !openSections.productos })}
                    className="w-full p-4 bg-[#27272a] text-[#F7931F] font-extrabold text-sm uppercase tracking-wider flex items-center justify-between border-b border-gray-800"
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-[#F7931F]" />
                      <span>2. Cotizaciones de la Oportunidad</span>
                    </div>
                    {openSections.productos ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {openSections.productos && (
                    <div className="p-4 space-y-3 text-xs text-gray-300 bg-[#1e1e22]">
                      <p className="italic text-gray-400">Cotización v2 Aprobada ($1.755.250)</p>
                    </div>
                  )}
                </div>

                {/* Accordion 3: Finanzas & Abonos */}
                <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, finanzas: !openSections.finanzas })}
                    className="w-full p-4 bg-[#27272a] text-[#F7931F] font-extrabold text-sm uppercase tracking-wider flex items-center justify-between border-b border-gray-800"
                  >
                    <div className="flex items-center gap-2.5">
                      <DollarSign className="w-4 h-4 text-[#F7931F]" />
                      <span>3. Finanzas & Abonos</span>
                    </div>
                    {openSections.finanzas ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {openSections.finanzas && (
                    <div className="p-4 space-y-3 text-xs text-gray-300 bg-[#1e1e22]">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-[#18181b] rounded-xl border border-gray-800">
                          <span className="text-[10px] text-gray-500 font-bold uppercase">Total Venta</span>
                          <p className="font-extrabold text-white">${getOportunidadTotalValue(selectedOp).toLocaleString('es-CL')}</p>
                        </div>
                        <div className="p-2 bg-[#18181b] rounded-xl border border-gray-800">
                          <span className="text-[10px] text-emerald-400 font-bold uppercase">Abonado</span>
                          <p className="font-extrabold text-emerald-400">${getOportunidadAbonadoValue(selectedOp).toLocaleString('es-CL')}</p>
                        </div>
                        <div className="p-2 bg-[#18181b] rounded-xl border border-gray-800">
                          <span className="text-[10px] text-[#F7931F] font-bold uppercase">Saldo Pendiente</span>
                          <p className="font-extrabold text-[#F7931F]">${(getOportunidadTotalValue(selectedOp) - getOportunidadAbonadoValue(selectedOp)).toLocaleString('es-CL')}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Accordion 6: Datos de Logística & Reventa */}
                <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, reventa: !openSections.reventa })}
                    className="w-full p-4 bg-[#27272a] text-[#F7931F] font-extrabold text-sm uppercase tracking-wider flex items-center justify-between border-b border-gray-800"
                  >
                    <div className="flex items-center gap-2.5">
                      <Truck className="w-4 h-4 text-[#F7931F]" />
                      <span>6. Datos de Logística & Reventa</span>
                    </div>
                    {openSections.reventa ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {openSections.reventa && (
                    <div className="p-4 space-y-4 text-xs text-gray-300 bg-[#1e1e22]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-gray-300 mb-1">Estado Logístico</label>
                          <select
                            value={selectedOrden?.estado || 'coordinacion_proveedor'}
                            onChange={(e) => {
                              if (selectedOrden) moveOrdenState(selectedOrden.id, selectedOrden.oportunidad_id, e.target.value as EstadoReventa);
                            }}
                            className="w-full bg-[#18181b] border border-gray-700 text-indigo-400 font-bold rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F7931F]"
                          >
                            {ETAPAS_REVENTA.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-gray-300 mb-1">Proveedor Asignado</label>
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
                            className="w-full bg-[#18181b] border border-gray-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F7931F]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-gray-300 mb-1">Fecha Despacho</label>
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
                            className="w-full bg-[#18181b] border border-gray-700 text-white font-mono rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F7931F]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold text-gray-300 mb-1">Notas de Postventa & Seguimiento</label>
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
                          className="w-full bg-[#18181b] border border-gray-700 text-white rounded-xl p-2.5 text-xs focus:outline-none focus:border-[#F7931F]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Columna Derecha (5/12 Cols): Feed de Actividades & Chat */}
            <div className="lg:col-span-5 bg-[#222226] rounded-2xl border border-gray-800 p-4 flex flex-col justify-between h-full overflow-hidden shadow-xl">
              <div className="space-y-3.5 flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                  <h3 className="font-black text-base text-white uppercase tracking-wider flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-[#F7931F]" />
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
                      <div key={act.id} className="bg-[#18181b] p-3 rounded-2xl border border-gray-800 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-[#F7931F]">{act.usuario_nombre}</span>
                          <span className="text-[10px] text-gray-500 font-mono">
                            {new Date(act.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs text-gray-200">{act.contenido}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Chat Input */}
              <div className="pt-3 border-t border-gray-800 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Escribir comentario o mensaje..."
                  value={newChatText}
                  onChange={(e) => setNewChatText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChatMessage()}
                  className="flex-1 bg-[#18181b] border border-gray-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F7931F]"
                />
                <button
                  onClick={handleSendChatMessage}
                  className="p-2 bg-[#F7931F] hover:bg-[#e08316] text-white rounded-xl transition"
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
