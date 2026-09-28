'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { OportunidadVenta, Cliente, Usuario } from '../../lib/types';
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

type VisitaTerrenoRow = {
  id: string;
  oportunidad?: OportunidadVenta | null;
  tecnico_visita?: string;
  tecnico_id?: string | null;
  tecnico?: Usuario;
  fecha_visita_terreno?: string;
  hora_visita_terreno?: string;
  estado_visita?: string;
  observaciones_visita?: string;
};

export default function VisitasTerrenoPage() {
  const { currentUser } = useAuth();
  const searchParams = useSearchParams();
  const highlightedOpId = searchParams.get('opId');

  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [personalVisitas, setPersonalVisitas] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTecnico, setSelectedTecnico] = useState<string>('todos');
  const [selectedEstado, setSelectedEstado] = useState<string>('todos');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modal para ver/editar visita seleccionada
  const [selectedVisitaOp, setSelectedVisitaOp] = useState<OportunidadVenta | null>(null);

  const supabase = createClient();

  const fetchOportunidades = async () => {
    try {
      const [opRes, visRes, respRes] = await Promise.all([
        supabase
          .from('oportunidades')
          .select('*, cliente:clientes(*)')
          .eq('requiere_visita_terreno', true),
        supabase
          .from('visitas_terreno')
          .select('*, oportunidad:oportunidades(*, cliente:clientes(*)), tecnico:usuarios!tecnico_id(*)')
          .order('fecha_visita_terreno', { ascending: true }),
        supabase
          .from('usuarios')
          .select('*')
          .eq('activo', true)
          .order('nombre', { ascending: true }),
      ]);

      if (respRes.data) {
        const users = respRes.data as Usuario[];
        const filteredUsers = users.filter((u) => u.calendario_visitas !== false);
        setPersonalVisitas(filteredUsers.length > 0 ? filteredUsers : users);
      }

      const combinedOps: OportunidadVenta[] = [];

      // Add visits from visitas_terreno table (only for active opportunities where requiere_visita_terreno !== false)
      if (visRes.data) {
        for (const v of visRes.data as VisitaTerrenoRow[]) {
          const parentOp = v.oportunidad;

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
            tecnico_id: v.tecnico_id,
            tecnico: v.tecnico,
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
    const loadTimer = window.setTimeout(() => {
      if (!ignore) fetchOportunidades();
    }, 0);

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

    const channel3 = supabase
      .channel('realtime_visitas_responsables')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'usuarios' },
        () => {
          if (!ignore) fetchOportunidades();
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      window.clearTimeout(loadTimer);
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
      supabase.removeChannel(channel3);
    };
  }, []);

  // Update field visit in Supabase
  const updateVisitaField = async (opId: string, field: keyof OportunidadVenta, value: string | null) => {
    try {
      const parentOpId = selectedVisitaOp?.id === opId
        ? selectedVisitaOp.cotizacion_actual_id || opId
        : opId;
      setOportunidades((prev) =>
        prev.map((o) => (o.id === opId ? { ...o, [field]: value } : o))
      );
      if (selectedVisitaOp && selectedVisitaOp.id === opId) {
        setSelectedVisitaOp((prev) => (prev ? { ...prev, [field]: value } : null));
      }
      await Promise.all([
        supabase.from('visitas_terreno').update({ [field]: value }).eq('id', opId),
        supabase.from('oportunidades').update({ [field]: value }).eq('id', parentOpId),
      ]);
    } catch (err) {
      console.error(`Error updating ${field} for visita:`, err);
    }
  };

  const updateVisitaResponsable = async (opId: string, personalId: string) => {
    const responsable = personalVisitas.find((p) => p.id === personalId);
    const nombre = responsable?.nombre || '';
    const parentOpId = selectedVisitaOp?.id === opId
      ? selectedVisitaOp.cotizacion_actual_id || opId
      : opId;

    setOportunidades((prev) =>
      prev.map((o) =>
        o.id === opId
          ? { ...o, tecnico_id: personalId, tecnico: responsable, tecnico_visita: nombre }
          : o
      )
    );
    setSelectedVisitaOp((prev) =>
      prev && prev.id === opId
        ? { ...prev, tecnico_id: personalId, tecnico: responsable, tecnico_visita: nombre }
        : prev
    );

    await Promise.all([
      supabase
        .from('visitas_terreno')
        .update({ tecnico_id: personalId, tecnico_visita: nombre })
        .eq('id', opId),
      supabase
        .from('oportunidades')
        .update({ tecnico_id: personalId, tecnico_visita: nombre })
        .eq('id', parentOpId),
    ]);
  };

  const deleteVisita = async (visita: OportunidadVenta) => {
    try {
      const visId = visita.id;
      const parentOpId = visita.cotizacion_actual_id || visita.id;

      if (isUUID(visId)) {
        await supabase.from('visitas_terreno').delete().eq('id', visId);
      }

      if (isUUID(parentOpId)) {
        await supabase.from('oportunidades').update({
          fecha_visita_terreno: null,
          hora_visita_terreno: null,
          tecnico_visita: null,
          tecnico_id: null,
          estado_visita: null,
          observaciones_visita: null,
          requiere_visita_terreno: false,
        }).eq('id', parentOpId);
      }

      setOportunidades((prev) => prev.filter((o) => o.id !== visId && o.id !== parentOpId));
      setSelectedVisitaOp((prev) => (prev?.id === visId ? null : prev));
    } catch (err) {
      console.error('Error deleting visita from calendar:', err);
      fetchOportunidades();
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
  const [selectedTecnicos, setSelectedTecnicos] = useState<string[]>([]);
  const [showTecnicoMenu, setShowTecnicoMenu] = useState(false);

  const filteredVisitas = oportunidades.filter((op) => {
    const matchesTecnico =
      selectedTecnicos.length === 0 ||
      (op.tecnico_id && selectedTecnicos.includes(op.tecnico_id));
    const matchesEstado = selectedEstado === 'todos' || (op.estado_visita || 'programada') === selectedEstado;
    return matchesTecnico && matchesEstado;
  });
  const todayLocal = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const upcomingVisitas = filteredVisitas
    .filter((op) => !!op.fecha_visita_terreno && op.fecha_visita_terreno >= todayLocal && op.estado_visita !== 'cancelada')
    .sort((a, b) => (a.fecha_visita_terreno || '').localeCompare(b.fecha_visita_terreno || ''))
    .slice(0, 6);

  const getTecnicoColor = () => ({
    bg: 'bg-orange-50',
    text: 'text-[#f97316]',
    border: 'border-orange-200',
    dot: 'bg-[#f97316]',
  });

  const getResponsableNombre = (op: OportunidadVenta) =>
    op.tecnico?.nombre || op.tecnico_visita || 'Responsable';

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
    <div className="space-y-5 text-[#213343] ">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#213343] flex items-center gap-2.5">
            <CalendarIcon className="w-6 h-6 text-[#f97316]" />
            <span>Calendario de visitas a terreno</span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Planificación y asignación de inspecciones en terreno asociadas a oportunidades.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/ventas"
            className="bg-[#f97316] hover:bg-[#ea580c] text-white font-extrabold text-xs px-4 py-2 rounded-md transition flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Programar visita desde pipeline</span>
          </Link>
        </div>
      </div>

      {/* Control Bar: Mes + Filtros */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-4 text-xs">
        {/* Navegación de Mes */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-md p-1 border border-gray-200">
            <button
              onClick={prevMonth}
              className="p-1.5 hover:bg-white text-gray-700 rounded-lg transition"
              title="Mes anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-extrabold text-[#213343] px-3 font-mono text-sm">
              {monthNames[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="p-1.5 hover:bg-white text-gray-700 rounded-lg transition"
              title="Mes siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={goToToday}
            className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-[#f97316] font-bold rounded-md border border-orange-200 transition"
          >
            Hoy
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Técnico (Multi-Selección Desplegable) */}
          <div className="relative">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-gray-500">Técnico:</span>
              <button
                type="button"
                onClick={() => setShowTecnicoMenu(!showTecnicoMenu)}
                className="bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-md px-3 py-1.5 text-[#213343] font-bold text-xs flex items-center justify-between gap-2 min-w-[170px] cursor-pointer"
              >
                <span className="truncate">
                  {selectedTecnicos.length === 0
                    ? 'Todos los técnicos'
                    : selectedTecnicos.length === 1
                    ? personalVisitas.find((p) => p.id === selectedTecnicos[0])?.nombre || '1 seleccionado'
                    : `${selectedTecnicos.length} seleccionados`}
                </span>
                <ChevronRight className={`w-3.5 h-3.5 text-gray-500 transition-transform ${showTecnicoMenu ? 'rotate-90' : ''}`} />
              </button>
            </div>

            {showTecnicoMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-sm p-3 z-30 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                  <span className="font-extrabold text-[#213343] text-[11px] uppercase tracking-normal">
                    Filtrar técnicos
                  </span>
                  {selectedTecnicos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedTecnicos([])}
                      className="text-[10px] text-[#f97316] font-bold hover:underline"
                    >
                      Limpiar filtro
                    </button>
                  )}
                </div>

                <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                  <label className="flex items-center gap-2 p-1.5 hover:bg-orange-50 rounded-lg cursor-pointer font-bold text-[#213343]">
                    <input
                      type="checkbox"
                      checked={selectedTecnicos.length === 0}
                      onChange={() => setSelectedTecnicos([])}
                      className="rounded text-[#f97316] focus:ring-[#F7931F]"
                    />
                    <span>Todos los técnicos</span>
                  </label>

                  {personalVisitas.map((p) => {
                    const isChecked = selectedTecnicos.includes(p.id);
                    const count = oportunidades.filter((o) => o.tecnico_id === p.id).length;
                    return (
                      <label
                        key={p.id}
                        className="flex items-center justify-between p-1.5 hover:bg-orange-50 rounded-lg cursor-pointer font-medium text-gray-700"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedTecnicos(selectedTecnicos.filter((id) => id !== p.id));
                              } else {
                                setSelectedTecnicos([...selectedTecnicos, p.id]);
                              }
                            }}
                            className="rounded text-[#f97316] focus:ring-[#F7931F]"
                          />
                          <span className="truncate">{p.nombre}</span>
                        </div>
                        <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded-full font-mono text-gray-600 font-bold shrink-0">
                          {count}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Estado */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-gray-500">Estado:</span>
            <select
              value={selectedEstado}
              onChange={(e) => setSelectedEstado(e.target.value)}
              className="bg-gray-50 border border-gray-300 rounded-md px-2.5 py-1.5 text-[#213343] font-bold focus:outline-none focus:border-[#f97316]"
            >
              <option value="todos">Todos los estados</option>
              <option value="programada">Programadas</option>
              <option value="realizada">Realizadas</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid del Calendario Mensual y agenda */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="hg-panel overflow-x-auto">
      <div className="min-w-[720px]">
        {/* Días de la semana */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-xs font-bold text-gray-600">
          {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d) => (
            <div key={d} className="py-2.5 border-r last:border-r-0 border-gray-200">
              {d}
            </div>
          ))}
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

            const isToday = formattedDate === todayLocal;

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
                      isToday ? 'bg-[#f97316] text-white font-extrabold shadow-2xs' : 'text-gray-700'
                    }`}
                  >
                    {dayNum}
                  </span>
                  {dayVisitas.length > 0 && (
                    <span className="text-[10px] font-extrabold text-[#f97316] bg-orange-100 px-1.5 py-0.5 rounded-full">
                      {dayVisitas.length} {dayVisitas.length === 1 ? 'visita' : 'visitas'}
                    </span>
                  )}
                </div>

                {/* Tarjetas de visitas en el día */}
                <div className="space-y-1.5 overflow-y-auto max-h-[110px] pr-0.5">
                  {dayVisitas.map((op) => {
                    const color = getTecnicoColor();
                    const est = getEstadoBadge(op.estado_visita);
                    const responsableNombre = getResponsableNombre(op);

                    return (
                      <div
                        key={op.id}
                        onClick={() => setSelectedVisitaOp(op)}
                        className={`p-2 rounded-md border text-[11px] cursor-pointer transition shadow-2xs hover:scale-[1.02] ${color.bg} ${color.border}`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className={`font-black uppercase tracking-normal text-[9px] px-1.5 py-0.5 rounded-md ${color.text} bg-white/80 border`}>
                            {responsableNombre}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[9px] text-gray-500 font-bold flex items-center gap-0.5">
                              <Clock className="w-3 h-3 text-gray-400" />
                              {op.hora_visita_terreno || '09:00'}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteVisita(op);
                              }}
                              className="p-1 bg-white/80 hover:bg-red-50 text-red-600 border border-red-100 rounded-md shrink-0"
                              title="Eliminar visita"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div className="font-bold text-[#213343] truncate leading-tight" title={op.titulo}>
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
      </div>
      <aside className="hg-panel p-4">
        <h2 className="text-sm font-bold">Próximas visitas</h2>
        <p className="mt-1 text-xs text-gray-500">Inspecciones programadas según los filtros activos.</p>
        {upcomingVisitas.length ? <div className="mt-3 space-y-1">
          {upcomingVisitas.map((op) => <button key={op.id} type="button" onClick={() => setSelectedVisitaOp(op)} className="block w-full rounded-lg p-2 text-left hover:bg-gray-50">
            <span className="block truncate text-xs font-bold">{op.codigo} · {op.titulo}</span>
            <span className="text-[11px] text-gray-500">{op.fecha_visita_terreno} · {getResponsableNombre(op)}</span>
          </button>)}
        </div> : <p className="mt-4 text-xs text-gray-500">Sin visitas próximas.</p>}
      </aside>
      </div>

      {/* Modal de Detalle y Edición Directa de Visita */}
      {selectedVisitaOp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 ">
          <div className="bg-white border border-gray-200 rounded-lg max-w-lg w-full p-6 space-y-5 shadow-sm text-[#213343]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-orange-50 rounded-md border border-orange-200 text-[#f97316]">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold text-gray-500 uppercase">{selectedVisitaOp.codigo}</span>
                  <h3 className="text-base font-extrabold text-[#213343] leading-tight">{selectedVisitaOp.titulo}</h3>
                </div>
              </div>
              <button
                onClick={() => setSelectedVisitaOp(null)}
                className="text-gray-400 hover:text-[#213343] text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Información del Cliente */}
            <div className="bg-gray-50 p-3.5 rounded-lg border border-gray-200 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#f97316] flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-[#f97316]" />
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
                    value={
                      selectedVisitaOp.tecnico_id ||
                      personalVisitas.find((p) => p.nombre === selectedVisitaOp.tecnico_visita)?.id ||
                      ''
                    }
                    onChange={(e) => {
                      updateVisitaResponsable(selectedVisitaOp.id, e.target.value);
                    }}
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-bold focus:outline-none focus:border-[#f97316] cursor-pointer"
                  >
                    <option value="">Selecciona responsable</option>
                    {personalVisitas.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}{t.rut ? ` - ${t.rut}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Estado de Visita</label>
                  <select
                    value={selectedVisitaOp.estado_visita || 'programada'}
                    onChange={(e) => updateVisitaField(selectedVisitaOp.id, 'estado_visita', e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-black uppercase focus:outline-none focus:border-[#f97316]"
                  >
                    <option value="programada">Programada</option>
                    <option value="realizada">Realizada</option>
                    <option value="cancelada">Cancelada</option>
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
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-mono focus:outline-none focus:border-[#f97316]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Hora de Visita</label>
                  <input
                    type="time"
                    value={selectedVisitaOp.hora_visita_terreno || '09:00'}
                    onChange={(e) => updateVisitaField(selectedVisitaOp.id, 'hora_visita_terreno', e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-mono focus:outline-none focus:border-[#f97316]"
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
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] focus:outline-none focus:border-[#f97316]"
                />
              </div>
            </div>

            <div className="pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <Link
                  href={`/ventas?oportunidad=${selectedVisitaOp.cotizacion_actual_id || selectedVisitaOp.id}`}
                  className="px-3.5 py-2 bg-orange-50 hover:bg-orange-100 text-[#f97316] border border-orange-200 rounded-md font-extrabold text-xs flex items-center gap-1.5 transition"
                >
                  <span>Abrir en Pipeline</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>

                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedVisitaOp) return;
                    try {
                      await deleteVisita(selectedVisitaOp);
                    } catch (err) {
                      console.error('Error deleting visita from calendar:', err);
                    }
                  }}
                  className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-md font-extrabold text-xs flex items-center gap-1.5 transition"
                  title="Eliminar esta visita a terreno del sistema"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar Visita</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedVisitaOp(null)}
                className="px-4 py-2 bg-[#213343] hover:bg-black text-white rounded-md font-bold text-xs transition"
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
