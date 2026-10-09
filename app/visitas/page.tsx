'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { OportunidadVenta, Usuario } from '../../lib/types';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Building,
  MapPin,
  Plus,
  ExternalLink,
  Trash2,
  Calendar as CalendarIcon,
} from 'lucide-react';
import {
  PageHeader,
  Panel,
  Button,
  IconButton,
  CodeStamp,
  StatusBadge,
  Dialog,
} from '../../components/ui/crm';
import { useConfirm, useToast } from '../../components/ui/feedback';

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
  const searchParams = useSearchParams();
  const highlightedOpId = searchParams.get('opId');
  const confirm = useConfirm();
  const toast = useToast();

  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [personalVisitas, setPersonalVisitas] = useState<Usuario[]>([]);
  const [, setLoading] = useState(true);
  const [selectedEstado, setSelectedEstado] = useState<string>('todos');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modal para ver/editar visita seleccionada
  const [selectedVisitaOp, setSelectedVisitaOp] = useState<OportunidadVenta | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchOportunidades = React.useCallback(async () => {
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

      if (visRes.data) {
        for (const v of visRes.data as VisitaTerrenoRow[]) {
          const parentOp = v.oportunidad;
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
      toast({ message: 'No se pudieron cargar las visitas a terreno', tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [supabase, highlightedOpId, toast]);

  useEffect(() => {
    let ignore = false;
    const loadTimer = window.setTimeout(() => {
      if (!ignore) void fetchOportunidades();
    }, 0);

    const channel1 = supabase
      .channel('realtime_visitas_table')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visitas_terreno' },
        () => {
          if (!ignore) void fetchOportunidades();
        }
      )
      .subscribe();

    const channel2 = supabase
      .channel('realtime_visitas_ops')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'oportunidades' },
        () => {
          if (!ignore) void fetchOportunidades();
        }
      )
      .subscribe();

    const channel3 = supabase
      .channel('realtime_visitas_responsables')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'usuarios' },
        () => {
          if (!ignore) void fetchOportunidades();
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      window.clearTimeout(loadTimer);
      void supabase.removeChannel(channel1);
      void supabase.removeChannel(channel2);
      void supabase.removeChannel(channel3);
    };
  }, [supabase, fetchOportunidades]);

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
      toast({ message: 'Visita actualizada', tone: 'success' });
    } catch (err) {
      console.error(`Error updating ${field} for visita:`, err);
      toast({ message: 'Error al actualizar la visita', tone: 'danger' });
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

    try {
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
      toast({ message: 'Técnico asignado', tone: 'success' });
    } catch (err) {
      console.error('Error updating tecnico:', err);
      toast({ message: 'Error al asignar técnico', tone: 'danger' });
    }
  };

  const deleteVisita = async (visita: OportunidadVenta) => {
    const ok = await confirm({
      title: 'Eliminar visita a terreno',
      message: `¿Estás seguro de eliminar la visita para ${visita.codigo}? Esta acción desvinculará la programación.`,
      confirmLabel: 'Eliminar visita',
      destructive: true,
    });
    if (!ok) return;

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
      toast({ message: 'Visita eliminada correctamente', tone: 'success' });
    } catch (err) {
      console.error('Error deleting visita from calendar:', err);
      toast({ message: 'No se pudo eliminar la visita', tone: 'danger' });
      void fetchOportunidades();
    }
  };

  // Calendar Helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  // Filter visits
  const [selectedTecnicos, setSelectedTecnicos] = useState<string[]>([]);
  const [showTecnicoMenu, setShowTecnicoMenu] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setShowTecnicoMenu(false);
      }
    }
    if (showTecnicoMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTecnicoMenu]);

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

  const getResponsableNombre = (op: OportunidadVenta) =>
    op.tecnico?.nombre || op.tecnico_visita || 'Responsable';

  const tonoEstado = (est?: string): 'neutral' | 'success' | 'danger' | 'warning' => {
    switch (est) {
      case 'realizada':
        return 'success';
      case 'cancelada':
        return 'danger';
      case 'programada':
      default:
        return 'warning';
    }
  };

  const labelEstado = (est?: string): string => {
    switch (est) {
      case 'realizada':
        return 'Realizada';
      case 'cancelada':
        return 'Cancelada';
      case 'programada':
      default:
        return 'Programada';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendario de visitas a terreno"
        description="Planificación y asignación de inspecciones en terreno asociadas a oportunidades."
        actions={
          <Link href="/ventas">
            <Button variant="primary" icon={Plus}>
              Programar visita desde pipeline
            </Button>
          </Link>
        }
      />

      {/* Control Bar: Mes + Filtros */}
      <Panel className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Navegación de Mes */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
              <IconButton
                label="Mes anterior"
                onClick={prevMonth}
                icon={ChevronLeft}
              />
              <span className="t-body font-semibold text-ink px-2 t-num">
                {monthNames[month]} {year}
              </span>
              <IconButton
                label="Mes siguiente"
                onClick={nextMonth}
                icon={ChevronRight}
              />
            </div>

            <Button variant="secondary" size="sm" onClick={goToToday}>
              Hoy
            </Button>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Técnico (Multi-Selección Desplegable) */}
            <div className="relative" ref={filterMenuRef}>
              <div className="flex items-center gap-2">
                <span className="t-micro font-medium text-ink-muted">Técnico:</span>
                <button
                  type="button"
                  onClick={() => setShowTecnicoMenu(!showTecnicoMenu)}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 t-micro font-semibold text-ink flex items-center justify-between gap-2 min-w-[170px] hover:border-border-strong transition-colors"
                >
                  <span className="truncate">
                    {selectedTecnicos.length === 0
                      ? 'Todos los técnicos'
                      : selectedTecnicos.length === 1
                      ? personalVisitas.find((p) => p.id === selectedTecnicos[0])?.nombre || '1 seleccionado'
                      : `${selectedTecnicos.length} seleccionados`}
                  </span>
                  <ChevronRight
                    size={14}
                    className={`text-ink-muted transition-transform ${showTecnicoMenu ? 'rotate-90' : ''}`}
                  />
                </button>
              </div>

              {showTecnicoMenu && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-border bg-surface shadow-md p-3 z-30 space-y-2 t-micro">
                  <div className="flex items-center justify-between border-b border-border pb-1.5">
                    <span className="font-semibold text-ink uppercase tracking-normal">
                      Filtrar técnicos
                    </span>
                    {selectedTecnicos.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedTecnicos([])}
                        className="text-accent font-semibold hover:underline"
                      >
                        Limpiar filtro
                      </button>
                    )}
                  </div>

                  <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                    <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface-muted cursor-pointer font-semibold text-ink">
                      <input
                        type="checkbox"
                        checked={selectedTecnicos.length === 0}
                        onChange={() => setSelectedTecnicos([])}
                        className="rounded border-border text-accent focus:ring-accent"
                      />
                      <span>Todos los técnicos</span>
                    </label>

                    {personalVisitas.map((p) => {
                      const isChecked = selectedTecnicos.includes(p.id);
                      const count = oportunidades.filter((o) => o.tecnico_id === p.id).length;
                      return (
                        <label
                          key={p.id}
                          className="flex items-center justify-between p-1.5 rounded-lg hover:bg-surface-muted cursor-pointer font-medium text-ink"
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
                              className="rounded border-border text-accent focus:ring-accent"
                            />
                            <span className="truncate">{p.nombre}</span>
                          </div>
                          <span className="rounded-full bg-surface-muted px-1.5 py-0.5 t-micro t-num text-ink-muted font-semibold shrink-0">
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
            <div className="flex items-center gap-2">
              <span className="t-micro font-medium text-ink-muted">Estado:</span>
              <select
                value={selectedEstado}
                onChange={(e) => setSelectedEstado(e.target.value)}
                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 t-micro font-semibold text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                <option value="todos">Todos los estados</option>
                <option value="programada">Programadas</option>
                <option value="realizada">Realizadas</option>
                <option value="cancelada">Canceladas</option>
              </select>
            </div>
          </div>
        </div>
      </Panel>

      {/* Grid del Calendario Mensual y agenda */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Calendario mensual">
          <Panel className="overflow-x-auto p-0">
            <div className="min-w-[720px]">
              {/* Días de la semana */}
              <div className="grid grid-cols-7 border-b border-border bg-surface-muted text-center t-caption font-semibold text-ink-muted">
                {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d) => (
                  <div key={d} className="py-2.5 border-r last:border-r-0 border-border">
                    {d}
                  </div>
                ))}
              </div>

              {/* Celdas de Días */}
              <div className="grid grid-cols-7 divide-x divide-border bg-surface">
                {/* Celdas vacías del mes anterior */}
                {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                  <div
                    key={`empty-${idx}`}
                    className="min-h-[130px] bg-surface-muted/40 p-2 text-ink-subtle t-micro t-num select-none"
                  />
                ))}

                {/* Días del mes actual */}
                {Array.from({ length: daysInMonth }).map((_, dayIdx) => {
                  const dayNum = dayIdx + 1;
                  const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const isToday = formattedDate === todayLocal;

                  const dayVisitas = filteredVisitas.filter(
                    (o) => o.fecha_visita_terreno === formattedDate
                  );

                  return (
                    <div
                      key={dayNum}
                      className={`min-h-[130px] p-2 transition-colors flex flex-col justify-start gap-1 ${
                        isToday ? 'bg-accent/5 ring-1 ring-accent/30' : 'hover:bg-surface-muted/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`t-caption t-num font-semibold w-6 h-6 rounded-full flex items-center justify-center ${
                            isToday ? 'bg-accent text-on-accent' : 'text-ink'
                          }`}
                        >
                          {dayNum}
                        </span>
                        {dayVisitas.length > 0 && (
                          <span className="rounded-full bg-accent/15 px-1.5 py-0.5 t-micro t-num font-semibold text-accent-strong">
                            {dayVisitas.length} {dayVisitas.length === 1 ? 'visita' : 'visitas'}
                          </span>
                        )}
                      </div>

                      {/* Tarjetas de visitas en el día */}
                      <div className="space-y-1.5 overflow-y-auto max-h-[110px] pr-0.5">
                        {dayVisitas.map((op) => {
                          const responsableNombre = getResponsableNombre(op);

                          return (
                            <div
                              key={op.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedVisitaOp(op)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setSelectedVisitaOp(op);
                                }
                              }}
                              className="p-2 rounded-lg border border-border bg-surface text-left cursor-pointer transition-colors hover:border-accent/40 hover:bg-surface-muted space-y-1"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="t-micro font-semibold text-ink-muted truncate">
                                  {responsableNombre}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="t-micro t-num text-ink-muted font-medium flex items-center gap-0.5">
                                    <Clock size={11} className="text-ink-subtle" />
                                    {op.hora_visita_terreno || '09:00'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void deleteVisita(op);
                                    }}
                                    className="p-0.5 rounded text-ink-subtle hover:text-danger hover:bg-danger/10 transition-colors"
                                    title="Eliminar visita"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                <CodeStamp>{op.codigo}</CodeStamp>
                                <span className="truncate t-micro font-medium text-ink" title={op.titulo}>
                                  {op.titulo}
                                </span>
                              </div>

                              {op.cliente?.nombre && (
                                <div className="t-micro text-ink-muted truncate flex items-center gap-1">
                                  <Building size={11} className="text-ink-subtle shrink-0" />
                                  <span className="truncate">{op.cliente.nombre}</span>
                                </div>
                              )}

                              <div className="pt-0.5">
                                <StatusBadge tone={tonoEstado(op.estado_visita)}>
                                  {labelEstado(op.estado_visita)}
                                </StatusBadge>
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
          </Panel>
        </section>

        {/* Sidebar próximas visitas */}
        <aside className="space-y-4">
          <Panel className="p-4">
            <h2 className="t-body font-semibold text-ink">Próximas visitas</h2>
            <p className="mt-1 t-micro text-ink-muted">
              Inspecciones programadas según los filtros activos.
            </p>
            {upcomingVisitas.length ? (
              <div className="mt-3 space-y-1.5">
                {upcomingVisitas.map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setSelectedVisitaOp(op)}
                    className="block w-full rounded-lg p-2.5 text-left border border-border bg-surface hover:bg-surface-muted hover:border-border-strong transition-colors"
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <CodeStamp>{op.codigo}</CodeStamp>
                      <StatusBadge tone={tonoEstado(op.estado_visita)}>
                        {labelEstado(op.estado_visita)}
                      </StatusBadge>
                    </div>
                    <span className="block truncate t-caption font-medium text-ink">
                      {op.titulo}
                    </span>
                    <span className="mt-1 block t-micro text-ink-muted t-num">
                      {op.fecha_visita_terreno} · {getResponsableNombre(op)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-4 t-micro text-ink-muted">Sin visitas próximas.</p>
            )}
          </Panel>
        </aside>
      </div>

      {/* Modal de Detalle y Edición Directa de Visita */}
      {selectedVisitaOp && (
        <Dialog
          open={Boolean(selectedVisitaOp)}
          onClose={() => setSelectedVisitaOp(null)}
          title="Detalle de visita a terreno"
          description={selectedVisitaOp.codigo}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2 w-full">
              <div className="flex items-center gap-2">
                <Link
                  href={`/ventas?oportunidad=${selectedVisitaOp.cotizacion_actual_id || selectedVisitaOp.id}`}
                >
                  <Button variant="secondary" size="sm" icon={ExternalLink}>
                    Abrir en Pipeline
                  </Button>
                </Link>
                <Button
                  variant="destructive"
                  size="sm"
                  icon={Trash2}
                  onClick={() => {
                    if (selectedVisitaOp) {
                      void deleteVisita(selectedVisitaOp);
                    }
                  }}
                >
                  Eliminar Visita
                </Button>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setSelectedVisitaOp(null)}>
                Cerrar
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-muted">
              <div className="p-2 rounded-lg bg-accent/15 text-accent-strong shrink-0">
                <CalendarIcon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <CodeStamp>{selectedVisitaOp.codigo}</CodeStamp>
                  <StatusBadge tone={tonoEstado(selectedVisitaOp.estado_visita)}>
                    {labelEstado(selectedVisitaOp.estado_visita)}
                  </StatusBadge>
                </div>
                <h3 className="t-body font-semibold text-ink truncate mt-1">
                  {selectedVisitaOp.titulo}
                </h3>
              </div>
            </div>

            {/* Datos del Cliente */}
            <div className="rounded-lg border border-border bg-surface p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="t-caption font-semibold text-ink flex items-center gap-1.5">
                  <Building size={14} className="text-ink-muted" />
                  <span>{selectedVisitaOp.cliente?.nombre || 'Cliente General'}</span>
                </span>
                {selectedVisitaOp.cliente?.rut && (
                  <span className="t-micro t-num text-ink-muted">
                    {selectedVisitaOp.cliente.rut}
                  </span>
                )}
              </div>
              {(selectedVisitaOp.cliente?.direccion || selectedVisitaOp.cliente?.comuna) && (
                <div className="t-micro text-ink-muted flex items-center gap-1 pt-1">
                  <MapPin size={13} className="text-ink-subtle shrink-0" />
                  <span>
                    {selectedVisitaOp.cliente?.direccion}
                    {selectedVisitaOp.cliente?.comuna ? `, ${selectedVisitaOp.cliente.comuna}` : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Formulario de Modificación de Visita */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block t-caption font-semibold text-ink mb-1">
                  Técnico Asignado
                </label>
                <select
                  value={
                    selectedVisitaOp.tecnico_id ||
                    personalVisitas.find((p) => p.nombre === selectedVisitaOp.tecnico_visita)?.id ||
                    ''
                  }
                  onChange={(e) => {
                    void updateVisitaResponsable(selectedVisitaOp.id, e.target.value);
                  }}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 t-body text-ink font-medium outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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
                <label className="block t-caption font-semibold text-ink mb-1">
                  Estado de Visita
                </label>
                <select
                  value={selectedVisitaOp.estado_visita || 'programada'}
                  onChange={(e) => void updateVisitaField(selectedVisitaOp.id, 'estado_visita', e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 t-body text-ink font-medium outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                >
                  <option value="programada">Programada</option>
                  <option value="realizada">Realizada</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block t-caption font-semibold text-ink mb-1">
                  Fecha de Visita
                </label>
                <input
                  type="date"
                  value={selectedVisitaOp.fecha_visita_terreno || ''}
                  onChange={(e) => void updateVisitaField(selectedVisitaOp.id, 'fecha_visita_terreno', e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 t-body t-num text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>

              <div>
                <label className="block t-caption font-semibold text-ink mb-1">
                  Hora de Visita
                </label>
                <input
                  type="time"
                  value={selectedVisitaOp.hora_visita_terreno || '09:00'}
                  onChange={(e) => void updateVisitaField(selectedVisitaOp.id, 'hora_visita_terreno', e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 t-body t-num text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">
                Observaciones / Notas de Terreno
              </label>
              <textarea
                rows={3}
                placeholder="Instrucciones específicas para el técnico en terreno..."
                value={selectedVisitaOp.observaciones_visita || ''}
                onChange={(e) => void updateVisitaField(selectedVisitaOp.id, 'observaciones_visita', e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 t-body text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none"
              />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
