'use client';

import React from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';

/* Visualizaciones simples del panel operativo: cada una responde una pregunta distinta. */

const CARD = 'rounded-[20px] border border-line bg-surface p-6';

export const formatShortMoney = (num: number) => {
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (num >= 1_000) return `$${Math.round(num / 1_000)}k`;
  return `$${num}`;
};

export function CardTitle({ title, hint, href, hrefLabel }: { title: string; hint?: string; href?: string; hrefLabel?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      </div>
      {href && (
        <Link href={href} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-accent-ink hover:underline">
          {hrefLabel ?? 'Ver más'} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/* ---------- Columnas (una o dos series) ---------- */

export interface ColumnDatum { label: string; a: number; b?: number }

export function ColumnChart({
  title, hint, data, aLabel, bLabel, format = formatShortMoney, empty = 'Sin datos en este período.', compact = false, showEmpty = false, aClass = 'bg-accent', bClass = 'bg-success',
}: {
  title: string;
  hint?: string;
  data: ColumnDatum[];
  aLabel: string;
  bLabel?: string;
  format?: (n: number) => string;
  empty?: string;
  compact?: boolean;
  /** Dibuja las columnas en cero en vez del mensaje de vacío. */
  showEmpty?: boolean;
  /** Clases de color de cada serie (por defecto naranja y verde). */
  aClass?: string;
  bClass?: string;
}) {
  const max = Math.max(...data.flatMap((d) => [d.a, d.b ?? 0]), 1);
  const hasData = data.some((d) => d.a > 0 || (d.b ?? 0) > 0);
  return (
    <section className={clsx(CARD, 'h-full')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle title={title} hint={hint} />
        <div className="flex items-center gap-4 text-xs font-medium text-ink-muted">
          <span className="flex items-center gap-1.5"><span className={clsx('h-2.5 w-2.5 rounded-full', aClass)} />{aLabel}</span>
          {bLabel && <span className="flex items-center gap-1.5"><span className={clsx('h-2.5 w-2.5 rounded-full', bClass)} />{bLabel}</span>}
        </div>
      </div>
      {!hasData && !showEmpty ? (
        <p className="py-16 text-center text-sm text-ink-muted">{empty}</p>
      ) : (
        <div className={clsx('flex items-end gap-3 border-b border-line', compact ? 'mt-3 h-32' : 'mt-6 h-52')}>
          {data.map((d) => (
            <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <div className="flex flex-1 items-end justify-center gap-1.5">
                {[{ v: d.a, c: aClass, n: aLabel }, ...(bLabel ? [{ v: d.b ?? 0, c: bClass, n: bLabel }] : [])].map((bar) => (
                  <div key={bar.n} className="group relative flex h-full w-full max-w-9 flex-col justify-end" title={`${d.label} · ${bar.n}: ${format(bar.v)}`}>
                    <span className="mb-1 text-center text-[11px] font-semibold text-ink-muted opacity-0 transition group-hover:opacity-100 t-num">{format(bar.v)}</span>
                    <div className={clsx('w-full rounded-t-lg transition-all duration-500', bar.c)} style={{ height: `${Math.max(bar.v > 0 ? 3 : 0, (bar.v / max) * 85)}%` }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {(hasData || showEmpty) && (
        <div className="mt-2 flex gap-3">
          {data.map((d) => <span key={d.label} className="min-w-0 flex-1 truncate text-center text-[11px] text-ink-muted">{d.label}</span>)}
        </div>
      )}
    </section>
  );
}

/* ---------- Mapa de bloques (cuánto pesa cada parte) ---------- */

export interface TreemapDatum { id: string; label: string; value: number; sub?: string }

type Rect = { item: TreemapDatum; x: number; y: number; w: number; h: number };

function layoutTreemap(items: TreemapDatum[], x: number, y: number, w: number, h: number): Rect[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ item: items[0], x, y, w, h }];
  const total = items.reduce((s, i) => s + i.value, 0);
  let acc = 0;
  let split = 1;
  for (let i = 0; i < items.length - 1; i++) {
    acc += items[i].value;
    split = i + 1;
    if (acc >= total / 2) break;
  }
  const first = items.slice(0, split);
  const rest = items.slice(split);
  const ratio = first.reduce((s, i) => s + i.value, 0) / total;
  return w >= h
    ? [...layoutTreemap(first, x, y, w * ratio, h), ...layoutTreemap(rest, x + w * ratio, y, w * (1 - ratio), h)]
    : [...layoutTreemap(first, x, y, w, h * ratio), ...layoutTreemap(rest, x, y + h * ratio, w, h * (1 - ratio))];
}

const TREEMAP_TONES = ['bg-accent text-on-accent', 'bg-info-soft text-ink', 'bg-success-soft text-ink', 'bg-warning-soft text-ink', 'bg-accent-soft text-ink', 'bg-surface-muted text-ink'];

export function TreemapChart({
  title, hint, items, maxItems = 8, format = formatShortMoney, empty = 'Sin datos en este período.', showEmpty = false,
}: {
  title: string; hint?: string; items: TreemapDatum[]; maxItems?: number; format?: (n: number) => string; empty?: string; showEmpty?: boolean;
}) {
  const data = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value).slice(0, maxItems);
  const rects = layoutTreemap(data, 0, 0, 100, 100);
  return (
    <section className={clsx(CARD, 'h-full')}>
      <CardTitle title={title} hint={hint} />
      {data.length === 0 && showEmpty && items.length > 0 ? (
        <div className="mt-5 grid h-64 grid-cols-2 gap-1.5 sm:grid-cols-4">
          {items.slice(0, maxItems).map((i) => (
            <div key={i.id} className="flex flex-col justify-between rounded-xl border border-dashed border-line p-2.5">
              <span className="truncate text-xs font-semibold text-ink-muted">{i.label}</span>
              <span className="t-num text-sm font-bold text-ink-muted">{format(0)}</span>
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-muted">{empty}</p>
      ) : (
        <div className="relative mt-5 h-64 w-full">
          {rects.map((r, idx) => (
            <div key={r.item.id} className="absolute p-0.5" style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}>
              <div className={clsx('flex h-full w-full flex-col justify-between overflow-hidden rounded-xl p-2.5', TREEMAP_TONES[idx % TREEMAP_TONES.length])} title={`${r.item.label}: ${format(r.item.value)}${r.item.sub ? ` · ${r.item.sub}` : ''}`}>
                <span className="truncate text-xs font-semibold">{r.item.label}</span>
                {r.h > 22 && r.w > 14 && (
                  <span className="t-num text-sm font-bold leading-tight">
                    {format(r.item.value)}
                    {r.item.sub && r.h > 34 && <span className="block text-[11px] font-medium opacity-70">{r.item.sub}</span>}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- Etapas conectadas (dónde está cada obra) ---------- */

export interface StageDatum { id: string; label: string; count: number; monto?: number }

export function StageStepper({ title, hint, stages, href, hrefLabel }: { title: string; hint?: string; stages: StageDatum[]; href?: string; hrefLabel?: string }) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  return (
    <section className={CARD}>
      <CardTitle title={title} hint={hint} href={href} hrefLabel={hrefLabel} />
      <ol className="mt-8 grid grid-cols-2 gap-y-8 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr">
        {stages.map((s, i) => (
          <li key={s.id} className="relative flex flex-col items-center text-center">
            {i < stages.length - 1 && <span aria-hidden className="absolute left-1/2 top-7 hidden h-0.5 w-full bg-line lg:block" />}
            <span
              className={clsx(
                't-num relative z-10 grid place-items-center rounded-full border-2 text-lg font-bold',
                s.count > 0 ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-muted',
              )}
              style={{ width: 56 + Math.round((s.count / max) * 16), height: 56 + Math.round((s.count / max) * 16), marginTop: -Math.round((s.count / max) * 8) }}
            >
              {s.count}
            </span>
            <span className="mt-3 text-sm font-medium text-ink">{s.label}</span>
            {s.monto !== undefined && <span className="t-num mt-0.5 text-xs text-ink-muted">{formatShortMoney(s.monto)}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- Agenda de la semana ---------- */

export interface AgendaEvent { id: string; titulo: string; fecha: string; hora?: string | null; alerta?: boolean }

export function WeekAgenda({ title, hint, events, href, hrefLabel }: { title: string; hint?: string; events: AgendaEvent[]; href?: string; hrefLabel?: string }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { d, key, items: events.filter((e) => e.fecha === key) };
  });
  const total = days.reduce((s, d) => s + d.items.length, 0);
  return (
    <section className={CARD}>
      <CardTitle title={title} hint={hint} href={href} hrefLabel={hrefLabel} />
      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-7">
        {days.map(({ d, key, items }, i) => (
          <div key={key} className={clsx('min-h-28 rounded-xl border p-2.5', i === 0 ? 'border-accent-line bg-accent-soft/50' : 'border-line-subtle bg-surface-muted/40')}>
            <p className="text-[11px] font-semibold uppercase text-ink-muted">{d.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '')}</p>
            <p className={clsx('t-num text-lg font-bold', i === 0 ? 'text-accent-ink' : 'text-ink')}>{d.getDate()}</p>
            <ul className="mt-1.5 space-y-1">
              {items.slice(0, 3).map((e) => (
                <li key={e.id} className={clsx('truncate rounded-md px-1.5 py-1 text-[11px] font-medium', e.alerta ? 'bg-warning-soft text-warning' : 'bg-surface text-ink')} title={e.titulo}>
                  {e.hora ? `${e.hora.slice(0, 5)} ` : ''}{e.titulo}
                </li>
              ))}
              {items.length > 3 && <li className="text-[11px] font-semibold text-ink-muted">+{items.length - 3} más</li>}
            </ul>
          </div>
        ))}
      </div>
      {total === 0 && <p className="mt-4 text-center text-sm text-ink-muted">Sin eventos programados en los próximos 7 días.</p>}
    </section>
  );
}

/* ---------- Barra apilada (reparto de un total) ---------- */

export interface SegmentDatum { id: string; label: string; value: number; color: string }

export function StackedBar({ title, hint, segments, href, hrefLabel, empty = 'Sin casos abiertos.', showEmpty = false }: { title: string; hint?: string; segments: SegmentDatum[]; href?: string; hrefLabel?: string; empty?: string; showEmpty?: boolean }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <section className={clsx(CARD, 'h-full')}>
      <CardTitle title={title} hint={hint} href={href} hrefLabel={hrefLabel} />
      {total === 0 && !showEmpty ? (
        <p className="py-10 text-center text-sm text-ink-muted">{empty}</p>
      ) : (
        <>
          <p className="t-num mt-4 text-3xl font-bold text-ink">{total}</p>
          <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-surface-muted">
            {segments.filter((s) => s.value > 0).map((s) => (
              <div key={s.id} className={clsx('h-full transition-all duration-500', s.color)} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} />
            ))}
          </div>
          <ul className="mt-5 space-y-2.5">
            {segments.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-ink"><span className={clsx('h-2.5 w-2.5 rounded-full', s.color)} />{s.label}</span>
                <span className="t-num font-bold text-ink">{s.value}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* ---------- Medidor circular (qué parte del total se logró) ---------- */

export function RadialGauge({
  title, hint, percent, centerLabel, rows,
}: {
  title: string; hint?: string; percent: number; centerLabel: string; rows: { label: string; value: string; dot: string }[];
}) {
  const p = Math.max(0, Math.min(100, percent));
  const r = 70;
  const c = 2 * Math.PI * r;
  return (
    <section className={clsx(CARD, 'h-full')}>
      <CardTitle title={title} hint={hint} />
      <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
        <div className="relative h-44 w-44 shrink-0">
          <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90" role="img" aria-label={`${p}% ${centerLabel}`}>
            <circle cx="90" cy="90" r={r} fill="none" stroke="var(--hg-surface-muted)" strokeWidth="16" />
            <circle cx="90" cy="90" r={r} fill="none" stroke="var(--hg-success)" strokeWidth="16" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (p / 100) * c} className="transition-all duration-700" />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="t-num text-3xl font-bold text-ink">{p}%</p>
              <p className="text-xs font-medium text-ink-muted">{centerLabel}</p>
            </div>
          </div>
        </div>
        <ul className="w-full max-w-60 space-y-3">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-ink-muted"><span className={clsx('h-2.5 w-2.5 rounded-full', row.dot)} />{row.label}</span>
              <span className="t-num font-bold text-ink">{row.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Lista con barra de avance (quién debe cuánto) ---------- */

export interface ProgressRow { id: string; title: string; sub?: string; total: number; done: number; href?: string }

export function ProgressList({ title, hint, rows, href, hrefLabel, empty = 'Sin saldos pendientes.' }: { title: string; hint?: string; rows: ProgressRow[]; href?: string; hrefLabel?: string; empty?: string }) {
  return (
    <section className={clsx(CARD, 'h-full')}>
      <CardTitle title={title} hint={hint} href={href} hrefLabel={hrefLabel} />
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="mt-5 space-y-5">
          {rows.map((row) => {
            const pct = row.total > 0 ? Math.min(100, Math.round((row.done / row.total) * 100)) : 0;
            const body = (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{row.title}</span>
                    {row.sub && <span className="block truncate text-xs text-ink-muted">{row.sub}</span>}
                  </span>
                  <span className="t-num shrink-0 text-sm font-bold text-ink">{formatShortMoney(Math.max(0, row.total - row.done))}</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="t-num w-20 shrink-0 text-right text-xs text-ink-muted">{pct}% cobrado</span>
                </div>
              </>
            );
            return <li key={row.id}>{row.href ? <Link href={row.href} className="block hover:opacity-80">{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </section>
  );
}
