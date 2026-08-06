'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { OportunidadVenta, Cliente } from '../../lib/types';
import { useAuth } from '../../lib/context/AuthContext';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Building,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  ExternalLink,
  Filter,
  Search,
  Trash2,
} from 'lucide-react';

const isUUID = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

const TECNICOS = ['Felipe Valverde', 'Marcos Catalán', 'Edith Tapia'] as const;

export default function VisitasTerrenoPage() {
  const { currentUser } = useAuth();
  const searchParams = useSearchParams();
  const highlightedOpId = searchParams.get('opId');

  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTecnico, setSelectedTecnico] = useState<string>('todos');
  const [selectedEstado, setSelectedEstado] = useState<string>('todos');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modal para ver/editar visita seleccionada
  const [selectedVisitaOp, setSelectedVisitaOp] = useState<OportunidadVenta | null>(null);

  const supabase = createClient();

  const fetchOportunidades = async () => {
    try {
      const [opRes, visRes] = await Promise.all([
        supabase
          .from('oportunidades')
          .select('*, cliente:clientes(*)')
          .eq('requiere_visita_terreno', true),
        supabase
          .from('visitas_terreno')
          .select('*, oportunidad:oportunidades(*, cliente:clientes(*))')
          .order('fecha_visita_terreno', { ascending: true }),
      ]);

      const combinedOps: OportunidadVenta[] = [];

      // Add visits from visitas_terreno table (only for active opportunities where requiere_visita_terreno !== false)
      if (visRes.data) {
        for (const v of visRes.data) {
          const parentOp = v.oportunidad as any;

          // Skip visit if parent opportunity is turned off (requiere_visita_terreno === false)
          if (!parentOp || parentOp.requiere_visita_terreno === false) {
            continue;
          }

          combinedOps.push({
            id: v.id,
            codigo: parentOp?.codigo || 'OP-VISITA',
            titulo: parentOp?.titulo || 'Visita a Terreno',
            cliente_id: parentOp?.cliente_id || '',
            estado_pipeline: parentOp?.estado_pipeline || 'nueva',
            fecha_inicio: parentOp?.fecha_inicio || v.fecha_visita_terreno,
            tecnico_visita: v.tecnico_visita,
            fecha_visita_terreno: v.fecha_visita_terreno,
            hora_visita_terreno: v.hora_visita_terreno,
            estado_visita: v.estado_visita,
            observaciones_visita: v.observaciones_visita,
            cliente: parentOp?.cliente,
            cotizacion_actual_id: parentOp?.id,
          } as OportunidadVenta);
        }
      }

      // Add legacy single visits from oportunidades if not already in combinedOps
      if (opRes.data) {
        for (const o of opRes.data) {
          if (o.fecha_visita_terreno && !combinedOps.some((c) => c.id === o.id)) {
            combinedOps.push(o as OportunidadVenta);
          }
        }
      }

      setOportunidades(combinedOps);
      if (highlightedOpId) {
        const match = combinedOps.find((o) => o.id === highlightedOpId || o.cotizacion_actual_id === highlightedOpId);
        if (match) setSelectedVisitaOp(match);
      }
    } catch (err) {
      console.error('Error fetching field visits:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    fetchOportunidades();

    const channel1 = supabase
      .channel('realtime_visitas_table')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visitas_terreno' },
        () => {
          if (!ignore) fetchOportunidades();
        }
      )
      .subscribe();

    const channel2 = supabase
      .channel('realtime_visitas_ops')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'oportunidades' },
        () => {
          if (!ignore) fetchOportunidades();
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, []);

  // Update field visit in Supabase
  const updateVisitaField = async (opId: string, field: string, value: any) => {
    try {
      setOportunidades((prev) =>
        prev.map((o) => (o.id === opId ? { ...o, [field]: value } : o))
      );
      if (selectedVisitaOp && selectedVisitaOp.id === opId) {
        setSelectedVisitaOp((prev) => (prev ? { ...prev, [field]: value } : null));
      }
      await Promise.all([
        supabase.from('visitas_terreno').update({ [field]: value }).eq('id', opId),
        supabase.from('oportunidades').update({ [field]: value }).eq('id', opId),
      ]);
    } catch (err) {
      console.error(`Error updating ${field} for visita:`, err);
    }
  };

  // Calendar Helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  // Filter visits
  const filteredVisitas = oportunidades.filter((op) => {
    const matchesTecnico = selectedTecnico === 'todos' || op.tecnico_visita === selectedTecnico;
    const matchesEstado = selectedEstado === 'todos' || (op.estado_visita || 'programada') === selectedEstado;
    return matchesTecnico && matchesEstado;
  });

  const getTecnicoColor = (tec?: string) => {
    switch (tec) {
      case 'Felipe Valverde':
        return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' };
      case 'Marcos Catalán':
        return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' };
      case 'Edith Tapia':
        return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' };
      default:
        return { bg: 'bg-orange-50', text: 'text-[#F7931F]', border: 'border-orange-200', dot: 'bg-[#F7931F]' };
    }
  };

  const getEstadoBadge = (est?: string) => {
    switch (est) {
      case 'realizada':
        return { label: 'Realizada', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      case 'cancelada':
        return { label: 'Cancelada', bg: 'bg-red-100 text-red-800 border-red-300' };
      default:
        return { label: 'Programada', bg: 'bg-amber-100 text-amber-800 border-amber-300' };
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase text-[#F7931F] bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-200">
              Control de Terreno
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-[#363636] flex items-center gap-2.5">
            <CalendarIcon className="w-7 h-7 text-[#F7931F]" />
            <span>Calendario de Visitas a Terreno</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Programación y asignación técnica de inspecciones en terreno para <strong>Felipe Valverde</strong>, <strong>Marcos Catalán</strong> y <strong>Edith Tapia</strong>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={goToToday}
            className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-[#363636] font-bold text-xs rounded-xl transition"
          >
            Hoy
          </button>
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 border border-gray-200">
            <button
              onClick={prevMonth}
              className="p-1.5 hover:bg-white text-gray-700 rounded-lg transition"
              title="Mes Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-black text-[#363636] px-3 font-mono">
              {monthNames[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="p-1.5 hover:bg-white text-gray-700 rounded-lg transition"
              title="Mes Siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs de Filtro por Técnico y Estado */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        {/* Técnicos */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1">Técnico:</span>
          <button
            onClick={() => setSelectedTecnico('todos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              selectedTecnico === 'todos'
                ? 'bg-[#363636] text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todos ({oportunidades.length})
          </button>

          {TECNICOS.map((tec) => {
            const count = oportunidades.filter((o) => o.tecnico_visita === tec).length;
            const style = getTecnicoColor(tec);
            const isSelected = selectedTecnico === tec;

            return (
              <button
                key={tec}
                onClick={() => setSelectedTecnico(tec)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-2 ${
                  isSelected
                    ? `${style.bg} ${style.text} ${style.border} ring-2 ring-current`
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                <span>{tec}</span>
                <span className="text-[10px] bg-white/80 px-1.5 py-0.5 rounded-full font-mono font-extrabold border">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Estado */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Estado:</span>
          <select
            value={selectedEstado}
            onChange={(e) => setSelectedEstado(e.target.value)}
            className="text-xs font-bold px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-[#363636] focus:outline-none focus:border-[#F7931F]"
          >
            <option value="todos">Todos los Estados</option>
            <option value="programada">📅 Programadas</option>
            <option value="realizada">✅ Realizadas</option>
            <option value="cancelada">❌ Canceladas</option>
          </select>
        </div>
      </div>

      {/* Grid del Calendario */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Dias de la semana */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200 text-center text-xs font-extrabold text-gray-500 uppercase tracking-wider py-3">
          <div>Lun</div>
          <div>Mar</div>
          <div>Mié</div>
          <div>Jue</div>
          <div>Vie</div>
          <div className="text-orange-600">Sáb</div>
          <div className="text-orange-600">Dom</div>
        </div>

        {/* Celdas de Dias */}
        <div className="grid grid-cols-7 divide-x divide-y divide-gray-200/80 bg-gray-50/30">
          {/* Celdas vacías del mes anterior */}
          {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
            <div key={`empty-${idx}`} className="min-h-[130px] bg-gray-50/50 p-2 text-gray-300 text-xs font-mono select-none" />
          ))}

          {/* Días del mes actual */}
          {Array.from({ length: daysInMonth }).map((_, dayIdx) => {
            const dayNum = dayIdx + 1;
            const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

            const todayStr = new Date().toISOString().split('T')[0];
            const isToday = formattedDate === todayStr;

            // Visitas programadas para este día
            const dayVisitas = filteredVisitas.filter(
              (o) => o.fecha_visita_terreno === formattedDate
            );

            return (
              <div
                key={dayNum}
                className={`min-h-[130px] p-2 transition flex flex-col justify-start gap-1 bg-white hover:bg-orange-50/20 ${
                  isToday ? 'bg-orange-50/40 ring-1 ring-[#F7931F]/30 inset-0' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-mono font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                      isToday ? 'bg-[#F7931F] text-white font-extrabold shadow-2xs' : 'text-gray-700'
                    }`}
                  >
                    {dayNum}
                  </span>
                  {dayVisitas.length > 0 && (
                    <span className="text-[10px] font-extrabold text-[#F7931F] bg-orange-100 px-1.5 py-0.5 rounded-full">
                      {dayVisitas.length} {dayVisitas.length === 1 ? 'visita' : 'visitas'}
                    </span>
                  )}
                </div>

                {/* Tarjetas de visitas en el día */}
                <div className="space-y-1.5 overflow-y-auto max-h-[110px] pr-0.5">
                  {dayVisitas.map((op) => {
                    const color = getTecnicoColor(op.tecnico_visita);
                    const est = getEstadoBadge(op.estado_visita);

                    return (
                      <div
                        key={op.id}
                        onClick={() => setSelectedVisitaOp(op)}
                        className={`p-2 rounded-xl border text-[11px] cursor-pointer transition shadow-2xs hover:scale-[1.02] ${color.bg} ${color.border}`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className={`font-black uppercase tracking-wider text-[9px] px-1.5 py-0.5 rounded-md ${color.text} bg-white/80 border`}>
                            {op.tecnico_visita || 'Técnico'}
                          </span>
                          <span className="font-mono text-[9px] text-gray-500 font-bold flex items-center gap-0.5">
                            <Clock className="w-3 h-3 text-gray-400" />
                            {op.hora_visita_terreno || '09:00'}
                          </span>
                        </div>

                        <div className="font-bold text-[#363636] truncate leading-tight" title={op.titulo}>
                          {op.codigo} — {op.titulo}
                        </div>

                        <div className="text-[10px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                          <Building className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="truncate">{op.cliente?.nombre || 'Cliente'}</span>
                        </div>

                        <div className="mt-1 flex items-center justify-between">
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-md border ${est.bg}`}>
                            {est.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal de Detalle y Edición Directa de Visita */}
      {selectedVisitaOp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl text-[#363636]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-orange-50 rounded-xl border border-orange-200 text-[#F7931F]">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold text-gray-500 uppercase">{selectedVisitaOp.codigo}</span>
                  <h3 className="text-base font-extrabold text-[#363636] leading-tight">{selectedVisitaOp.titulo}</h3>
                </div>
              </div>
              <button
                onClick={() => setSelectedVisitaOp(null)}
                className="text-gray-400 hover:text-[#363636] text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Información del Cliente */}
            <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#F7931F] flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-[#F7931F]" />
                  <span>{selectedVisitaOp.cliente?.nombre || 'Cliente General'}</span>
                </span>
                <span className="font-mono text-gray-500 font-bold">{selectedVisitaOp.cliente?.rut}</span>
              </div>
              {(selectedVisitaOp.cliente?.direccion || selectedVisitaOp.cliente?.comuna) && (
                <div className="text-gray-600 text-[11px] flex items-center gap-1 pt-1">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span>{selectedVisitaOp.cliente?.direccion}, {selectedVisitaOp.cliente?.comuna}</span>
                </div>
              )}
            </div>

            {/* Formulario de Modificación de Visita */}
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Técnico Asignado</label>
                  <select
                    value={selectedVisitaOp.tecnico_visita || 'Felipe Valverde'}
                    onChange={(e) => updateVisitaField(selectedVisitaOp.id, 'tecnico_visita', e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-bold focus:outline-none focus:border-[#F7931F]"
                  >
                    <option value="Felipe Valverde">Felipe Valverde</option>
                    <option value="Marcos Catalán">Marcos Catalán</option>
                    <option value="Edith Tapia">Edith Tapia</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Estado de Visita</label>
                  <select
                    value={selectedVisitaOp.estado_visita || 'programada'}
                    onChange={(e) => updateVisitaField(selectedVisitaOp.id, 'estado_visita', e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-black uppercase focus:outline-none focus:border-[#F7931F]"
                  >
                    <option value="programada">📅 Programada</option>
                    <option value="realizada">✅ Realizada</option>
                    <option value="cancelada">❌ Canceladas</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Fecha de Visita</label>
                  <input
                    type="date"
                    value={selectedVisitaOp.fecha_visita_terreno || ''}
                    onChange={(e) => updateVisitaField(selectedVisitaOp.id, 'fecha_visita_terreno', e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-mono focus:outline-none focus:border-[#F7931F]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Hora de Visita</label>
                  <input
                    type="time"
                    value={selectedVisitaOp.hora_visita_terreno || '09:00'}
                    onChange={(e) => updateVisitaField(selectedVisitaOp.id, 'hora_visita_terreno', e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-mono focus:outline-none focus:border-[#F7931F]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Observaciones / Notas de Terreno</label>
                <textarea
                  rows={2}
                  placeholder="Instrucciones específicas para el técnico en terreno..."
                  value={selectedVisitaOp.observaciones_visita || ''}
                  onChange={(e) => updateVisitaField(selectedVisitaOp.id, 'observaciones_visita', e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F]"
                />
              </div>
            </div>

            <div className="pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <Link
                  href={`/ventas?oportunidad=${selectedVisitaOp.cotizacion_actual_id || selectedVisitaOp.id}`}
                  className="px-3.5 py-2 bg-orange-50 hover:bg-orange-100 text-[#F7931F] border border-orange-200 rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition"
                >
                  <span>Abrir en Pipeline</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>

                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedVisitaOp) return;
                    try {
                      const visId = selectedVisitaOp.id;
                      const parentOpId = selectedVisitaOp.cotizacion_actual_id || selectedVisitaOp.id;

                      if (isUUID(visId)) {
                        await supabase.from('visitas_terreno').delete().eq('id', visId);
                      }

                      if (isUUID(parentOpId)) {
                        await supabase.from('oportunidades').update({
                          fecha_visita_terreno: null,
                          hora_visita_terreno: null,
                          tecnico_visita: null,
                          estado_visita: null,
                          observaciones_visita: null,
                          requiere_visita_terreno: false,
                        }).eq('id', parentOpId);
                      }

                      setOportunidades((prev) => prev.filter((o) => o.id !== visId && o.id !== parentOpId));
                      setSelectedVisitaOp(null);
                    } catch (err) {
                      console.error('Error deleting visita from calendar:', err);
                    }
                  }}
                  className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition"
                  title="Eliminar esta visita a terreno del sistema"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar Visita</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedVisitaOp(null)}
                className="px-4 py-2 bg-[#363636] hover:bg-black text-white rounded-xl font-bold text-xs transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
