'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { useAuth } from '../../lib/context/AuthContext';
import {
  ProyectoPlanificacion,
  EstadoPlanificacion,
  OportunidadVenta,
  Cotizacion,
  ChatMensaje,
  VisitaTerreno,
} from '../../lib/types';
import { PdfPreviewModal } from '../../components/PdfPreviewModal';
import {
  Factory,
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

const ETAPAS_PLANIFICACION: { id: EstadoPlanificacion; label: string; color: string; bg: string; border: string }[] = [
  { id: 'pendiente', label: '1. Pendiente Planificación', color: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-200' },
  { id: 'cola_produccion', label: '2. En Cola de Fabricación', color: 'text-blue-800', bg: 'bg-blue-50', border: 'border-blue-200' },
  { id: 'fabricacion', label: '3. En Fabricación', color: 'text-purple-800', bg: 'bg-purple-50', border: 'border-purple-200' },
  { id: 'listo_instalacion', label: '4. Listo p/ Instalación', color: 'text-indigo-800', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  { id: 'instalacion', label: '5. En Instalación', color: 'text-orange-800', bg: 'bg-orange-50', border: 'border-orange-200' },
  { id: 'finalizado', label: '6. Finalizado / Entregado', color: 'text-emerald-800', bg: 'bg-emerald-50', border: 'border-emerald-200' },
];

function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export default function PlanificacionPage() {
  const { currentUser } = useAuth();
  const [proyectos, setProyectos] = useState<(ProyectoPlanificacion & { oportunidad?: OportunidadVenta })[]>([]);
  const [loading, setLoading] = useState(true);

  // Vista de Lista primero siempre por defecto
  const [activeTab, setActiveTab] = useState<'lista' | 'tablero'>('lista');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Modal Full Oportunidad
  const [selectedOp, setSelectedOp] = useState<OportunidadVenta | null>(null);
  const [selectedProyecto, setSelectedProyecto] = useState<ProyectoPlanificacion | null>(null);

  // Accordion state (Todas cerradas por defecto)
  const [openSections, setOpenSections] = useState({
    contacto: false,
    productos: false,
    finanzas: false,
    visita: false,
    produccion: false,
  });

  // Full Opportunity Chat / Activities
  const [opActivities, setOpActivities] = useState<ChatMensaje[]>([]);
  const [newChatText, setNewChatText] = useState('');
  const [pdfPreviewCotizacion, setPdfPreviewCotizacion] = useState<Cotizacion | null>(null);

  const supabase = createClient();

  const loadProyectos = async () => {
    try {
      setLoading(true);

      // Cargar todas las oportunidades cerradas y los proyectos de planificación
      const [opRes, planRes] = await Promise.all([
        supabase
          .from('oportunidades')
          .select('*, cliente:clientes(*), cotizaciones(*), abonos(*)')
          .eq('estado_pipeline', 'entregada'),
        supabase
          .from('proyectos_planificacion')
          .select('*'),
      ]);

      const planMap = new Map<string, any>();
      (planRes.data || []).forEach((p) => {
        if (p.oportunidad_id) planMap.set(p.oportunidad_id, p);
      });

      const combined: (ProyectoPlanificacion & { oportunidad?: OportunidadVenta })[] = [];

      (opRes.data || []).forEach((op: any) => {
        const isReventa = op.tipo_venta === 'Suministro' || op.tipo_venta === 'Reventa de Material';
        if (isReventa) return; // Solo produccion/instalacion en esta página

        const planRecord = planMap.get(op.id);
        combined.push({
          id: planRecord?.id || `plan-${op.id}`,
          oportunidad_id: op.id,
          codigo: op.codigo,
          titulo: op.titulo,
          cliente_id: op.cliente_id,
          cliente: op.cliente,
          estado: (planRecord?.estado as EstadoPlanificacion) || 'pendiente',
          fecha_estimada_produccion: planRecord?.fecha_estimada_produccion || null,
          fecha_estimada_instalacion: planRecord?.fecha_estimada_instalacion || null,
          observaciones: planRecord?.observaciones || 'Vinculado desde Venta Cerrada.',
          oportunidad: op,
        });
      });

      setProyectos(combined);
    } catch (err) {
      console.error('Error cargando proyectos de producción:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    loadProyectos();

    const channel1 = supabase
      .channel('realtime_plan_table')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proyectos_planificacion' },
        () => {
          if (!ignore) loadProyectos();
        }
      )
      .subscribe();

    const channel2 = supabase
      .channel('realtime_plan_ops')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'oportunidades' },
        () => {
          if (!ignore) loadProyectos();
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, []);

  const moveProyectoState = async (id: string, opId: string, targetEstado: EstadoPlanificacion) => {
    setProyectos((prev) =>
      prev.map((p) => (p.oportunidad_id === opId || p.id === id ? { ...p, estado: targetEstado } : p))
    );

    if (selectedProyecto && (selectedProyecto.oportunidad_id === opId || selectedProyecto.id === id)) {
      setSelectedProyecto({ ...selectedProyecto, estado: targetEstado });
    }

    if (isUUID(opId)) {
      try {
        await supabase.from('proyectos_planificacion').upsert([
          {
            oportunidad_id: opId,
            codigo: selectedProyecto?.codigo || 'OP-2790',
            titulo: selectedProyecto?.titulo || 'Proyecto',
            cliente_id: selectedProyecto?.cliente_id,
            estado: targetEstado,
          },
        ], { onConflict: 'oportunidad_id' });
      } catch (err) {
        console.error('Error moviendo estado en producción:', err);
      }
    }
  };

  // Helper to open Full Opportunity Modal inside Producción
  const handleOpenProyectoModal = async (proy: ProyectoPlanificacion & { oportunidad?: OportunidadVenta }) => {
    setSelectedProyecto(proy);
    const op = proy.oportunidad || {
      id: proy.oportunidad_id,
      codigo: proy.codigo,
      titulo: proy.titulo,
      cliente_id: proy.cliente_id,
      cliente: proy.cliente,
      estado_pipeline: 'entregada',
    } as OportunidadVenta;

    setSelectedOp(op);
    setOpenSections({
      contacto: false,
      productos: false,
      finanzas: false,
      visita: false,
      produccion: false,
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
          data.map((a) => ({
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

  const filteredProyectos = proyectos.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.codigo?.toLowerCase().includes(q) ||
      p.titulo?.toLowerCase().includes(q) ||
      p.cliente?.nombre?.toLowerCase().includes(q) ||
      p.oportunidad?.titulo?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Top Header Estilo Ventas 100% Idéntico */}
      <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase text-[#F7931F] bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-200">
              Gestión de Fabricación & Terreno
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-[#363636] flex items-center gap-2.5">
            <Factory className="w-7 h-7 text-[#F7931F]" />
            <span>Pipeline de Producción</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Misma oportunidad de venta vinculada para el control de etapas de producción e instalación.
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

          <Link
            href="/planificacion/calendario"
            className="px-4 py-2 bg-[#363636] hover:bg-black text-white font-bold text-xs rounded-xl transition shadow-sm flex items-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            <span>Ver Calendario de Entregas</span>
          </Link>
        </div>
      </div>

      {/* Barra de Búsqueda */}
      <div className="flex items-center bg-white border border-gray-200 rounded-2xl px-4 py-2.5 text-xs shadow-sm">
        <Search className="w-4 h-4 text-gray-400 mr-2" />
        <input
          type="text"
          placeholder="Buscar por código, título de proyecto o cliente..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-transparent text-[#363636] focus:outline-none placeholder-gray-400 font-semibold"
        />
      </div>

      {/* VISTA 1: LISTA AGRUPADA POR ESTADOS (EXACTO A IMAGEN 1 DE VENTAS) */}
      {activeTab === 'lista' ? (
        <div className="space-y-6 animate-fadeIn">
          {ETAPAS_PLANIFICACION.map((col) => {
            const isCollapsed = !!collapsedSections[col.id];
            const colProyectos = filteredProyectos.filter((p) => p.estado === col.id);

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
                      {colProyectos.length}
                    </span>
                  </div>
                </div>

                {/* Tabla con las Mismas Columnas exactas de Ventas (IMAGEN 1) */}
                {!isCollapsed && (
                  <div>
                    {colProyectos.length === 0 ? (
                      <div className="py-4 px-2 text-xs text-gray-400 italic">
                        No hay oportunidades en esta etapa.
                      </div>
                    ) : (
                      <div className="overflow-x-auto bg-white rounded-2xl border border-gray-200/80 shadow-xs">
                        <table className="w-full text-left text-xs min-w-[1050px] table-fixed border-collapse">
                          <thead className="text-gray-500 uppercase text-xs font-extrabold border-b border-gray-200 bg-gray-50/50">
                            <tr>
                              <th className="py-3 px-3 w-10 text-center"></th>
                              <th className="py-3 px-3 w-28 text-left font-extrabold uppercase tracking-wider">Código</th>
                              <th className="py-3 px-3 text-left font-extrabold uppercase tracking-wider">Oportunidad / Nombre</th>
                              <th className="py-3 px-3 text-left font-extrabold uppercase tracking-wider">Cliente</th>
                              <th className="py-3 px-3 text-left font-extrabold uppercase tracking-wider">Tipo Venta</th>
                              <th className="py-3 px-3 text-left font-extrabold uppercase tracking-wider">Prioridad</th>
                              <th className="py-3 px-3 text-left font-extrabold uppercase tracking-wider">Fecha Inicio</th>
                              <th className="py-3 px-3 text-left font-extrabold uppercase tracking-wider">Fecha Límite</th>
                              <th className="py-3 px-3 text-right font-extrabold uppercase tracking-wider">Monto Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-semibold text-[#363636]">
                            {colProyectos.map((proy) => {
                              const op = proy.oportunidad;
                              const monto = getOportunidadTotalValue(op);

                              return (
                                <tr
                                  key={proy.id}
                                  className="hover:bg-orange-50/40 transition group cursor-pointer text-xs"
                                  onClick={() => handleOpenProyectoModal(proy)}
                                >
                                  <td className="py-3 px-3 text-center">
                                    <div className="w-3 h-3 rounded-full border border-gray-400 bg-white group-hover:border-[#F7931F] mx-auto" />
                                  </td>
                                  <td className="py-3 px-3 font-mono font-bold text-[#F7931F]">{proy.codigo}</td>
                                  <td className="py-3 px-3 font-bold text-[#363636]">{proy.titulo}</td>
                                  <td className="py-3 px-3 text-[#F7931F] font-bold">
                                    {proy.cliente?.nombre || 'Jesus Rodriguez'}
                                  </td>
                                  <td className="py-3 px-3">
                                    <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full text-[11px] font-bold">
                                      {op?.tipo_venta || 'Instalación'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3">
                                    <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[11px] font-bold">
                                      {op?.prioridad || 'Alta'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 font-mono text-gray-600">{op?.fecha_inicio || '2026-07-21'}</td>
                                  <td className="py-3 px-3 font-mono font-bold text-amber-800">{op?.fecha_limite || '2026-08-04'}</td>
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
          {ETAPAS_PLANIFICACION.map((col) => {
            const colProyectos = filteredProyectos.filter((p) => p.estado === col.id);

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
                    {colProyectos.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
                  {colProyectos.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-center text-gray-400 italic text-xs border border-dashed border-gray-200 rounded-2xl bg-white/50">
                      Sin oportunidades aquí
                    </div>
                  ) : (
                    colProyectos.map((proy) => {
                      const op = proy.oportunidad;
                      const montoTotal = getOportunidadTotalValue(op);
                      const abonado = getOportunidadAbonadoValue(op);
                      const saldo = Math.max(0, montoTotal - abonado);

                      return (
                        <div
                          key={proy.id}
                          onClick={() => handleOpenProyectoModal(proy)}
                          className="bg-white hover:bg-orange-50/20 p-4 rounded-2xl border border-gray-200 hover:border-[#F7931F] transition cursor-pointer space-y-3 shadow-sm group"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-mono font-bold text-[#363636]">
                              <GripVertical className="w-3.5 h-3.5 text-gray-400" />
                              <span>{proy.codigo}</span>
                            </div>
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                              Cot. v2
                            </span>
                          </div>

                          <h4 className="font-extrabold text-[#363636] text-sm leading-snug group-hover:text-[#F7931F] transition">
                            {proy.titulo}
                          </h4>

                          <div className="flex items-center gap-1.5 text-xs text-[#F7931F] font-bold">
                            <User className="w-3.5 h-3.5 text-[#F7931F] shrink-0" />
                            <span className="truncate">{proy.cliente?.nombre || 'Jesus Rodriguez'}</span>
                          </div>

                          <div className="pt-2 border-t border-gray-100 text-[11px] space-y-1 font-mono">
                            <div className="flex items-center justify-between text-gray-600">
                              <span>📅 Inicio:</span>
                              <span>{op?.fecha_inicio || '2026-07-21'}</span>
                            </div>
                            <div className="flex items-center justify-between text-amber-800 font-bold">
                              <span>⏰ Límite Término:</span>
                              <span>{op?.fecha_limite || '2026-08-04'}</span>
                            </div>
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
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Mover a:</span>
                            <select
                              value={proy.estado}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => moveProyectoState(proy.id, proy.oportunidad_id, e.target.value as EstadoPlanificacion)}
                              className="bg-gray-100 text-[#363636] text-[10px] font-bold rounded-lg px-2 py-1 border border-gray-200 focus:outline-none focus:border-[#F7931F]"
                            >
                              {ETAPAS_PLANIFICACION.map((e) => (
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

      {/* FULL UNIFIED OPORTUNIDAD MODAL (Nativo en Producción sin redirigir) */}
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
                  <span className="text-xs font-bold text-amber-400 uppercase bg-amber-950/60 px-3 py-1 rounded-xl border border-amber-700/50">
                    Etapa: {selectedProyecto?.estado?.toUpperCase() || 'PRODUCCIÓN'}
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

                {/* Accordion 4: Visita a Terreno */}
                <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, visita: !openSections.visita })}
                    className="w-full p-4 bg-[#27272a] text-[#F7931F] font-extrabold text-sm uppercase tracking-wider flex items-center justify-between border-b border-gray-800"
                  >
                    <div className="flex items-center gap-2.5">
                      <Calendar className="w-4 h-4 text-[#F7931F]" />
                      <span>4. Visita a Terreno</span>
                    </div>
                    {openSections.visita ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {openSections.visita && (
                    <div className="p-4 text-xs text-gray-400 italic bg-[#1e1e22]">
                      Sección de Visita a Terreno asociada.
                    </div>
                  )}
                </div>

                {/* Accordion 5: Datos de Producción & Fabricación */}
                <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, produccion: !openSections.produccion })}
                    className="w-full p-4 bg-[#27272a] text-[#F7931F] font-extrabold text-sm uppercase tracking-wider flex items-center justify-between border-b border-gray-800"
                  >
                    <div className="flex items-center gap-2.5">
                      <Factory className="w-4 h-4 text-[#F7931F]" />
                      <span>5. Datos de Producción & Fabricación</span>
                    </div>
                    {openSections.produccion ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {openSections.produccion && (
                    <div className="p-4 space-y-4 text-xs text-gray-300 bg-[#1e1e22]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-gray-300 mb-1">Estado de Producción</label>
                          <select
                            value={selectedProyecto?.estado || 'pendiente'}
                            onChange={(e) => {
                              if (selectedProyecto) moveProyectoState(selectedProyecto.id, selectedProyecto.oportunidad_id, e.target.value as EstadoPlanificacion);
                            }}
                            className="w-full bg-[#18181b] border border-gray-700 text-amber-400 font-bold rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F7931F]"
                          >
                            {ETAPAS_PLANIFICACION.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-gray-300 mb-1">Estimación Fabricación</label>
                          <input
                            type="date"
                            value={selectedProyecto?.fecha_estimada_produccion || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              if (selectedProyecto) {
                                setSelectedProyecto({ ...selectedProyecto, fecha_estimada_produccion: val });
                                if (isUUID(selectedProyecto.oportunidad_id)) {
                                  await supabase.from('proyectos_planificacion').upsert([{
                                    oportunidad_id: selectedProyecto.oportunidad_id,
                                    codigo: selectedProyecto.codigo,
                                    titulo: selectedProyecto.titulo,
                                    cliente_id: selectedProyecto.cliente_id,
                                    fecha_estimada_produccion: val,
                                  }], { onConflict: 'oportunidad_id' });
                                }
                              }
                            }}
                            className="w-full bg-[#18181b] border border-gray-700 text-white font-mono rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F7931F]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-gray-300 mb-1">Estimación Instalación</label>
                          <input
                            type="date"
                            value={selectedProyecto?.fecha_estimada_instalacion || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              if (selectedProyecto) {
                                setSelectedProyecto({ ...selectedProyecto, fecha_estimada_instalacion: val });
                                if (isUUID(selectedProyecto.oportunidad_id)) {
                                  await supabase.from('proyectos_planificacion').upsert([{
                                    oportunidad_id: selectedProyecto.oportunidad_id,
                                    codigo: selectedProyecto.codigo,
                                    titulo: selectedProyecto.titulo,
                                    cliente_id: selectedProyecto.cliente_id,
                                    fecha_estimada_instalacion: val,
                                  }], { onConflict: 'oportunidad_id' });
                                }
                              }
                            }}
                            className="w-full bg-[#18181b] border border-gray-700 text-white font-mono rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F7931F]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold text-gray-300 mb-1">Observaciones Técnicas / Planta</label>
                        <textarea
                          rows={2}
                          placeholder="Instrucciones específicas de corte, templado, armado o logística de instalación..."
                          value={selectedProyecto?.observaciones || ''}
                          onChange={async (e) => {
                            const val = e.target.value;
                            if (selectedProyecto) {
                              setSelectedProyecto({ ...selectedProyecto, observaciones: val });
                              if (isUUID(selectedProyecto.oportunidad_id)) {
                                await supabase.from('proyectos_planificacion').upsert([{
                                  oportunidad_id: selectedProyecto.oportunidad_id,
                                  codigo: selectedProyecto.codigo,
                                  titulo: selectedProyecto.titulo,
                                  cliente_id: selectedProyecto.cliente_id,
                                  observaciones: val,
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

      {pdfPreviewCotizacion && (
        <PdfPreviewModal cotizacion={pdfPreviewCotizacion} onClose={() => setPdfPreviewCotizacion(null)} />
      )}
    </div>
  );
}
