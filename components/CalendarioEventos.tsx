'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '../lib/supabase/client';
import {
  EventoProduccionLogistica,
  Usuario,
  TipoEventoProduccionLogistica,
  EstadoEventoProduccionLogistica,
  ContextoEventoProduccionLogistica,
  OportunidadVenta,
} from '../lib/types';
import { useAuth } from '../lib/context/AuthContext';
import { logSistema } from '../lib/logger';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  Building,
  HardHat,
  Factory,
  Truck,
  ShoppingCart,
  Trash2,
  Plus,
  Edit,
  Save,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  XCircle,
} from 'lucide-react';

export const ESTADOS_EVENTO_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; icon: React.ElementType }
> = {
  por_hacer: {
    label: 'Por hacer',
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-300',
    icon: Clock,
  },
  en_curso: {
    label: 'En curso',
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    border: 'border-amber-300',
    icon: RotateCcw,
  },
  reprogramado: {
    label: 'Reprogramado',
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    border: 'border-purple-300',
    icon: AlertTriangle,
  },
  completado: {
    label: 'Completado',
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    border: 'border-emerald-300',
    icon: CheckCircle2,
  },
  no_realizado: {
    label: 'No realizado',
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-300',
    icon: XCircle,
  },
};

export const TIPOS_EVENTO_CONFIG: Record<
  TipoEventoProduccionLogistica,
  { label: string; icon: React.ElementType; color: string }
> = {
  obra: { label: 'Obra / Instalación', icon: HardHat, color: 'text-amber-600' },
  produccion: { label: 'Fabricación Planta', icon: Factory, color: 'text-blue-600' },
  reventa: { label: 'Reventa / Coordinación', icon: ShoppingCart, color: 'text-purple-600' },
  logistica: { label: 'Despacho & Logística', icon: Truck, color: 'text-emerald-600' },
};

const CALENDARIOS_OPERACIONALES = [
  { id: 'visitas_terreno', label: 'Visitas a terreno' },
  { id: 'produccion_logistica', label: 'Producción y logística' },
  { id: 'reventa_logistica', label: 'Reventa y logística' },
];

interface CalendarioEventosProps {
  contexto: ContextoEventoProduccionLogistica;
  titulo: string;
  subtitulo?: string;
  tiposPermitidos: TipoEventoProduccionLogistica[];
  filtroPersonalField?: string;
  highlightedOpId?: string | null;
}

