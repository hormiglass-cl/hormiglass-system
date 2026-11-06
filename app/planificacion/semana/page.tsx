'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Factory, AlertTriangle } from 'lucide-react';
import { createClient } from '../../../lib/supabase/client';
import type { OrdenProduccion, ProduccionDiaria } from '../../../lib/types';
import { mensajeError } from '../../../lib/errores';
import {
  PageHeader,
  Panel,
  IconButton,
  CodeStamp,
  StatusBadge,
} from '../../../components/ui/crm';

type Fila = OrdenProduccion & { oportunidad?: { codigo: string; titulo: string } | null };

function mondayOf(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function tonoEstado(estado: string): 'neutral' | 'info' | 'success' | 'danger' | 'warning' {
  switch (estado) {
    case 'completada':
      return 'success';
    case 'en_proceso':
    case 'en_produccion':
      return 'info';
    case 'cancelada':
      return 'danger';
    case 'pendiente':
    default:
      return 'neutral';
  }
}

export default function SemanaProduccionPage() {
  const supabase = useMemo(() => createClient(), []);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [day, setDay] = useState(todayIso);
  const [orders, setOrders] = useState<Fila[]>([]);
  const [daily, setDaily] = useState<ProduccionDiaria[]>([]);
  const [error, setError] = useState('');

  const monday = mondayOf(day);
  const sundayDate = new Date(`${monday}T12:00:00Z`);
  sundayDate.setUTCDate(sundayDate.getUTCDate() + 6);
  const sunday = sundayDate.toISOString().slice(0, 10);

  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${monday}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const iso = date.toISOString().slice(0, 10);
    return {
      iso,
      isToday: iso === todayIso,
      label: date.toLocaleDateString('es-CL', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }),
    };
  });

  const moveWeek = (offset: number) => {
    const date = new Date(`${monday}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset * 7);
    setDay(date.toISOString().slice(0, 10));
  };

  const undated = orders.filter((order) => !order.fecha_inicio && !order.fecha_objetivo);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error: queryError } = await supabase
        .from('ordenes_produccion')
        .select('*, items:orden_produccion_items(*), oportunidad:oportunidades(codigo,titulo)')
        .neq('estado', 'cancelada')
        .or(
          `and(estado.neq.completada,fecha_inicio.lte.${sunday},fecha_objetivo.gte.${monday}),and(fecha_objetivo.gte.${monday},fecha_objetivo.lte.${sunday}),and(fecha_objetivo.is.null,fecha_inicio.lte.${sunday},estado.neq.completada),and(fecha_objetivo.is.null,fecha_inicio.is.null,estado.neq.completada)`
        )
        .order('fecha_objetivo', { nullsFirst: false });

      if (!active) return;
      if (queryError) {
        setError(mensajeError(queryError));
      } else {
        const rows = (data || []) as Fila[];
        const ids = rows.map((row) => row.id);
        const production = ids.length
          ? await supabase.from('produccion_diaria').select('*').in('orden_produccion_id', ids)
          : { data: [], error: null };
        if (!active) return;
        if (production.error) {
          setError(mensajeError(production.error));
        } else {
          setError('');
          setOrders(rows);
          setDaily((production.data || []) as ProduccionDiaria[]);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [supabase, monday, sunday]);

  const progress = (order: Fila) =>
    order.items
      ?.map((item) => {
        const produced = daily
          .filter((row) => row.orden_produccion_id === order.id && row.cotizacion_item_id === item.cotizacion_item_id)
          .reduce((sum, row) => sum + Number(row.cantidad_producida), 0);
        return `${item.producto}: ${produced} / ${item.cantidad_objetivo}${item.unidad ? ` ${item.unidad}` : ''}`;
      })
      .join(' · ');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Programa semanal de producción"
        description={`Órdenes activas entre ${monday} y ${sunday}. La capacidad se coordina manualmente.`}
      />

      <Panel className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconButton
              label="Semana anterior"
              onClick={() => moveWeek(-1)}
              icon={ChevronLeft}
            />
            <span className="t-body font-semibold t-num text-ink px-1">
              {monday} → {sunday}
            </span>
            <IconButton
              label="Semana siguiente"
              onClick={() => moveWeek(1)}
              icon={ChevronRight}
            />
            <button
              type="button"
              onClick={() => setDay(todayIso)}
              className="ml-2 rounded px-2 py-1 t-micro text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors"
            >
              Semana actual
            </button>
          </div>

          <label className="flex items-center gap-2 t-micro font-medium text-ink-muted">
            Ir a fecha
            <input
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              className="rounded-lg border border-border bg-surface px-2.5 py-1 t-body t-num text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </label>
        </div>
      </Panel>

      {error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-4 t-body text-danger">
          {error}
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-label="Semana de producción">
          <Panel className="overflow-x-auto p-0">
            <div className="grid min-w-[840px] grid-cols-7 divide-x divide-border">
              {weekDays.map((weekDay) => {
                const dayOrders = orders.filter((order) => {
                  if (!order.fecha_inicio && !order.fecha_objetivo) return false;
                  return (
                    (order.fecha_inicio || order.fecha_objetivo || '') <= weekDay.iso &&
                    (order.fecha_objetivo || sunday) >= weekDay.iso
                  );
                });

                return (
                  <div key={weekDay.iso} className="min-h-[460px] flex flex-col">
                    <div
                      className={`border-b border-border p-3 text-center t-caption font-semibold capitalize ${
                        weekDay.isToday ? 'bg-accent/15 text-accent-strong border-b-accent' : 'bg-surface-muted text-ink'
                      }`}
                    >
                      <span>{weekDay.label}</span>
                      {weekDay.isToday && (
                        <span className="block t-micro text-accent-strong font-normal">Hoy</span>
                      )}
                    </div>
                    <div className="flex-1 space-y-2 p-2">
                      {dayOrders.map((order) => (
                        <Link
                          key={order.id}
                          href={`/ventas?oportunidad=${order.oportunidad_id}&tab=operacion`}
                          className="block rounded-lg border border-border bg-surface p-2.5 transition-colors hover:border-accent/40 hover:bg-surface-muted group"
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <CodeStamp>{order.oportunidad?.codigo || order.id.slice(0, 8)}</CodeStamp>
                            <StatusBadge tone={tonoEstado(order.estado)}>
                              {order.estado.replaceAll('_', ' ')}
                            </StatusBadge>
                          </div>
                          <span className="block line-clamp-2 t-caption font-medium text-ink group-hover:text-accent">
                            {order.oportunidad?.titulo || 'Sin título'}
                          </span>
                        </Link>
                      ))}
                      {!dayOrders.length && (
                        <p className="pt-6 text-center t-micro text-ink-muted">Sin órdenes</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </section>

        <aside className="space-y-4">
          <Panel className="p-4">
            <div className="flex items-center gap-2">
              <Factory size={16} className="text-accent" />
              <h2 className="t-body font-semibold text-ink">Órdenes activas</h2>
            </div>
            <p className="mt-1 t-micro text-ink-muted t-num">{orders.length} en esta semana</p>

            <div className="mt-3 space-y-2">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/ventas?oportunidad=${order.oportunidad_id}&tab=operacion`}
                  className="block rounded-lg border border-border bg-surface p-2.5 transition-colors hover:border-border-strong hover:bg-surface-muted"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <CodeStamp>{order.oportunidad?.codigo || order.id.slice(0, 8)}</CodeStamp>
                    <StatusBadge tone={tonoEstado(order.estado)}>
                      {order.estado.replaceAll('_', ' ')}
                    </StatusBadge>
                  </div>
                  <span className="block truncate t-caption font-medium text-ink">
                    {order.oportunidad?.titulo}
                  </span>
                  <span className="mt-1 block t-micro text-ink-muted t-num">
                    {order.fecha_inicio || 'Sin inicio'} → {order.fecha_objetivo || 'Sin objetivo'}
                  </span>
                  {progress(order) ? (
                    <span className="mt-1 block t-micro text-ink-muted t-num">
                      {progress(order)}
                    </span>
                  ) : null}
                </Link>
              ))}
              {!orders.length && (
                <p className="py-2 text-center t-micro text-ink-muted">
                  No hay órdenes activas para esta semana.
                </p>
              )}
            </div>
          </Panel>

          {undated.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 flex items-start gap-2">
              <AlertTriangle size={15} className="text-warning-strong shrink-0 mt-0.5" />
              <p className="t-micro text-warning-strong">
                <span className="font-semibold t-num">{undated.length}</span> orden(es) sin fechas aparecen en la lista y requieren programación.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
