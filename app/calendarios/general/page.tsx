'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { createClient } from '../../../lib/supabase/client';
import { eventosEnConflicto, produccionesPendientesAntesDe } from '../../../lib/calendario-conflictos';
import type { EventoProduccionLogistica } from '../../../lib/types';
import {
  Button,
  IconButton,
  PageHeader,
  Panel,
  StatusBadge,
} from '../../../components/ui/crm';

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const localDate = (value: string) => dayKey(new Date(value));
const contextName = (event: EventoProduccionLogistica) => event.contexto === 'reventa_logistica' ? 'Reventa' : 'Producción';
const editUrl = (event: EventoProduccionLogistica) => event.contexto === 'reventa_logistica' ? '/reventa/calendario' : '/planificacion/calendario';

export default function CalendarioGeneralPage() {
  const supabase = useMemo(() => createClient(), []);
  const [eventos, setEventos] = useState<EventoProduccionLogistica[]>([]);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [view, setView] = useState<'calendario' | 'gantt'>('calendario');
  const [context, setContext] = useState('todos');
  const [type, setType] = useState('todos');
  const [status, setStatus] = useState('todos');
  const [responsible, setResponsible] = useState('todos');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase.from('eventos_produccion_logistica')
      .select('*, oportunidad:oportunidades(id, codigo, titulo), responsable:usuarios!responsable_id(id, nombre)')
      .order('fecha_inicio', { ascending: true });
    if (queryError) {
      setError('No se pudieron cargar los eventos del calendario.');
    } else {
      setError('');
      setEventos((data || []) as EventoProduccionLogistica[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    const channel = supabase.channel('calendario_general')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos_produccion_logistica' }, () => { void load(); })
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  const types = useMemo(() => [...new Set(eventos.map((event) => event.tipo_evento))].sort(), [eventos]);
  const statuses = useMemo(() => [...new Set(eventos.map((event) => event.estado))].sort(), [eventos]);
  const responsibles = useMemo(() => [...new Map(eventos.filter((event) => event.responsable_id).map((event) => [event.responsable_id, event.responsable?.nombre || 'Sin nombre'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es-CL')), [eventos]);
  const filtered = useMemo(() => eventos.filter((event) =>
    (context === 'todos' || event.contexto === context) &&
    (type === 'todos' || event.tipo_evento === type) &&
    (status === 'todos' || event.estado === status) &&
    (responsible === 'todos' || event.responsable_id === responsible)
  ), [eventos, context, type, status, responsible]);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const firstGrid = new Date(first);
  firstGrid.setDate(1 - ((first.getDay() + 6) % 7));
  const totalCells = Math.ceil((last.getDate() + ((first.getDay() + 6) % 7)) / 7) * 7;
  const days = Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(firstGrid);
    date.setDate(firstGrid.getDate() + index);
    return date;
  });

  const monthStart = dayKey(first);
  const monthEnd = dayKey(last);
  const monthEvents = filtered.filter((event) => localDate(event.fecha_inicio) <= monthEnd && localDate(event.fecha_fin || event.fecha_inicio) >= monthStart);
  const conflicts = new Set(monthEvents.filter((event) => eventosEnConflicto(event, eventos).length > 0).map((event) => event.id));
  const early = (event: EventoProduccionLogistica) => produccionesPendientesAntesDe(event, eventos).length > 0;
  const today = dayKey(new Date());
  const upcoming = filtered.filter((event) => localDate(event.fecha_fin || event.fecha_inicio) >= today).slice(0, 7);
  const alerts = monthEvents.filter((event) => conflicts.has(event.id) || early(event) || event.estado === 'reprogramado').slice(0, 6);
  const nextMonth = (offset: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1));

  return (
    <div className="hg-page space-y-5">
      <PageHeader
        title="Calendario Operativo General"
        description="Producción, reventa, despachos y recursos en una sola vista integrada."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/planificacion/calendario">
              <Button variant="secondary">Producción</Button>
            </Link>
            <Link href="/reventa/calendario">
              <Button variant="secondary">Reventa</Button>
            </Link>
          </div>
        }
      />

      {error && (
        <p role="alert" className="t-caption rounded-md border border-danger-line bg-danger-soft p-3 text-danger font-medium">
          {error}
        </p>
      )}

      {/* Control bar: Mes + Vista + Filtros */}
      <div className="hg-panel flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-control border border-line bg-surface p-1">
            <IconButton
              icon={ChevronLeft}
              label="Mes anterior"
              onClick={() => nextMonth(-1)}
              className="h-7 w-7"
            />
            <span className="min-w-36 text-center font-semibold text-ink text-xs capitalize">
              {month.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
            </span>
            <IconButton
              icon={ChevronRight}
              label="Mes siguiente"
              onClick={() => nextMonth(1)}
              className="h-7 w-7"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
          >
            Hoy
          </Button>
        </div>

        <div role="tablist" aria-label="Vista del calendario" className="flex rounded-control border border-line bg-surface-muted p-1">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'calendario'}
            onClick={() => setView('calendario')}
            className={`rounded-control px-3 py-1 text-xs font-semibold transition ${
              view === 'calendario' ? 'bg-surface text-ink shadow-xs' : 'text-ink-muted hover:text-ink'
            }`}
          >
            Mes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'gantt'}
            onClick={() => setView('gantt')}
            className={`rounded-control px-3 py-1 text-xs font-semibold transition ${
              view === 'gantt' ? 'bg-surface text-ink shadow-xs' : 'text-ink-muted hover:text-ink'
            }`}
          >
            Gantt
          </button>
        </div>
      </div>

      <div aria-label="Filtros de calendario" className="flex flex-wrap items-center gap-2 text-xs">
        <select
          aria-label="Contexto"
          className="hg-field !w-auto min-w-36 text-xs"
          value={context}
          onChange={(event) => setContext(event.target.value)}
        >
          <option value="todos">Todos los contextos</option>
          <option value="produccion_logistica">Producción</option>
          <option value="reventa_logistica">Reventa</option>
        </select>
        <select
          aria-label="Tipo de evento"
          className="hg-field !w-auto min-w-32 text-xs"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="todos">Todos los tipos</option>
          {types.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <select
          aria-label="Estado"
          className="hg-field !w-auto min-w-32 text-xs"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="todos">Todos los estados</option>
          {statuses.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <select
          aria-label="Responsable"
          className="hg-field !w-auto min-w-36 text-xs"
          value={responsible}
          onChange={(event) => setResponsible(event.target.value)}
        >
          <option value="todos">Todos los responsables</option>
          {responsibles.map(([id, name]) => (
            <option key={id} value={id || ''}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        {view === 'calendario' ? (
          <section className="hg-panel overflow-x-auto" aria-label="Calendario mensual">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-7 border-b border-line-subtle bg-surface-muted">
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((name) => (
                  <div key={name} className="border-r border-line-subtle p-2.5 text-center text-xs font-semibold text-ink-muted last:border-r-0">
                    {name}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {days.map((day) => {
                  const key = dayKey(day);
                  const dayEvents = monthEvents.filter((event) => localDate(event.fecha_inicio) <= key && localDate(event.fecha_fin || event.fecha_inicio) >= key);
                  const inMonth = day.getMonth() === month.getMonth();
                  const isToday = key === today;
                  return (
                    <div
                      key={key}
                      className={`min-h-[140px] border-b border-r border-line-subtle p-2 last:border-r-0 ${
                        inMonth ? 'bg-surface' : 'bg-surface-muted/40'
                      }`}
                    >
                      <div className="mb-2 flex justify-end">
                        <span
                          className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${
                            isToday
                              ? 'bg-accent text-on-accent'
                              : inMonth
                              ? 'text-ink'
                              : 'text-ink-muted opacity-50'
                          }`}
                        >
                          {day.getDate()}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map((event) => {
                          const hasAlert = conflicts.has(event.id) || early(event);
                          return (
                            <Link
                              key={event.id}
                              href={`${editUrl(event)}?opId=${event.oportunidad_id}`}
                              title={`${event.titulo} · ${event.responsable?.nombre || 'Sin responsable'}`}
                              className={`block rounded-md border px-2 py-1.5 text-[11px] leading-tight transition ${
                                hasAlert
                                  ? 'border-warning-line bg-warning-soft text-warning hover:bg-warning-soft/80'
                                  : event.contexto === 'reventa_logistica'
                                  ? 'border-info-line bg-info-soft text-info hover:bg-info-soft/80'
                                  : 'border-accent-line bg-accent-soft text-accent-ink hover:bg-accent-soft/80'
                              }`}
                            >
                              <span className="block truncate font-semibold">{event.titulo}</span>
                              <span className="block truncate opacity-80 text-[11px]">
                                {contextName(event)} · {event.responsable?.nombre || 'Sin responsable'}
                              </span>
                            </Link>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <span className="block px-1 text-[11px] text-ink-muted">+{dayEvents.length - 3} eventos</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          <section className="hg-panel overflow-x-auto p-4" aria-label="Cronograma Gantt">
            <div className="min-w-[900px]">
              <div className="flex border-b border-line-subtle pb-2 text-xs text-ink-muted font-semibold">
                <span className="w-52 shrink-0">Evento</span>
                <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${last.getDate()}, minmax(0, 1fr))` }}>
                  {Array.from({ length: last.getDate() }, (_, i) => (
                    <span key={i} className="text-center font-mono">
                      {i + 1}
                    </span>
                  ))}
                </div>
              </div>
              {monthEvents.map((event) => {
                const rawStart = new Date(event.fecha_inicio);
                const rawEnd = new Date(event.fecha_fin || event.fecha_inicio);
                const clippedStart = rawStart < first ? first : rawStart;
                const clippedEnd = rawEnd > last ? last : rawEnd;
                const left = ((clippedStart.getDate() - 1) / last.getDate()) * 100;
                const width = Math.max(1, ((clippedEnd.getDate() - clippedStart.getDate() + 1) / last.getDate()) * 100);
                const hasAlert = conflicts.has(event.id) || early(event);
                return (
                  <div key={event.id} className="flex items-center border-b border-line-subtle py-2 text-xs">
                    <Link
                      href={`${editUrl(event)}?opId=${event.oportunidad_id}`}
                      title={event.titulo}
                      className="w-52 shrink-0 truncate pr-3 font-semibold text-ink hover:text-accent-ink transition"
                    >
                      {event.titulo}
                    </Link>
                    <div className="relative h-6 flex-1 rounded-control bg-surface-muted">
                      <div
                        title={`${event.titulo}: ${localDate(event.fecha_inicio)} → ${localDate(event.fecha_fin || event.fecha_inicio)}`}
                        className={`absolute top-1 h-4 rounded-control ${
                          hasAlert
                            ? 'bg-warning'
                            : event.contexto === 'reventa_logistica'
                            ? 'bg-info'
                            : 'bg-accent'
                        }`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {!monthEvents.length && (
                <p className="p-8 text-center text-sm text-ink-muted">No hay eventos para este período y filtro.</p>
              )}
            </div>
          </section>
        )}

        <aside className="space-y-4">
          <Panel
            title={
              <div className="flex items-center gap-2">
                <CalendarDays size={16} className="text-accent-ink" />
                <span>Próxima agenda</span>
              </div>
            }
          >
            <div className="p-3">
              {loading ? (
                <p className="text-xs text-ink-muted">Cargando eventos…</p>
              ) : upcoming.length ? (
                <div className="space-y-1.5">
                  {upcoming.map((event) => (
                    <Link
                      key={event.id}
                      href={`${editUrl(event)}?opId=${event.oportunidad_id}`}
                      className="block rounded-md p-2 hover:bg-surface-muted transition"
                    >
                      <p className="truncate text-xs font-semibold text-ink">{event.titulo}</p>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-muted">
                        <Clock size={12} /> {new Date(event.fecha_inicio).toLocaleDateString('es-CL')} · {event.responsable?.nombre || 'Sin responsable'}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-muted">No hay próximos eventos con estos filtros.</p>
              )}
            </div>
          </Panel>

          <Panel
            title={
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-warning" />
                  <span>Alertas del mes</span>
                </div>
                {alerts.length > 0 && <StatusBadge tone="warning">{alerts.length}</StatusBadge>}
              </div>
            }
          >
            <div className="p-3">
              {alerts.length ? (
                <div className="space-y-1.5">
                  {alerts.map((event) => (
                    <Link
                      key={event.id}
                      href={`${editUrl(event)}?opId=${event.oportunidad_id}`}
                      className="block rounded-md border border-warning-line bg-warning-soft p-2 hover:bg-warning-soft/80 transition"
                    >
                      <p className="truncate text-xs font-semibold text-ink">{event.titulo}</p>
                      <p className="mt-1 text-[11px] text-warning font-medium">
                        {conflicts.has(event.id) ? 'Choque de recurso' : early(event) ? 'Antes de finalizar producción' : 'Reprogramado'}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-muted">Sin alertas visibles este mes.</p>
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