export function CalendarioEventos({
  contexto,
  titulo,
  subtitulo,
  tiposPermitidos,
  filtroPersonalField,
  highlightedOpId,
}: CalendarioEventosProps) {
  const { currentUser } = useAuth();
  const supabase = createClient();

  const [eventos, setEventos] = useState<EventoProduccionLogistica[]>([]);
  const [personalList, setPersonalList] = useState<Usuario[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters (Multi-selection for Responsables)
  const [selectedResponsables, setSelectedResponsables] = useState<string[]>([]);
  const [showResponsableMenu, setShowResponsableMenu] = useState(false);
  const [selectedEstado, setSelectedEstado] = useState<string>('todos');
  const [selectedTipo, setSelectedTipo] = useState<string>('todos');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modals & Selection
  const [selectedEvento, setSelectedEvento] = useState<EventoProduccionLogistica | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // New/Edit form state
  const [formOpId, setFormOpId] = useState<string>('');
  const [formTipo, setFormTipo] = useState<TipoEventoProduccionLogistica>(tiposPermitidos[0]);
  const [formTitulo, setFormTitulo] = useState<string>('');
  const [formFechaInicio, setFormFechaInicio] = useState<string>('');
  const [formFechaFin, setFormFechaFin] = useState<string>('');
  const [formResponsableId, setFormResponsableId] = useState<string>('');
  const [formEstado, setFormEstado] = useState<EstadoEventoProduccionLogistica>('por_hacer');
  const [formObservaciones, setFormObservaciones] = useState<string>('');
  const [savingLoading, setSavingLoading] = useState(false);

  const fetchEventos = async () => {
    try {
      setLoading(true);
      const [eventRes, userRes, opRes] = await Promise.all([
        supabase
          .from('eventos_produccion_logistica')
          .select('*, oportunidad:oportunidades(*, cliente:clientes(*)), responsable:usuarios!responsable_id(*)')
          .eq('contexto', contexto)
          .order('fecha_inicio', { ascending: true }),
        supabase
          .from('usuarios')
          .select('*')
          .eq('activo', true)
          .order('nombre', { ascending: true }),
        supabase
          .from('oportunidades')
          .select('id, codigo, titulo, cliente:clientes(nombre)')
          .order('created_at', { ascending: false }),
      ]);

      if (eventRes.data) {
        setEventos(eventRes.data as EventoProduccionLogistica[]);
      }

      if (userRes.data) {
        const users = userRes.data as Usuario[];
        const isReventa = contexto === 'reventa_logistica' || (filtroPersonalField && filtroPersonalField.includes('reventa'));
        const filteredUsers = isReventa
          ? users.filter((u) => u.calendario_reventa !== false)
          : users.filter((u) => u.calendario_produccion !== false);
        setPersonalList(filteredUsers.length > 0 ? filteredUsers : users);
      }

      if (opRes.data) {
        setOportunidades(opRes.data as OportunidadVenta[]);
      }
    } catch (err) {
      console.error('Error fetching calendar events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    const loadTimer = window.setTimeout(() => {
      if (!ignore) fetchEventos();
    }, 0);

    const channel = supabase
      .channel(`realtime_cal_${contexto}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'eventos_produccion_logistica' },
        () => {
          if (!ignore) fetchEventos();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'usuarios' },
        () => {
          if (!ignore) fetchEventos();
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      window.clearTimeout(loadTimer);
      supabase.removeChannel(channel);
    };
  }, [contexto]);

  const handleOpenNewModal = (dateStr?: string) => {
    const now = dateStr ? new Date(`${dateStr}T09:00:00`) : new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);

    const pad = (n: number) => String(n).padStart(2, '0');
    const toIsoLocal = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    setFormOpId(highlightedOpId || (oportunidades[0]?.id || ''));
    setFormTipo(tiposPermitidos[0]);
    setFormTitulo('');
    setFormFechaInicio(toIsoLocal(now));
    setFormFechaFin(toIsoLocal(end));
    setFormResponsableId('');
    setFormEstado('por_hacer');
    setFormObservaciones('');
    setIsNewModalOpen(true);
  };

  const handleOpenEditModal = (ev: EventoProduccionLogistica) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const toIsoLocal = (dateVal?: string) => {
      if (!dateVal) return '';
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setFormOpId(ev.oportunidad_id);
    setFormTipo(ev.tipo_evento);
    setFormTitulo(ev.titulo);
    setFormFechaInicio(toIsoLocal(ev.fecha_inicio) || toIsoLocal(ev.fecha_evento));
    setFormFechaFin(toIsoLocal(ev.fecha_fin) || toIsoLocal(ev.fecha_inicio));
    setFormResponsableId(ev.responsable_id || '');
    setFormEstado((ev.estado as EstadoEventoProduccionLogistica) || 'por_hacer');
    setFormObservaciones(ev.observaciones || '');
    setSelectedEvento(ev);
    setIsEditModalOpen(true);
  };

  const handleSaveNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formOpId || !formTitulo.trim() || !formFechaInicio) return;

    try {
      setSavingLoading(true);
      const startD = new Date(formFechaInicio);
      const endD = formFechaFin ? new Date(formFechaFin) : new Date(startD.getTime() + 3600000);

      const dateOnly = startD.toISOString().split('T')[0];
      const timeOnly = `${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('eventos_produccion_logistica')
        .insert([{
          contexto,
          oportunidad_id: formOpId,
          tipo_evento: formTipo,
          titulo: formTitulo.trim(),
          fecha_inicio: startD.toISOString(),
          fecha_fin: endD.toISOString(),
          fecha_evento: dateOnly,
          hora_evento: timeOnly,
          responsable_id: formResponsableId || null,
          estado: formEstado,
          observaciones: formObservaciones.trim() || null,
          registrado_por: currentUser?.id || null,
        }])
        .select()
        .single();

      if (error) throw error;

      await logSistema({
        tipo_accion: 'creacion',
        entidad: 'eventos_produccion_logistica',
        entidad_id: data.id,
        descripcion: `Evento de ${formTipo} "${formTitulo}" creado en ${contexto}`,
        usuario_id: currentUser?.id,
        datos_nuevos: data,
      });

      setIsNewModalOpen(false);
      fetchEventos();
    } catch (err: unknown) {
      console.error('Error creating calendar event:', err);
      alert(`Error al guardar evento: ${err instanceof Error ? err.message : 'Revisa los campos.'}`);
    } finally {
      setSavingLoading(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvento || !formTitulo.trim() || !formFechaInicio) return;

    try {
      setSavingLoading(true);
      const startD = new Date(formFechaInicio);
      const endD = formFechaFin ? new Date(formFechaFin) : new Date(startD.getTime() + 3600000);

      const dateOnly = startD.toISOString().split('T')[0];
      const timeOnly = `${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')}`;

      const { error } = await supabase
        .from('eventos_produccion_logistica')
        .update({
          tipo_evento: formTipo,
          titulo: formTitulo.trim(),
          fecha_inicio: startD.toISOString(),
          fecha_fin: endD.toISOString(),
          fecha_evento: dateOnly,
          hora_evento: timeOnly,
          responsable_id: formResponsableId || null,
          estado: formEstado,
          observaciones: formObservaciones.trim() || null,
        })
        .eq('id', selectedEvento.id);

      if (error) throw error;

      await logSistema({
        tipo_accion: 'actualizacion',
        entidad: 'eventos_produccion_logistica',
        entidad_id: selectedEvento.id,
        descripcion: `Evento "${formTitulo}" actualizado a estado "${formEstado}"`,
        usuario_id: currentUser?.id,
        datos_anteriores: selectedEvento,
        datos_nuevos: { titulo: formTitulo, estado: formEstado, fecha_inicio: startD },
      });

      setIsEditModalOpen(false);
      setSelectedEvento(null);
      fetchEventos();
    } catch (err: unknown) {
      console.error('Error updating calendar event:', err);
      alert(`Error al actualizar: ${err instanceof Error ? err.message : 'Revisa los campos.'}`);
    } finally {
      setSavingLoading(false);
    }
  };

  const handleDeleteEvento = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este evento del calendario?')) return;
    try {
      const { error } = await supabase.from('eventos_produccion_logistica').delete().eq('id', id);
      if (error) throw error;
      setIsEditModalOpen(false);
      setSelectedEvento(null);
      fetchEventos();
    } catch (err: unknown) {
      console.error('Error deleting event:', err);
      alert('No se pudo eliminar el evento.');
    }
  };

  // Month navigation helpers
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };
  const goToToday = () => setCurrentDate(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Filtered events
  const filteredEventos = eventos.filter((ev) => {
    if (selectedResponsables.length > 0 && (!ev.responsable_id || !selectedResponsables.includes(ev.responsable_id))) {
      return false;
    }
    if (selectedEstado !== 'todos' && ev.estado !== selectedEstado) return false;
    if (selectedTipo !== 'todos' && ev.tipo_evento !== selectedTipo) return false;
    return true;
  });

  return (
    <div className="space-y-5 text-[#363636]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#363636] flex items-center gap-2.5">
            <CalendarIcon className="w-6 h-6 text-[#F7931F]" />
            <span>{titulo}</span>
          </h1>
          {subtitulo && <p className="text-xs text-gray-500 mt-0.5">{subtitulo}</p>}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => handleOpenNewModal()}
            className="bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold text-xs px-4 py-2 rounded-xl transition flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Programar evento</span>
          </button>
        </div>
      </div>

      {/* Control Bar: Mes + Filtros */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-4 text-xs">
        {/* Navegación de Mes */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-xl p-1 border border-gray-200">
            <button
              onClick={prevMonth}
              className="p-1.5 hover:bg-white text-gray-700 rounded-lg transition"
              title="Mes anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-extrabold text-[#363636] px-3 font-mono text-sm">
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
            className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-[#F7931F] font-bold rounded-xl border border-orange-200 transition"
          >
            Hoy
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Tipo de evento */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-gray-500">Tipo:</span>
            <select
              value={selectedTipo}
              onChange={(e) => setSelectedTipo(e.target.value)}
              className="bg-gray-50 border border-gray-300 rounded-xl px-2.5 py-1.5 text-[#363636] font-bold focus:outline-none focus:border-[#F7931F]"
            >
              <option value="todos">Todos los tipos</option>
              {tiposPermitidos.map((t) => (
                <option key={t} value={t}>
                  {TIPOS_EVENTO_CONFIG[t]?.label || t}
                </option>
              ))}
            </select>
          </div>

          {/* Responsable (Multi-Selección Desplegable) */}
          <div className="relative">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-gray-500">Responsable:</span>
              <button
                type="button"
                onClick={() => setShowResponsableMenu(!showResponsableMenu)}
                className="bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-xl px-3 py-1.5 text-[#363636] font-bold text-xs flex items-center justify-between gap-2 min-w-[170px] cursor-pointer"
              >
                <span className="truncate">
                  {selectedResponsables.length === 0
                    ? 'Todos los responsables'
                    : selectedResponsables.length === 1
                    ? personalList.find((p) => p.id === selectedResponsables[0])?.nombre || '1 seleccionado'
                    : `${selectedResponsables.length} seleccionados`}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              </button>
            </div>

            {showResponsableMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-2xl shadow-xl p-3 z-30 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                  <span className="font-extrabold text-[#363636] text-[11px] uppercase tracking-wider">
                    Filtrar responsables
                  </span>
                  {selectedResponsables.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedResponsables([])}
                      className="text-[10px] text-[#F7931F] font-bold hover:underline"
                    >
                      Limpiar filtro
                    </button>
                  )}
                </div>

                <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                  <label className="flex items-center gap-2 p-1.5 hover:bg-orange-50 rounded-lg cursor-pointer font-bold text-[#363636]">
                    <input
                      type="checkbox"
                      checked={selectedResponsables.length === 0}
                      onChange={() => setSelectedResponsables([])}
                      className="rounded text-[#F7931F] focus:ring-[#F7931F]"
                    />
                    <span>Todos los responsables</span>
                  </label>

                  {personalList.map((p) => {
                    const isChecked = selectedResponsables.includes(p.id);
                    const count = eventos.filter((ev) => ev.responsable_id === p.id).length;
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
                                setSelectedResponsables(selectedResponsables.filter((id) => id !== p.id));
                              } else {
                                setSelectedResponsables([...selectedResponsables, p.id]);
                              }
                            }}
                            className="rounded text-[#F7931F] focus:ring-[#F7931F]"
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
              className="bg-gray-50 border border-gray-300 rounded-xl px-2.5 py-1.5 text-[#363636] font-bold focus:outline-none focus:border-[#F7931F]"
            >
              <option value="todos">Todos los estados</option>
              {Object.entries(ESTADOS_EVENTO_CONFIG).map(([key, conf]) => (
                <option key={key} value={key}>
                  {conf.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Calendario Grid Mensual */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Cabecera de días de la semana */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-xs font-bold text-gray-600">
          {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d) => (
            <div key={d} className="py-2.5 border-r last:border-r-0 border-gray-200">
              {d}
            </div>
          ))}
        </div>

        {/* Celdas de días */}
        <div className="grid grid-cols-7 auto-rows-fr min-h-[580px]">
          {/* Celdas vacías previas */}
          {Array.from({ length: firstDayIndex }).map((_, idx) => (
            <div
              key={`empty-${idx}`}
              className="bg-gray-50/50 border-r border-b border-gray-200 min-h-[110px]"
            />
          ))}

          {/* Días del mes actual */}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const dayNum = idx + 1;
            const currentDayDate = new Date(year, month, dayNum);
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const isToday =
              new Date().toISOString().split('T')[0] === currentDayDate.toISOString().split('T')[0];

            // Eventos que caen en este día
            const dayEvents = filteredEventos.filter((ev) => {
              const evDate = (ev.fecha_inicio || ev.fecha_evento || '').split('T')[0];
              return evDate === dateStr;
            });

            return (
              <div
                key={`day-${dayNum}`}
                className={`border-r border-b border-gray-200 p-2 min-h-[110px] flex flex-col justify-between group transition hover:bg-gray-50/70 relative ${
                  isToday ? 'bg-orange-50/30' : 'bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday ? 'bg-[#F7931F] text-white shadow-xs' : 'text-[#363636]'
                      }`}
                    >
                      {dayNum}
                    </span>

                    <button
                      onClick={() => handleOpenNewModal(dateStr)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-[#F7931F] transition rounded-md"
                      title="Agregar evento este día"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Listado de eventos en el día con diseño claro ganador de Visitas a Terreno */}
                  <div className="space-y-1.5">
                    {dayEvents.map((ev) => {
                      const tipoConf = TIPOS_EVENTO_CONFIG[ev.tipo_evento] || TIPOS_EVENTO_CONFIG.obra;
                      const TipoIcon = tipoConf.icon;
                      const estadoConf = ESTADOS_EVENTO_CONFIG[ev.estado] || ESTADOS_EVENTO_CONFIG.por_hacer;
                      const EstadoIcon = estadoConf.icon;

                      const startTime = ev.fecha_inicio
                        ? new Date(ev.fecha_inicio).toLocaleTimeString('es-CL', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ev.hora_evento || '09:00';

                      const isHighlighted = highlightedOpId && ev.oportunidad_id === highlightedOpId;

                      return (
                        <div
                          key={ev.id}
                          onClick={() => handleOpenEditModal(ev)}
                          className={`p-2 rounded-xl border text-[11px] leading-tight cursor-pointer transition shadow-2xs hover:scale-[1.01] space-y-1 bg-orange-50/70 border-orange-200 hover:bg-orange-100/60 ${
                            isHighlighted ? 'ring-2 ring-[#F7931F]' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-extrabold text-[9.5px] px-1.5 py-0.5 rounded-md text-[#F7931F] bg-white border border-orange-200 truncate max-w-[120px]">
                              {ev.responsable?.nombre || 'Sin responsable'}
                            </span>
                            <span className="font-mono text-[9.5px] text-gray-500 font-bold flex items-center gap-0.5 shrink-0">
                              <Clock className="w-3 h-3 text-gray-400" />
                              {startTime}
                            </span>
                          </div>

                          <div className="font-bold text-[#363636] truncate leading-tight flex items-center gap-1">
                            <TipoIcon className={`w-3.5 h-3.5 shrink-0 ${tipoConf.color}`} />
                            <span className="truncate">{ev.titulo}</span>
                          </div>

                          {ev.oportunidad && (
                            <div className="text-[10px] text-gray-500 truncate flex items-center gap-1">
                              <Building className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span className="truncate">
                                {ev.oportunidad.cliente?.nombre || ev.oportunidad.codigo}
                              </span>
                            </div>
                          )}

                          <div className="mt-1 flex items-center justify-between">
                            <span
                              className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-md border flex items-center gap-0.5 ${estadoConf.bg} ${estadoConf.text} ${estadoConf.border}`}
                            >
                              <EstadoIcon className="w-2.5 h-2.5" />
                              <span>{estadoConf.label}</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Nuevo Evento */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl text-[#363636] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-extrabold text-[#363636] flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-[#F7931F]" />
                <span>Programar Nuevo Evento ({titulo})</span>
              </h3>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="text-gray-400 hover:text-[#363636] text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNew} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Oportunidad de Venta *</label>
                <select
                  required
                  value={formOpId}
                  onChange={(e) => setFormOpId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-bold focus:outline-none focus:border-[#F7931F]"
                >
                  <option value="">-- Seleccionar Oportunidad --</option>
                  {oportunidades.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.codigo} — {op.titulo} ({op.cliente?.nombre || 'Cliente'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Calendario</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CALENDARIOS_OPERACIONALES.map((cal) => {
                    const isCurrent = cal.id === contexto;
                    return (
                      <div
                        key={cal.id}
                        className={`px-3 py-2 rounded-xl border font-extrabold text-xs text-center ${
                          isCurrent
                            ? 'bg-orange-50 text-[#F7931F] border-orange-300'
                            : 'bg-gray-50 text-gray-500 border-gray-200'
                        }`}
                      >
                        {cal.label}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Tipo de evento *</label>
                  <select
                    required
                    value={formTipo}
                    onChange={(e) => setFormTipo(e.target.value as TipoEventoProduccionLogistica)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-bold focus:outline-none focus:border-[#F7931F]"
                  >
                    {tiposPermitidos.map((t) => (
                      <option key={t} value={t}>
                        {TIPOS_EVENTO_CONFIG[t]?.label || t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Estado Inicial *</label>
                  <select
                    required
                    value={formEstado}
                    onChange={(e) => setFormEstado(e.target.value as EstadoEventoProduccionLogistica)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-bold focus:outline-none focus:border-[#F7931F]"
                  >
                    {Object.entries(ESTADOS_EVENTO_CONFIG).map(([key, conf]) => (
                      <option key={key} value={key}>
                        {conf.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Título del Evento *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Montaje e Instalación Cierros"
                  value={formTitulo}
                  onChange={(e) => setFormTitulo(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Fecha y Hora Inicio *</label>
                  <input
                    type="datetime-local"
                    required
                    value={formFechaInicio}
                    onChange={(e) => setFormFechaInicio(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Fecha y Hora Término *</label>
                  <input
                    type="datetime-local"
                    required
                    value={formFechaFin}
                    onChange={(e) => setFormFechaFin(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Responsable Asignado</label>
                <select
                  value={formResponsableId}
                  onChange={(e) => setFormResponsableId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                >
                  <option value="">-- Sin Asignar --</option>
                  {personalList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.rol === 'mano_obra' ? 'Mano de Obra' : p.rol === 'admin' ? 'Admin' : 'Ejecutivo'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Notas e Instrucciones</label>
                <textarea
                  rows={2}
                  placeholder="Detalles operacionales, contacto en terreno o materiales..."
                  value={formObservaciones}
                  onChange={(e) => setFormObservaciones(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl p-2.5 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingLoading}
                  className="bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold px-5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingLoading ? 'Guardando...' : 'Crear Evento'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar / Eliminar Evento */}
      {isEditModalOpen && selectedEvento && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl text-[#363636] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-extrabold text-[#363636] flex items-center gap-2">
                <Edit className="w-5 h-5 text-[#F7931F]" />
                <span>Editar Evento</span>
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-gray-400 hover:text-[#363636] text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Tipo de Evento</label>
                  <select
                    value={formTipo}
                    onChange={(e) => setFormTipo(e.target.value as TipoEventoProduccionLogistica)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-bold focus:outline-none focus:border-[#F7931F]"
                  >
                    {tiposPermitidos.map((t) => (
                      <option key={t} value={t}>
                        {TIPOS_EVENTO_CONFIG[t]?.label || t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Estado del Evento</label>
                  <select
                    value={formEstado}
                    onChange={(e) => setFormEstado(e.target.value as EstadoEventoProduccionLogistica)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-bold focus:outline-none focus:border-[#F7931F]"
                  >
                    {Object.entries(ESTADOS_EVENTO_CONFIG).map(([key, conf]) => (
                      <option key={key} value={key}>
                        {conf.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Título del Evento *</label>
                <input
                  type="text"
                  required
                  value={formTitulo}
                  onChange={(e) => setFormTitulo(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Fecha y Hora Inicio *</label>
                  <input
                    type="datetime-local"
                    required
                    value={formFechaInicio}
                    onChange={(e) => setFormFechaInicio(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Fecha y Hora Término *</label>
                  <input
                    type="datetime-local"
                    required
                    value={formFechaFin}
                    onChange={(e) => setFormFechaFin(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Responsable Asignado</label>
                <select
                  value={formResponsableId}
                  onChange={(e) => setFormResponsableId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                >
                  <option value="">-- Sin Asignar --</option>
                  {personalList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.rol === 'mano_obra' ? 'Mano de Obra' : p.rol === 'admin' ? 'Admin' : 'Ejecutivo'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Notas e Instrucciones</label>
                <textarea
                  rows={2}
                  value={formObservaciones}
                  onChange={(e) => setFormObservaciones(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl p-2.5 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => handleDeleteEvento(selectedEvento.id)}
                  className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Eliminar Evento</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingLoading}
                    className="bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold px-5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingLoading ? 'Guardando...' : 'Guardar Cambios'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
