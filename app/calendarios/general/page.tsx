'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock, Plus } from 'lucide-react';
import { createClient } from '../../../lib/supabase/client';
import { eventosEnConflicto, produccionesPendientesAntesDe } from '../../../lib/calendario-conflictos';
import {
  CALENDARIO_KINDS,
  ESTADO_LABELS,
  KIND_ORDER,
  TIPO_LABELS,
  type CalendarioKind,
  type OrdenRow,
  type VisitaRow,
} from '../../../lib/calendario-tipos';
import type { EventoProduccionLogistica } from '../../../lib/types';
import { EventoLogisticoDialog, OrdenDialog, VisitaDialog } from '../../../components/calendario/DetalleDialogs';
import { MesAnioPicker } from '../../../components/calendario/MesAnioPicker';
import { NuevoEventoDialog } from '../../../components/calendario/NuevoEventoDialog';
import { Dialog, IconButton, StatusBadge } from '../../../components/ui/crm';
import { Fab } from '../../../components/ui/Fab';
import { useConfirm, useToast } from '../../../components/ui/feedback';
import { mensajeError } from '../../../lib/errores';
import {
  FilterBar,
  FilterMenu,
  matchMultiFilter,
  useFilterUi,
  type FilterDefinition,
} from '../../../components/ui/FilterPills';

type Tab = 'todos' | CalendarioKind;
type Vista = 'mes' | 'semana' | 'gantt';

/** Valores que ya usan otros enlaces (?contexto=visitas…) para cada calendario. */
const TAB_PARAM: Record<CalendarioKind, string> = {
  terreno: 'visitas',
  produccion: 'produccion_logistica',
  reventa: 'reventa_logistica',
  orden: 'ordenes',
};
const PARAM_TAB = Object.fromEntries(Object.entries(TAB_PARAM).map(([k, v]) => [v, k])) as Record<string, CalendarioKind>;

