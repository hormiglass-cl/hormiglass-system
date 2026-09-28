'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock, ListFilter } from 'lucide-react';
import { createClient } from '../../../lib/supabase/client';
import { eventosEnConflicto, produccionesPendientesAntesDe } from '../../../lib/calendario-conflictos';
import type { EventoProduccionLogistica } from '../../../lib/types';

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
    if (queryError) setError('No se pudieron cargar los eventos del calendario.');
    else { setError(''); setEventos((data || []) as EventoProduccionLogistica[]); }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    const channel = supabase.channel('calendario_general')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos_produccion_logistica' }, () => { void load(); })
      .subscribe();
    return () => { window.clearTimeout(timer); void supabase.removeChannel(channel); };
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

  return <div className="hg-page space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="hg-overline">Calendarios / Operación</p><h1 className="text-2xl font-bold">Calendario operativo general</h1><p className="mt-1 text-sm text-[#66716f]">Producción, reventa, despachos y recursos en una sola vista.</p></div>
      <div className="flex gap-2"><Link href="/planificacion/calendario" className="hg-button-secondary">Producción</Link><Link href="/reventa/calendario" className="hg-button-secondary">Reventa</Link></div>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="hg-panel flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="flex items-center gap-2"><button aria-label="Mes anterior" onClick={() => nextMonth(-1)} className="hg-button-secondary !min-h-8 !px-2"><ChevronLeft size={17} /></button><strong className="min-w-36 text-center capitalize">{month.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}</strong><button aria-label="Mes siguiente" onClick={() => nextMonth(1)} className="hg-button-secondary !min-h-8 !px-2"><ChevronRight size={17} /></button><button onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="hg-button-secondary !min-h-8">Hoy</button></div>
      <div role="tablist" aria-label="Vista del calendario" className="flex rounded-xl bg-[#f4f5f3] p-1"><button role="tab" aria-selected={view === 'calendario'} onClick={() => setView('calendario')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${view === 'calendario' ? 'bg-white shadow-sm' : 'text-[#66716f]'}`}>Mes</button><button role="tab" aria-selected={view === 'gantt'} onClick={() => setView('gantt')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${view === 'gantt' ? 'bg-white shadow-sm' : 'text-[#66716f]'}`}>Gantt</button></div>
    </div>
    <div aria-label="Filtros de calendario" className="flex flex-wrap items-center gap-2"><ListFilter size={16} className="text-[#66716f]" />
      <select aria-label="Contexto" className="hg-field !w-auto min-w-36" value={context} onChange={(event) => setContext(event.target.value)}><option value="todos">Todos los contextos</option><option value="produccion_logistica">Producción</option><option value="reventa_logistica">Reventa</option></select>
      <select aria-label="Tipo de evento" className="hg-field !w-auto min-w-32" value={type} onChange={(event) => setType(event.target.value)}><option value="todos">Todos los tipos</option>{types.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
      <select aria-label="Estado" className="hg-field !w-auto min-w-32" value={status} onChange={(event) => setStatus(event.target.value)}><option value="todos">Todos los estados</option>{statuses.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
      <select aria-label="Responsable" className="hg-field !w-auto min-w-36" value={responsible} onChange={(event) => setResponsible(event.target.value)}><option value="todos">Todos los responsables</option>{responsibles.map(([id, name]) => <option key={id} value={id || ''}>{name}</option>)}</select>
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      {view === 'calendario' ? <section className="hg-panel overflow-x-auto" aria-label="Calendario mensual">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-7 border-b border-[#e5e7e4] bg-[#fafaf9]">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((name) => <div key={name} className="border-r border-[#eff0ee] p-3 text-center text-xs font-semibold text-[#66716f] last:border-r-0">{name}</div>)}</div>
          <div className="grid grid-cols-7">{days.map((day) => {
            const key = dayKey(day);
            const dayEvents = monthEvents.filter((event) => localDate(event.fecha_inicio) <= key && localDate(event.fecha_fin || event.fecha_inicio) >= key);
            const inMonth = day.getMonth() === month.getMonth();
            return <div key={key} className={`min-h-[148px] border-b border-r border-[#eff0ee] p-2 last:border-r-0 ${inMonth ? 'bg-white' : 'bg-[#fafaf9]'}`}>
              <div className="mb-2 flex justify-end"><span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${key === today ? 'bg-[#e87622] font-bold text-white' : inMonth ? 'text-[#66716f]' : 'text-[#b8bfbc]'}`}>{day.getDate()}</span></div>
              <div className="space-y-1">{dayEvents.slice(0, 3).map((event) => <Link key={event.id} href={`${editUrl(event)}?opId=${event.oportunidad_id}`} title={`${event.titulo} · ${event.responsable?.nombre || 'Sin responsable'}`}
                className={`block rounded-lg border px-2 py-1.5 text-[11px] leading-tight transition hover:brightness-95 ${conflicts.has(event.id) || early(event) ? 'border-amber-300 bg-amber-50 text-amber-900' : event.contexto === 'reventa_logistica' ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-orange-200 bg-orange-50 text-orange-900'}`}>
                <span className="block truncate font-semibold">{event.titulo}</span><span className="block truncate opacity-75">{contextName(event)} · {event.responsable?.nombre || 'Sin responsable'}</span>
              </Link>)}{dayEvents.length > 3 && <span className="block px-1 text-[11px] text-[#66716f]">+{dayEvents.length - 3} eventos</span>}</div>
            </div>;
          })}</div>
        </div>
      </section> : <section className="hg-panel overflow-x-auto p-4" aria-label="Cronograma Gantt">
        <div className="min-w-[900px]"><div className="flex border-b border-[#e5e7e4] pb-2 text-xs text-[#66716f]"><span className="w-52 shrink-0">Evento</span><div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${last.getDate()}, minmax(0, 1fr))` }}>{Array.from({ length: last.getDate() }, (_, i) => <span key={i} className="text-center">{i + 1}</span>)}</div></div>
          {monthEvents.map((event) => {
            const rawStart = new Date(event.fecha_inicio);
            const rawEnd = new Date(event.fecha_fin || event.fecha_inicio);
            const clippedStart = rawStart < first ? first : rawStart;
            const clippedEnd = rawEnd > last ? last : rawEnd;
            const left = (clippedStart.getDate() - 1) / last.getDate() * 100;
            const width = Math.max(1, (clippedEnd.getDate() - clippedStart.getDate() + 1) / last.getDate() * 100);
            return <div key={event.id} className="flex items-center border-b border-[#eff0ee] py-2 text-xs"><Link href={`${editUrl(event)}?opId=${event.oportunidad_id}`} title={event.titulo} className="w-52 shrink-0 truncate pr-3 font-semibold hover:text-[#e87622]">{event.titulo}</Link><div className="relative h-6 flex-1 rounded bg-[#f4f5f3]"><div title={`${event.titulo}: ${localDate(event.fecha_inicio)} → ${localDate(event.fecha_fin || event.fecha_inicio)}`} className={`absolute top-1 h-4 rounded ${conflicts.has(event.id) || early(event) ? 'bg-amber-500' : event.contexto === 'reventa_logistica' ? 'bg-blue-500' : 'bg-orange-400'}`} style={{ left: `${left}%`, width: `${width}%` }} /></div></div>;
          })}{!monthEvents.length && <p className="p-8 text-center text-sm text-[#66716f]">No hay eventos para este período y filtro.</p>}</div>
      </section>}
      <aside className="space-y-4">
        <section className="hg-panel p-4"><div className="mb-3 flex items-center gap-2"><CalendarDays size={18} className="text-[#e87622]" /><h2 className="hg-section-title">Próxima agenda</h2></div>
          {loading ? <p className="text-xs text-[#66716f]">Cargando eventos…</p> : upcoming.length ? <div className="space-y-1">{upcoming.map((event) => <Link key={event.id} href={`${editUrl(event)}?opId=${event.oportunidad_id}`} className="block rounded-lg p-2 hover:bg-[#f4f5f3]"><p className="truncate text-xs font-semibold">{event.titulo}</p><p className="mt-1 flex items-center gap-1 text-[11px] text-[#66716f]"><Clock size={12} /> {new Date(event.fecha_inicio).toLocaleDateString('es-CL')} · {event.responsable?.nombre || 'Sin responsable'}</p></Link>)}</div> : <p className="text-xs text-[#66716f]">No hay próximos eventos con estos filtros.</p>}
        </section>
        <section className="hg-panel p-4"><div className="mb-3 flex items-center gap-2"><AlertTriangle size={18} className="text-amber-600" /><h2 className="hg-section-title">Alertas del mes</h2><span className="ml-auto rounded-full bg-amber-50 px-2 text-xs font-bold text-amber-800">{alerts.length}</span></div>
          {alerts.length ? <div className="space-y-1">{alerts.map((event) => <Link key={event.id} href={`${editUrl(event)}?opId=${event.oportunidad_id}`} className="block rounded-lg border border-amber-100 bg-amber-50/40 p-2 hover:bg-amber-50"><p className="truncate text-xs font-semibold">{event.titulo}</p><p className="mt-1 text-[11px] text-amber-800">{conflicts.has(event.id) ? 'Choque de recurso' : early(event) ? 'Antes de finalizar producción' : 'Reprogramado'}</p></Link>)}</div> : <p className="text-xs text-[#66716f]">Sin alertas visibles este mes.</p>}
        </section>
      </aside>
    </div>
  </div>;
}
