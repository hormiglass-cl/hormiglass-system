'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { ProyectoPlanificacion } from '../../../lib/types';
import { useAuth } from '../../../lib/context/AuthContext';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Building,
  MapPin,
  ExternalLink,
  Filter,
} from 'lucide-react';

const TECNICOS = ['Felipe Valverde', 'Marcos Catalán', 'Edith Tapia'] as const;

export default function CalendarioPlanificacionPage() {
  const { currentUser } = useAuth();
  const searchParams = useSearchParams();
  const highlightedOpId = searchParams.get('opId');

  const [proyectos, setProyectos] = useState<ProyectoPlanificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTecnico, setSelectedTecnico] = useState<string>('todos');
  const [selectedEstado, setSelectedEstado] = useState<string>('todos');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modal para ver/editar hito de planificación seleccionado
  const [selectedProy, setSelectedProy] = useState<ProyectoPlanificacion | null>(null);

  const supabase = createClient();

  const fetchPlanificacion = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('proyectos_planificacion')
        .select('*, cliente:clientes(*)');

      if (!error && data) {
        setProyectos(data as ProyectoPlanificacion[]);
      } else {
        setProyectos([]);
      }
    } catch (err) {
      console.error('Error fetching planificacion calendar:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    fetchPlanificacion();

    const channel = supabase
      .channel('realtime_cal_planificacion')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proyectos_planificacion' },
        () => {
          if (!ignore) fetchPlanificacion();
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const updateProyectoField = async (id: string, field: string, value: any) => {
    try {
      setProyectos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
      );
      if (selectedProy && selectedProy.id === id) {
        setSelectedProy((prev) => (prev ? { ...prev, [field]: value } : null));
      }
      await supabase.from('proyectos_planificacion').update({ [field]: value }).eq('id', id);
    } catch (err) {
      console.error(`Error updating ${field} for proyecto:`, err);
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

  const filteredProyectos = proyectos.filter((p) => {
    const matchesEstado = selectedEstado === 'todos' || p.estado === selectedEstado;
    return matchesEstado;
  });

  const getEstadoBadge = (est?: string) => {
    switch (est) {
      case 'finalizado':
        return { label: 'Finalizado', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      case 'instalacion':
        return { label: 'En Instalación', bg: 'bg-orange-100 text-orange-800 border-orange-300' };
      case 'fabricacion':
        return { label: 'En Fabricación', bg: 'bg-purple-100 text-purple-800 border-purple-300' };
      default:
        return { label: 'En Cola', bg: 'bg-amber-100 text-amber-800 border-amber-300' };
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Header Estilo Visitas a Terreno 100% Idéntico */}
      <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase text-[#F7931F] bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-200">
              Control de Producción & Instalaciones
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-[#363636] flex items-center gap-2.5">
            <CalendarIcon className="w-7 h-7 text-[#F7931F]" />
            <span>Calendario de Planificación & Entregas</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Programación mensual de fabricación en planta e hitos de instalación en terreno.
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

          <Link
            href="/planificacion"
            className="px-4 py-2 bg-[#363636] hover:bg-black text-white font-bold text-xs rounded-xl transition"
          >
            ← Volver al Pipeline
          </Link>
        </div>
      </div>

      {/* Tabs de Filtro Estilo Visitas 100% Idéntico */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1">Filtro Estado:</span>
          <button
            onClick={() => setSelectedEstado('todos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              selectedEstado === 'todos'
                ? 'bg-[#363636] text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todos ({proyectos.length})
          </button>
          <button
            onClick={() => setSelectedEstado('cola_produccion')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              selectedEstado === 'cola_produccion'
                ? 'bg-[#363636] text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Cola Fabricación
          </button>
          <button
            onClick={() => setSelectedEstado('fabricacion')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              selectedEstado === 'fabricacion'
                ? 'bg-[#363636] text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            En Fabricación
          </button>
          <button
            onClick={() => setSelectedEstado('instalacion')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              selectedEstado === 'instalacion'
                ? 'bg-[#363636] text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            En Instalación
          </button>
        </div>
      </div>

      {/* Grid del Calendario Estilo Visitas 100% Idéntico */}
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

            const dayProysFab = filteredProyectos.filter(
              (p) => p.fecha_estimada_produccion === formattedDate
            );
            const dayProysInst = filteredProyectos.filter(
              (p) => p.fecha_estimada_instalacion === formattedDate
            );

            const totalCount = dayProysFab.length + dayProysInst.length;

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
                  {totalCount > 0 && (
                    <span className="text-[10px] font-extrabold text-[#F7931F] bg-orange-100 px-1.5 py-0.5 rounded-full">
                      {totalCount} {totalCount === 1 ? 'hito' : 'hitos'}
                    </span>
                  )}
                </div>

                {/* Tarjetas de hitos en el día */}
                <div className="space-y-1.5 overflow-y-auto max-h-[110px] pr-0.5">
                  {dayProysFab.map((p) => (
                    <div
                      key={`fab-${p.id}`}
                      onClick={() => setSelectedProy(p)}
                      className="p-2 rounded-xl border text-[11px] cursor-pointer transition shadow-2xs hover:scale-[1.02] bg-amber-50 border-amber-200 text-amber-900"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-black uppercase tracking-wider text-[9px] px-1.5 py-0.5 rounded-md text-amber-800 bg-white/80 border">
                          Fabricación
                        </span>
                      </div>
                      <div className="font-bold text-[#363636] truncate leading-tight" title={p.titulo}>
                        {p.codigo} — {p.titulo}
                      </div>
                      <div className="text-[10px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                        <Building className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="truncate">{p.cliente?.nombre || 'Cliente'}</span>
                      </div>
                    </div>
                  ))}

                  {dayProysInst.map((p) => (
                    <div
                      key={`inst-${p.id}`}
                      onClick={() => setSelectedProy(p)}
                      className="p-2 rounded-xl border text-[11px] cursor-pointer transition shadow-2xs hover:scale-[1.02] bg-orange-50 border-orange-200 text-orange-900"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-black uppercase tracking-wider text-[9px] px-1.5 py-0.5 rounded-md text-[#F7931F] bg-white/80 border">
                          Instalación
                        </span>
                      </div>
                      <div className="font-bold text-[#363636] truncate leading-tight" title={p.titulo}>
                        {p.codigo} — {p.titulo}
                      </div>
                      <div className="text-[10px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                        <Building className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="truncate">{p.cliente?.nombre || 'Cliente'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal de Detalle Estilo Visitas 100% Idéntico */}
      {selectedProy && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl text-[#363636]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-orange-50 rounded-xl border border-orange-200 text-[#F7931F]">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold text-gray-500 uppercase">{selectedProy.codigo}</span>
                  <h3 className="text-base font-extrabold text-[#363636] leading-tight">{selectedProy.titulo}</h3>
                </div>
              </div>
              <button
                onClick={() => setSelectedProy(null)}
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
                  <span>{selectedProy.cliente?.nombre || 'Cliente General'}</span>
                </span>
                <span className="font-mono text-gray-500 font-bold">{selectedProy.cliente?.rut}</span>
              </div>
            </div>

            {/* Formulario de Modificación de Hitos */}
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Fecha Fabricación</label>
                  <input
                    type="date"
                    value={selectedProy.fecha_estimada_produccion || ''}
                    onChange={(e) => updateProyectoField(selectedProy.id, 'fecha_estimada_produccion', e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-mono focus:outline-none focus:border-[#F7931F]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Fecha Instalación</label>
                  <input
                    type="date"
                    value={selectedProy.fecha_estimada_instalacion || ''}
                    onChange={(e) => updateProyectoField(selectedProy.id, 'fecha_estimada_instalacion', e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-mono focus:outline-none focus:border-[#F7931F]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Observaciones de Planta / Terreno</label>
                <textarea
                  rows={2}
                  placeholder="Instrucciones de fabricación o requerimientos de entrega..."
                  value={selectedProy.observaciones || ''}
                  onChange={(e) => updateProyectoField(selectedProy.id, 'observaciones', e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F]"
                />
              </div>
            </div>

            <div className="pt-3 flex items-center justify-between border-t border-gray-200">
              <Link
                href={`/ventas?oportunidad=${selectedProy.oportunidad_id}`}
                className="px-4 py-2 bg-orange-50 hover:bg-orange-100 text-[#F7931F] border border-orange-200 rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition"
              >
                <span>Abrir Oportunidad en Pipeline</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>

              <button
                type="button"
                onClick={() => setSelectedProy(null)}
                className="px-5 py-2 bg-[#363636] hover:bg-black text-white rounded-xl font-bold text-xs transition"
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