const PREF_KEY = 'hg-calendario-preferencias';
function leerPreferencia(): { tab?: string; vista?: string } {
  try {
    return JSON.parse(window.localStorage.getItem(PREF_KEY) || '{}');
  } catch {
    return {};
  }
}
function guardarPreferencia(parcial: { tab?: string; vista?: string }) {
  try {
    window.localStorage.setItem(PREF_KEY, JSON.stringify({ ...leerPreferencia(), ...parcial }));
  } catch {
    /* sin almacenamiento: se ignora */
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** Día local (YYYY-MM-DD) de una fecha con o sin hora. */
const dayStr = (value: string) => (value.length === 10 ? value : keyOf(new Date(value)));
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

interface ProduccionRow {
  orden_produccion_id: string | null;
  cotizacion_item_id: string | null;
  cantidad_producida: number;
}

type Raw =
  | { type: 'evento'; evento: EventoProduccionLogistica }
  | { type: 'visita'; visita: VisitaRow }
  | { type: 'orden'; orden: OrdenRow };

interface CalItem {
  key: string;
  kind: CalendarioKind;
  tipo: string;
  title: string;
  sub: string;
  start: string;
  end: string;
  time?: string;
  responsableId: string | null;
  responsable: string | null;
  estado: string;
  opId: string | null;
  alerta: string | null;
  raw: Raw;
}

export default function CalendarioGeneralPage() {
  const supabase = useMemo(() => createClient(), []);
  const filterUi = useFilterUi();

  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'todos';
    const fromUrl = PARAM_TAB[new URLSearchParams(window.location.search).get('contexto') || ''];
    if (fromUrl) return fromUrl;
    const saved = leerPreferencia().tab;
    return saved && (saved === 'todos' || saved in TAB_PARAM) ? (saved as Tab) : 'todos';
  });
  const [highlightedOpId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('opId');
  });
  const [vista, setVista] = useState<Vista>(() => {
    if (typeof window === 'undefined') return 'mes';
    const v = new URLSearchParams(window.location.search).get('vista') || leerPreferencia().vista;
    return v === 'semana' || v === 'gantt' ? v : 'mes';
  });
  const [cursor, setCursor] = useState(() => new Date());
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  const [eventos, setEventos] = useState<EventoProduccionLogistica[]>([]);
  const [visitas, setVisitas] = useState<VisitaRow[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenRow[]>([]);
  const [produccion, setProduccion] = useState<ProduccionRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [nuevo, setNuevo] = useState<{ kind: CalendarioKind; date?: string } | null>(null);
  const [abierto, setAbierto] = useState<CalItem | null>(null);
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const [gridH, setGridH] = useState(0);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setGridH(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, [vista]);

  const cambiarVista = (next: Vista) => {
    setVista(next);
    guardarPreferencia({ vista: next });
  };

  const cambiarTab = (next: Tab) => {
    setTab(next);
    guardarPreferencia({ tab: next });
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (next === 'todos') url.searchParams.delete('contexto');
      else url.searchParams.set('contexto', TAB_PARAM[next]);
      window.history.replaceState({}, '', url.toString());
    }
  };

  const load = useCallback(async () => {
    const [evRes, visRes, ordRes] = await Promise.all([
      supabase
        .from('eventos_produccion_logistica')
        .select('*, oportunidad:oportunidades(id, codigo, titulo), responsable:usuarios!responsable_id(id, nombre)')
        .order('fecha_inicio', { ascending: true }),
      supabase
        .from('visitas_terreno')
        .select(
          'id, fecha_visita_terreno, hora_visita_terreno, estado_visita, observaciones_visita, tecnico_id, tecnico:usuarios!tecnico_id(id, nombre), oportunidad:oportunidades(id, codigo, titulo, requiere_visita_terreno, cliente:clientes(nombre, rut, direccion, comuna))',
        )
        .order('fecha_visita_terreno', { ascending: true }),
      supabase
        .from('ordenes_produccion')
        .select(
          '*, items:orden_produccion_items(*), oportunidad:oportunidades(codigo, titulo), responsable:usuarios!responsable_id(id, nombre)',
        )
        .neq('estado', 'cancelada')
        .order('fecha_objetivo', { ascending: true, nullsFirst: false }),
    ]);

    setError(evRes.error || visRes.error || ordRes.error ? 'No se pudieron cargar todos los calendarios.' : '');
    if (evRes.data) setEventos(evRes.data as EventoProduccionLogistica[]);
    if (visRes.data) setVisitas(visRes.data as unknown as VisitaRow[]);
    if (ordRes.data) {
      const rows = ordRes.data as unknown as OrdenRow[];
      setOrdenes(rows);
      const ids = rows.map((row) => row.id);
      if (ids.length) {
        const prod = await supabase
          .from('produccion_diaria')
          .select('orden_produccion_id, cotizacion_item_id, cantidad_producida')
          .in('orden_produccion_id', ids);
        if (prod.data) setProduccion(prod.data as ProduccionRow[]);
      } else {
        setProduccion([]);
      }
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    const channel = supabase
      .channel('calendario_general')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos_produccion_logistica' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitas_terreno' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_produccion' }, () => void load())
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  /* ── Rango visible ── */
  const monthFirst = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthLast = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const cursorKey = keyOf(cursor);
  const days = useMemo(() => {
    const base = new Date(`${cursorKey}T12:00:00`);
    if (vista === 'semana') {
      const monday = new Date(base);
      monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d;
      });
    }
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    const lead = (first.getDay() + 6) % 7;
    const total = Math.ceil((last.getDate() + lead) / 7) * 7;
    const start = new Date(first);
    start.setDate(1 - lead);
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [vista, cursorKey]);
  const rangeStart = keyOf(vista === 'gantt' ? monthFirst : days[0]);
  const rangeEnd = keyOf(vista === 'gantt' ? monthLast : days[days.length - 1]);

  const mover = (dir: -1 | 1) => {
    if (vista === 'semana') {
      const next = new Date(cursor);
      next.setDate(cursor.getDate() + dir * 7);
      setCursor(next);
    } else {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
    }
  };
  const bloqueado = Boolean(nuevo || abierto || diaAbierto);
  useEffect(() => {
    if (bloqueado) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="listbox"]')) return;
      const key = event.key.toLowerCase();
      const paso = (dir: -1 | 1) =>
        setCursor((prev) =>
          vista === 'semana'
            ? new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + dir * 7)
            : new Date(prev.getFullYear(), prev.getMonth() + dir, 1),
        );
      if (key === 'arrowleft') paso(-1);
      else if (key === 'arrowright') paso(1);
      else if (key === 't') setCursor(new Date());
      else if (key === 'm') cambiarVista('mes');
      else if (key === 's') cambiarVista('semana');
      else if (key === 'g') cambiarVista('gantt');
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bloqueado, vista]);

  /* ── Arrastrar para reprogramar ── */
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [diaSobre, setDiaSobre] = useState<string | null>(null);

  const movible = (item: CalItem) =>
    !!item.start && !['completado', 'no_realizado', 'realizada', 'cancelada', 'completada'].includes(item.estado);

  const moverItem = async (item: CalItem, destino: string) => {
    const delta = Math.round((Date.parse(`${destino}T12:00:00Z`) - Date.parse(`${item.start}T12:00:00Z`)) / 86400000);
    if (!delta) return;
    const shiftDay = (day: string) => {
      const d = new Date(`${day}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + delta);
      return d.toISOString().slice(0, 10);
    };
    const destinoTxt = new Date(`${destino}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
    try {
      if (item.raw.type === 'evento') {
        const ev = item.raw.evento;
        const ini = new Date(ev.fecha_inicio);
        const fin = new Date(ev.fecha_fin || ev.fecha_inicio);
        ini.setDate(ini.getDate() + delta);
        fin.setDate(fin.getDate() + delta);
        const candidato = { ...ev, fecha_inicio: ini.toISOString(), fecha_fin: fin.toISOString() };
        const choques = eventosEnConflicto(candidato, eventos);
        const pendiente = produccionesPendientesAntesDe(candidato, eventos).length > 0;
        const ok = await confirm({
          title: 'Reprogramar evento',
          message: `"${ev.titulo}" pasará al ${destinoTxt}.${choques.length ? ` Choca con: ${choques.map((c) => c.titulo).join(', ')}.` : ''}${pendiente ? ' La producción termina después del despacho o instalación.' : ''} ¿Confirmar?`,
          confirmLabel: 'Reprogramar',
          destructive: false,
        });
        if (!ok) return;
        const motivo = 'Reprogramado arrastrando en el calendario';
        const { error: err } = await supabase
          .from('eventos_produccion_logistica')
          .update({
            fecha_inicio: candidato.fecha_inicio,
            fecha_fin: candidato.fecha_fin,
            fecha_evento: ini.toISOString().split('T')[0],
            estado: 'reprogramado',
            motivo_reprogramacion: motivo,
            conflicto_confirmado_motivo: choques.length || pendiente ? motivo : null,
          })
          .eq('id', ev.id);
        if (err) throw err;
      } else if (item.raw.type === 'visita') {
        const ok = await confirm({
          title: 'Reprogramar visita',
          message: `La visita pasará al ${destinoTxt}. ¿Confirmar?`,
          confirmLabel: 'Reprogramar',
          destructive: false,
        });
        if (!ok) return;
        const { error: err } = await supabase
          .from('visitas_terreno')
          .update({ fecha_visita_terreno: destino })
          .eq('id', item.raw.visita.id);
        if (err) throw err;
      } else {
        const o = item.raw.orden;
        const ok = await confirm({
          title: 'Mover orden de producción',
          message: `La orden se desplazará ${Math.abs(delta)} día${Math.abs(delta) === 1 ? '' : 's'} ${delta > 0 ? 'hacia adelante' : 'hacia atrás'}. ¿Confirmar?`,
          confirmLabel: 'Mover orden',
          destructive: false,
        });
        if (!ok) return;
        const { error: err } = await supabase
          .from('ordenes_produccion')
          .update({
            fecha_inicio: o.fecha_inicio ? shiftDay(o.fecha_inicio) : null,
            fecha_objetivo: o.fecha_objetivo ? shiftDay(o.fecha_objetivo) : null,
          })
          .eq('id', o.id);
        if (err) throw err;
      }
      toast({ message: 'Fecha actualizada.', tone: 'success' });
      void load();
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo reprogramar.'), tone: 'danger' });
    }
  };

  const rangeLabel =
    vista === 'semana'
      ? `${days[0].toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : cursor.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

  /* ── Datos normalizados ── */
  const alertas = useMemo(() => {
    const map = new Map<string, string>();
    for (const ev of eventos) {
      if (dayStr(ev.fecha_inicio) > rangeEnd || dayStr(ev.fecha_fin || ev.fecha_inicio) < rangeStart) continue;
      if (eventosEnConflicto(ev, eventos).length > 0) map.set(ev.id, 'Choque de recurso');
      else if (produccionesPendientesAntesDe(ev, eventos).length > 0) map.set(ev.id, 'Antes de finalizar producción');
      else if (ev.estado === 'reprogramado') map.set(ev.id, 'Reprogramado');
    }
    return map;
  }, [eventos, rangeStart, rangeEnd]);

  const items = useMemo<CalItem[]>(() => {
    const list: CalItem[] = [];
    for (const ev of eventos) {
      list.push({
        key: `ev-${ev.id}`,
        kind: ev.contexto === 'reventa_logistica' ? 'reventa' : 'produccion',
        tipo: ev.tipo_evento,
        title: ev.titulo,
        sub: ev.responsable?.nombre || 'Sin responsable',
        start: dayStr(ev.fecha_inicio),
        end: dayStr(ev.fecha_fin || ev.fecha_inicio),
        time: new Date(ev.fecha_inicio).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        responsableId: ev.responsable_id || null,
        responsable: ev.responsable?.nombre || null,
        estado: ev.estado,
        opId: ev.oportunidad_id,
        alerta: alertas.get(ev.id) || null,
        raw: { type: 'evento', evento: ev },
      });
    }
    for (const v of visitas) {
      if (!v.fecha_visita_terreno || v.oportunidad?.requiere_visita_terreno === false) continue;
      const fecha = v.fecha_visita_terreno.slice(0, 10);
      list.push({
        key: `vi-${v.id}`,
        kind: 'terreno',
        tipo: 'visita',
        title: v.oportunidad ? `${v.oportunidad.codigo} — ${v.oportunidad.titulo}` : 'Visita a terreno',
        sub: v.tecnico?.nombre || 'Sin técnico',
        start: fecha,
        end: fecha,
        time: v.hora_visita_terreno?.slice(0, 5) || undefined,
        responsableId: v.tecnico_id,
        responsable: v.tecnico?.nombre || null,
        estado: v.estado_visita || 'programada',
        opId: v.oportunidad?.id || null,
        alerta: null,
        raw: { type: 'visita', visita: v },
      });
    }
    for (const o of ordenes) {
      const a = o.fecha_inicio || o.fecha_objetivo || '';
      const b = o.fecha_objetivo || o.fecha_inicio || '';
      list.push({
        key: `or-${o.id}`,
        kind: 'orden',
        tipo: 'orden',
        title: o.oportunidad ? `${o.oportunidad.codigo} — ${o.oportunidad.titulo}` : 'Orden de producción',
        sub: o.responsable?.nombre || 'Sin responsable',
        start: a && b ? (a < b ? a : b) : a,
        end: a && b ? (a < b ? b : a) : b,
        responsableId: o.responsable_id || null,
        responsable: o.responsable?.nombre || null,
        estado: o.estado,
        opId: o.oportunidad_id,
        alerta: null,
        raw: { type: 'orden', orden: o },
      });
    }
    return list;
  }, [eventos, visitas, ordenes, alertas]);

  const tabItems = useMemo(() => (tab === 'todos' ? items : items.filter((i) => i.kind === tab)), [items, tab]);

  /* ── Filtros: los mismos en todos los calendarios ── */
  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    const defs: FilterDefinition[] = [];
    if (tab === 'todos') {
      defs.push({
        id: 'calendario',
        label: 'Calendario',
        allLabel: 'Todos los calendarios',
        options: KIND_ORDER.map((k) => ({ value: k, label: CALENDARIO_KINDS[k].short })),
      });
    }
    const tipos = [...new Set(tabItems.map((i) => i.tipo))].sort();
    const estados = [...new Set(tabItems.map((i) => i.estado))].sort();
    const responsables = [
      ...new Map(tabItems.filter((i) => i.responsableId).map((i) => [i.responsableId as string, i.responsable || 'Sin nombre'])).entries(),
    ].sort((a, b) => a[1].localeCompare(b[1], 'es-CL'));
    defs.push(
      {
        id: 'tipo',
        label: 'Tipo de evento',
        allLabel: 'Todos los tipos',
        options: tipos.map((t) => ({ value: t, label: TIPO_LABELS[t] || t.replaceAll('_', ' ') })),
      },
      {
        id: 'estado',
        label: 'Estado',
        allLabel: 'Todos los estados',
        options: estados.map((e) => ({ value: e, label: ESTADO_LABELS[e] || e.replaceAll('_', ' ') })),
      },
      {
        id: 'responsable',
        label: 'Responsable',
        allLabel: 'Todos los responsables',
        options: responsables.map(([id, nombre]) => ({
          value: id,
          label: nombre,
          count: tabItems.filter((i) => i.responsableId === id).length,
        })),
      },
    );
    return defs;
  }, [tabItems, tab]);

  const filtered = useMemo(
    () =>
      tabItems.filter(
        (i) =>
          matchMultiFilter(activeFilters.calendario, (v) => v === i.kind) &&
          matchMultiFilter(activeFilters.tipo, (v) => v === i.tipo) &&
          matchMultiFilter(activeFilters.estado, (v) => v === i.estado) &&
          matchMultiFilter(activeFilters.responsable, (v) => v === i.responsableId),
      ),
    [tabItems, activeFilters],
  );

  const today = keyOf(new Date());
  const dated = filtered.filter((i) => i.start && i.end);
  const undated = filtered.filter((i) => !i.start);
  const inRange = dated.filter((i) => i.start <= rangeEnd && i.end >= rangeStart);
  const upcoming = dated.filter((i) => i.end >= today).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6);
  const alertItems = inRange.filter((i) => i.alerta).slice(0, 5);

  const counts = useMemo(() => {
    const c: Record<CalendarioKind, number> = { terreno: 0, produccion: 0, reventa: 0, orden: 0 };
    for (const i of items) c[i.kind] += 1;
    return c;
  }, [items]);

  const progresoOrden = (orden: OrdenRow) =>
    (orden.items || []).map((item) => ({
      ...item,
      hecho: produccion
        .filter((row) => row.orden_produccion_id === orden.id && row.cotizacion_item_id === item.cotizacion_item_id)
        .reduce((sum, row) => sum + Number(row.cantidad_producida), 0),
    }));

  const nuevoKind: CalendarioKind = tab === 'todos' ? 'produccion' : tab;

  /* ── Piezas de interfaz ── */
  const chip = (item: CalItem, modo: 'linea' | 'detalle') => {
    const conf = CALENDARIO_KINDS[item.kind];
    const resaltado = highlightedOpId && item.opId === highlightedOpId;
    return (
      <button
        type="button"
        key={item.key}
        draggable={movible(item)}
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', item.key);
          event.dataTransfer.effectAllowed = 'move';
          setArrastrando(item.key);
        }}
        onDragEnd={() => {
          setArrastrando(null);
          setDiaSobre(null);
        }}
        onClick={() => setAbierto(item)}
        title={`${conf.short} · ${item.title} · ${item.sub}${item.time ? ` · ${item.time}` : ''}`}
        className={`block w-full rounded-md border px-1.5 text-left text-[11px] leading-tight transition ${conf.chip} ${
          modo === 'linea' ? 'py-0.5' : 'py-1.5'
        } ${resaltado ? 'ring-2 ring-accent' : ''} ${
          arrastrando === item.key ? 'opacity-40' : ''
        } ${movible(item) ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        <span className="flex items-center gap-1">
          {item.alerta && <AlertTriangle size={11} className="shrink-0" aria-label={item.alerta} />}
          {modo === 'linea' && item.time && <span className="t-num shrink-0 opacity-80">{item.time}</span>}
          <span className="truncate font-semibold">{item.title}</span>
        </span>
        {modo === 'detalle' && (
          <span className="mt-0.5 block truncate opacity-80">
            {item.time ? `${item.time} · ` : ''}
            {tab === 'todos' ? `${conf.short} · ` : ''}
            {item.sub}
          </span>
        )}
      </button>
    );
  };

  const filas = vista === 'mes' ? days.length / 7 : 1;
  const alturaFila = gridH && vista === 'mes' ? gridH / filas : 0;
  const limiteMes = alturaFila ? Math.max(1, Math.min(6, Math.floor((alturaFila - 32) / 22))) : 2;

  const diaItems = diaAbierto ? inRange.filter((i) => i.start <= diaAbierto && i.end >= diaAbierto) : [];

  return (
    <div className="hg-page flex flex-col xl:h-[calc(100dvh-6.5rem)] xl:min-h-[600px]">
      {/* Pestañas: la activa envuelve el calendario que muestra */}
      <div role="tablist" aria-label="Calendarios" className="relative flex shrink-0 items-end gap-1 overflow-x-auto rounded-t-panel border border-b-0 border-line bg-surface-muted px-3 pt-2">
        {([['todos', 'General', items.length], ...KIND_ORDER.map((k) => [k, CALENDARIO_KINDS[k].short, counts[k]])] as [Tab, string, number][]).map(
          ([id, label, count]) => {
            const activo = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => cambiarTab(id)}
                className={`relative flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-2.5 text-[13px] font-semibold transition ${
                  activo
                    ? 'bg-surface text-ink before:absolute before:-left-3 before:bottom-0 before:h-3 before:w-3 before:rounded-br-xl before:shadow-[5px_5px_0_5px_var(--hg-surface)] after:absolute after:-right-3 after:bottom-0 after:h-3 after:w-3 after:rounded-bl-xl after:shadow-[-5px_5px_0_5px_var(--hg-surface)]'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {id === 'todos' ? (
                  <CalendarDays size={15} aria-hidden />
                ) : (
                  <span className={`h-2.5 w-2.5 rounded-full ${CALENDARIO_KINDS[id].solid}`} aria-hidden />
                )}
                <span>{label}</span>
                <span className="t-num rounded-full bg-surface-muted px-1.5 text-[11px] font-medium text-ink-muted">{count}</span>
              </button>
            );
          },
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-b-panel rounded-tr-panel border border-t-0 border-line bg-surface">
        {/* Barra: rango, filtros y vistas */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <IconButton icon={ChevronLeft} label={vista === 'semana' ? 'Semana anterior' : 'Mes anterior'} onClick={() => mover(-1)} />
              <MesAnioPicker
                label={rangeLabel}
                value={cursor}
                onSelect={(year, month) => setCursor(new Date(year, month, 1))}
              />
              <IconButton icon={ChevronRight} label={vista === 'semana' ? 'Semana siguiente' : 'Mes siguiente'} onClick={() => mover(1)} />
            </div>
            <FilterMenu
              triggerClassName="min-h-9 justify-center rounded-lg px-2.5 text-[13px]"
              filters={filterDefinitions}
              activeFilters={activeFilters}
              ui={filterUi}
            />
          </div>

          <div role="tablist" aria-label="Vista del calendario" className="flex items-center gap-5">
            {(['mes', 'semana', 'gantt'] as Vista[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={vista === v}
                title={`Atajo: ${v === 'mes' ? 'M' : v === 'semana' ? 'S' : 'G'}`}
                onClick={() => cambiarVista(v)}
                className={`border-b-2 pb-1 text-xs font-semibold uppercase tracking-wide transition ${
                  vista === v ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {v === 'mes' ? 'Mes' : v === 'semana' ? 'Semana' : 'Gantt'}
              </button>
            ))}
          </div>
        </div>

        <div className="shrink-0 px-4 empty:hidden">
          <FilterBar
            filters={filterDefinitions}
            activeFilters={activeFilters}
            onFilterChange={(id, val) => setActiveFilters((prev) => ({ ...prev, [id]: val }))}
            onClearAll={() => setActiveFilters({})}
            ui={filterUi}
            className="mb-3"
          />
        </div>

        {error && (
          <p role="alert" className="t-caption mx-4 mb-3 rounded-md border border-danger-line bg-danger-soft p-3 font-medium text-danger">
            {error}
          </p>
        )}

        <div className="grid min-h-0 flex-1 border-t border-line-subtle xl:grid-cols-[minmax(0,1fr)_280px]">
          {/* Calendario */}
          <section className="flex min-h-[520px] min-w-0 flex-col xl:min-h-0" aria-label="Calendario">
            {vista !== 'gantt' ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
                <div className="flex min-h-0 min-w-[720px] flex-1 flex-col">
                  <div className="grid shrink-0 grid-cols-7 border-b border-line-subtle bg-surface-muted/60">
                    {WEEKDAYS.map((name) => (
                      <div key={name} className="p-2 text-center text-xs font-semibold text-ink-muted">
                        {name}
                      </div>
                    ))}
                  </div>
                  <div
                    ref={gridRef}
                    className="grid min-h-0 flex-1 grid-cols-7"
                    style={{ gridTemplateRows: `repeat(${filas}, minmax(0, 1fr))` }}
                  >
                    {days.map((day) => {
                      const key = keyOf(day);
                      const dayItems = inRange.filter((i) => i.start <= key && i.end >= key);
                      const inMonth = vista === 'semana' || day.getMonth() === cursor.getMonth();
                      const isToday = key === today;
                      const limite = vista === 'semana' ? dayItems.length : dayItems.length > limiteMes ? limiteMes - 1 : limiteMes;
                      return (
                        <div
                          key={key}
                          onDragOver={(event) => {
                            if (!arrastrando) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            if (diaSobre !== key) setDiaSobre(key);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const dropped = items.find((i) => i.key === arrastrando);
                            setArrastrando(null);
                            setDiaSobre(null);
                            if (dropped) void moverItem(dropped, key);
                          }}
                          className={`group flex min-h-0 flex-col gap-1 border-b border-r border-line-subtle p-1.5 ${
                            diaSobre === key ? 'ring-2 ring-inset ring-accent' : ''
                          } ${
                            vista === 'semana' ? 'overflow-y-auto' : 'overflow-hidden'
                          } ${inMonth ? 'bg-surface' : 'bg-surface-muted/40'}`}
                        >
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => setNuevo({ kind: nuevoKind, date: key })}
                              aria-label={`Programar el ${day.getDate()}`}
                              className="rounded-md p-0.5 text-ink-muted opacity-0 transition hover:text-accent-ink focus-visible:opacity-100 group-hover:opacity-100"
                            >
                              <Plus size={14} />
                            </button>
                            <span
                              className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${
                                isToday ? 'bg-accent text-on-accent' : inMonth ? 'text-ink' : 'text-ink-muted opacity-50'
                              }`}
                            >
                              {day.getDate()}
                            </span>
                          </div>
                          {dayItems.slice(0, limite).map((item) => chip(item, vista === 'semana' ? 'detalle' : 'linea'))}
                          {dayItems.length > limite && (
                            <button
                              type="button"
                              onClick={() => setDiaAbierto(key)}
                              className="px-1 text-left text-[11px] font-semibold text-accent-ink hover:underline"
                            >
                              +{dayItems.length - limite} más
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto p-4">
                <div className="min-w-[900px]">
                  <div className="flex border-b border-line-subtle pb-2 text-xs font-semibold text-ink-muted">
                    <span className="w-52 shrink-0">Evento</span>
                    <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${monthLast.getDate()}, minmax(0, 1fr))` }}>
                      {Array.from({ length: monthLast.getDate() }, (_, i) => (
                        <span key={i} className="text-center font-mono">
                          {i + 1}
                        </span>
                      ))}
                    </div>
                  </div>
                  {inRange.map((item) => {
                    const total = monthLast.getDate();
                    const startDay = item.start < rangeStart ? 1 : Number(item.start.slice(8, 10));
                    const endDay = item.end > rangeEnd ? total : Number(item.end.slice(8, 10));
                    return (
                      <div key={item.key} className="flex items-center border-b border-line-subtle py-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setAbierto(item)}
                          title={item.title}
                          className="w-52 shrink-0 truncate pr-3 text-left font-semibold text-ink transition hover:text-accent-ink"
                        >
                          {item.title}
                        </button>
                        <div className="relative h-6 flex-1 rounded-control bg-surface-muted">
                          <div
                            title={`${item.title}: ${item.start} → ${item.end}`}
                            className={`absolute top-1 h-4 rounded-control ${CALENDARIO_KINDS[item.kind].solid}`}
                            style={{
                              left: `${((startDay - 1) / total) * 100}%`,
                              width: `${Math.max(1, ((endDay - startDay + 1) / total) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {!inRange.length && <p className="p-8 text-center text-sm text-ink-muted">No hay eventos para este período y filtro.</p>}
                </div>
              </div>
            )}
          </section>

          {/* Panel lateral: igual en todos los calendarios */}
          <aside className="min-h-0 space-y-5 overflow-y-auto border-t border-line-subtle p-4 xl:border-l xl:border-t-0">
            <section aria-label="Próxima agenda">
              <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <CalendarDays size={14} className="text-accent-ink" aria-hidden />
                Próxima agenda
              </h2>
              {loading ? (
                <p className="text-xs text-ink-muted">Cargando eventos…</p>
              ) : upcoming.length ? (
                <div className="space-y-1">
                  {upcoming.map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      onClick={() => setAbierto(item)}
                      className="flex w-full items-start gap-2 rounded-md p-2 text-left transition hover:bg-surface-muted"
                    >
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${CALENDARIO_KINDS[item.kind].solid}`} aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-ink">{item.title}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-muted">
                          <Clock size={11} aria-hidden />
                          {new Date(`${item.start}T12:00:00`).toLocaleDateString('es-CL')} · {item.sub}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-muted">No hay próximos eventos con estos filtros.</p>
              )}
            </section>

            <section aria-label="Alertas del período">
              <h2 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <span className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-warning" aria-hidden />
                  Alertas del período
                </span>
                {alertItems.length > 0 && <StatusBadge tone="warning">{alertItems.length}</StatusBadge>}
              </h2>
              {alertItems.length ? (
                <div className="space-y-1.5">
                  {alertItems.map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      onClick={() => setAbierto(item)}
                      className="block w-full rounded-md border border-warning-line bg-warning-soft p-2 text-left transition hover:bg-warning-soft/80"
                    >
                      <span className="block truncate text-xs font-semibold text-ink">{item.title}</span>
                      <span className="mt-0.5 block text-[11px] font-medium text-warning">{item.alerta}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-muted">Sin alertas en este período.</p>
              )}
            </section>

            {undated.length > 0 && (
              <section aria-label="Órdenes sin fecha">
                <h2 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Órdenes sin fecha
                  <StatusBadge tone="neutral">{undated.length}</StatusBadge>
                </h2>
                <div className="space-y-1.5">
                  {undated.map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      onClick={() => setAbierto(item)}
                      className="block w-full rounded-md border border-violet-line bg-violet-soft p-2 text-left text-violet transition hover:bg-violet-soft/70"
                    >
                      <span className="block truncate text-xs font-semibold">{item.title}</span>
                      <span className="text-[11px] opacity-80">Toca para asignar fechas</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>

      <Fab label="Programar evento" onClick={() => setNuevo({ kind: nuevoKind })} />

      {nuevo && (
        <NuevoEventoDialog
          initialKind={nuevo.kind}
          initialDate={nuevo.date}
          eventos={eventos}
          ordenes={ordenes}
          onClose={() => setNuevo(null)}
          onCreated={() => void load()}
        />
      )}

      {abierto?.raw.type === 'evento' && (
        <EventoLogisticoDialog evento={abierto.raw.evento} eventos={eventos} onClose={() => setAbierto(null)} onChanged={() => void load()} />
      )}
      {abierto?.raw.type === 'visita' && (
        <VisitaDialog visita={abierto.raw.visita} onClose={() => setAbierto(null)} onChanged={() => void load()} />
      )}
      {abierto?.raw.type === 'orden' && (
        <OrdenDialog
          orden={abierto.raw.orden}
          progreso={progresoOrden(abierto.raw.orden)}
          onClose={() => setAbierto(null)}
          onChanged={() => void load()}
        />
      )}

      {diaAbierto && (
        <Dialog
          open
          onClose={() => setDiaAbierto(null)}
          title={new Date(`${diaAbierto}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
          description={`${diaItems.length} eventos`}
          size="md"
        >
          <div className="space-y-1.5">
            {diaItems.map((item) => (
              <div key={item.key}>{chip(item, 'detalle')}</div>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
}
