'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Factory } from 'lucide-react';
import { createClient } from '../../../lib/supabase/client';
import type { OrdenProduccion, ProduccionDiaria } from '../../../lib/types';

type Fila = OrdenProduccion & { oportunidad?: { codigo: string; titulo: string } | null };

function mondayOf(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export default function SemanaProduccionPage() {
  const supabase = useMemo(() => createClient(), []);
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
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
    return { iso: date.toISOString().slice(0, 10), label: date.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) };
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
      const { data, error: queryError } = await supabase.from('ordenes_produccion').select('*, items:orden_produccion_items(*), oportunidad:oportunidades(codigo,titulo)')
        .neq('estado', 'cancelada')
        .or(`and(estado.neq.completada,fecha_inicio.lte.${sunday},fecha_objetivo.gte.${monday}),and(fecha_objetivo.gte.${monday},fecha_objetivo.lte.${sunday}),and(fecha_objetivo.is.null,fecha_inicio.lte.${sunday},estado.neq.completada),and(fecha_objetivo.is.null,fecha_inicio.is.null,estado.neq.completada)`)
        .order('fecha_objetivo', { nullsFirst: false });
      if (!active) return;
      if (queryError) setError(queryError.message);
      else {
        const rows = (data || []) as Fila[];
        const ids = rows.map((row) => row.id);
        const production = ids.length
          ? await supabase.from('produccion_diaria').select('*').in('orden_produccion_id', ids)
          : { data: [], error: null };
        if (!active) return;
        if (production.error) setError(production.error.message);
        else { setError(''); setOrders(rows); setDaily((production.data || []) as ProduccionDiaria[]); }
      }
    }
    void load();
    return () => { active = false; };
  }, [supabase, monday, sunday]);

  const progress = (order: Fila) => order.items?.map((item) => {
        const produced = daily.filter((row) => row.orden_produccion_id === order.id && row.cotizacion_item_id === item.cotizacion_item_id)
          .reduce((sum, row) => sum + Number(row.cantidad_producida), 0);
        return `${item.producto}: ${produced} / ${item.cantidad_objetivo}${item.unidad ? ` ${item.unidad}` : ''}`;
      }).join(' · ');

  return <div className="hg-page space-y-5">
    <div><p className="hg-overline">Calendarios / Producción</p><h1 className="text-2xl font-bold">Programa semanal de producción</h1><p className="mt-1 text-sm text-[#66716f]">Órdenes activas entre {monday} y {sunday}. La capacidad se coordina manualmente.</p></div>
    <div className="hg-panel flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="flex items-center gap-2"><button aria-label="Semana anterior" onClick={() => moveWeek(-1)} className="hg-button-secondary !min-h-8 !px-2"><ChevronLeft size={17} /></button><strong className="text-sm">{monday} → {sunday}</strong><button aria-label="Semana siguiente" onClick={() => moveWeek(1)} className="hg-button-secondary !min-h-8 !px-2"><ChevronRight size={17} /></button></div>
      <label className="text-xs font-semibold text-[#66716f]">Ir a fecha <input type="date" value={day} onChange={(event) => setDay(event.target.value)} className="hg-field ml-2 !inline-block !w-auto" /></label>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section className="hg-panel overflow-x-auto" aria-label="Semana de producción"><div className="grid min-w-[840px] grid-cols-7 divide-x divide-[#e5e7e4]">
        {weekDays.map((weekDay) => {
          const dayOrders = orders.filter((order) => {
            if (!order.fecha_inicio && !order.fecha_objetivo) return false;
            return (order.fecha_inicio || order.fecha_objetivo || '') <= weekDay.iso &&
              (order.fecha_objetivo || sunday) >= weekDay.iso;
          });
          return <div key={weekDay.iso} className="min-h-[460px]"><div className="border-b border-[#e5e7e4] bg-[#fafaf9] p-3 text-center text-xs font-bold capitalize">{weekDay.label}</div><div className="space-y-2 p-2">
            {dayOrders.map((order) => <Link key={order.id} href={`/ventas/${order.oportunidad_id}/operacion`} className="block rounded-xl border border-orange-200 bg-orange-50/60 p-2.5 text-xs hover:bg-orange-50">
              <span className="block truncate font-bold">{order.oportunidad?.codigo || order.id.slice(0, 8)}</span><span className="mt-1 block line-clamp-2">{order.oportunidad?.titulo}</span><span className="mt-2 block text-[11px] capitalize text-[#a65e24]">{order.estado.replaceAll('_', ' ')}</span>
            </Link>)}{!dayOrders.length && <p className="pt-5 text-center text-[11px] text-[#8a9390]">Sin órdenes</p>}
          </div></div>;
        })}
      </div></section>
      <aside className="space-y-4"><section className="hg-panel p-4"><div className="flex items-center gap-2"><Factory size={17} className="text-[#e87622]" /><h2 className="hg-section-title">Órdenes activas</h2></div><p className="mt-1 text-xs text-[#66716f]">{orders.length} en esta semana</p>
        <div className="mt-3 space-y-2">{orders.map((order) => <Link key={order.id} href={`/ventas/${order.oportunidad_id}/operacion`} className="block rounded-lg border border-[#e5e7e4] p-2.5 hover:bg-[#fafaf9]"><span className="block truncate text-xs font-bold">{order.oportunidad?.codigo || order.id.slice(0, 8)} · {order.oportunidad?.titulo}</span><span className="mt-1 block text-[11px] text-[#66716f]">{order.fecha_inicio || 'Inicio sin fecha'} → {order.fecha_objetivo || 'Objetivo sin fecha'}</span><span className="mt-1 block text-[11px] text-[#66716f]">{progress(order)}</span></Link>)}{!orders.length && <p className="text-xs text-[#66716f]">No hay órdenes activas para esta semana.</p>}</div>
      </section>{undated.length > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{undated.length} orden(es) sin fechas aparecen en la lista y requieren programación.</p>}</aside>
    </div>
  </div>;
}
