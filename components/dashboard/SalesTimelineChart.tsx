'use client';

import React, { useState } from 'react';
import clsx from 'clsx';

export interface TimelineDataPoint {
  dateKey: string;
  label: string;
  fullDateLabel: string;
  monto: number;
  count: number;
}

interface SalesTimelineChartProps {
  dailyData: TimelineDataPoint[];
  monthlyData: TimelineDataPoint[];
  totalPeriodSales: number;
  /** Se conservan por compatibilidad; los totales viven en las tarjetas superiores. */
  totalDealsClosed?: number;
  averageDealSize?: number;
}

const formatShortMoney = (num: number) => {
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}k`;
  return `$${num}`;
};

/** Ingresos en el tiempo: una sola serie, un total y un selector Días / Meses. */
export function SalesTimelineChart({ dailyData, monthlyData }: SalesTimelineChartProps) {
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [hovered, setHovered] = useState<number | null>(null);

  const data = viewMode === 'daily' ? dailyData : monthlyData;
  const maxMonto = Math.max(...data.map((d) => d.monto), 100000);
  const totalShown = data.reduce((sum, d) => sum + d.monto, 0);

  const W = 720;
  const H = 260;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 34;
  const cw = W - padL - padR;
  const ch = H - padT - padB;

  const points = data.map((d, i) => ({
    ...d,
    x: data.length > 1 ? padL + (i / (data.length - 1)) * cw : padL + cw / 2,
    y: padT + ch - (d.monto / maxMonto) * ch,
  }));

  const smooth = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      path += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
    }
    return path;
  };

  const line = smooth(points);
  const area = points.length > 0 ? `${line} L ${points[points.length - 1].x} ${padT + ch} L ${points[0].x} ${padT + ch} Z` : '';
  const ticks = [0, 0.5, 1].map((f) => maxMonto * f);
  const step = Math.ceil(points.length / 7);
  const active = hovered !== null ? points[hovered] : null;

  return (
    <section className="h-full rounded-[20px] border border-line bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">Ventas en el tiempo</h3>
          <p className="mt-1 text-2xl font-bold tracking-tight text-ink t-num">${totalShown.toLocaleString('es-CL')}</p>
          <p className="text-xs text-ink-muted">{viewMode === 'daily' ? 'últimos 14 días' : 'últimos 6 meses'}</p>
        </div>
        <div className="inline-flex rounded-full border border-line bg-surface-muted p-0.5 text-xs font-semibold">
          {(['daily', 'monthly'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => { setViewMode(mode); setHovered(null); }}
              className={clsx('cursor-pointer rounded-full px-3.5 py-1.5 transition', viewMode === mode ? 'bg-accent text-on-accent' : 'text-ink-muted hover:text-ink')}
            >
              {mode === 'daily' ? 'Días' : 'Meses'}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-5">
        {data.length === 0 ? (
          <div className="grid h-[220px] place-items-center text-sm text-ink-muted">Sin ventas registradas en este rango.</div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none overflow-visible" role="img" aria-label="Gráfico de ventas en el tiempo">
            <defs>
              <linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--hg-accent)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--hg-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((val, i) => {
              const y = padT + ch - (val / maxMonto) * ch;
              return (
                <g key={i}>
                  <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--hg-line)" strokeDasharray={i === 0 ? undefined : '3 4'} />
                  <text x={padL - 10} y={y + 4} textAnchor="end" className="t-micro" style={{ fill: 'var(--hg-ink-muted)' }}>{formatShortMoney(val)}</text>
                </g>
              );
            })}
            <path d={area} fill="url(#salesArea)" />
            <path d={line} fill="none" stroke="var(--hg-accent)" strokeWidth="2.5" strokeLinecap="round" />
            {points.map((pt, i) => (
              <g key={pt.dateKey} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
                <rect x={pt.x - cw / points.length / 2} y={padT} width={Math.max(cw / points.length, 8)} height={ch} fill="transparent" />
                {(hovered === i || points.length <= 12) && (
                  <circle cx={pt.x} cy={pt.y} r={hovered === i ? 5 : 3.5} fill="var(--hg-surface)" stroke="var(--hg-accent)" strokeWidth="2" />
                )}
              </g>
            ))}
            {points.map((pt, i) => (i % step === 0 || i === points.length - 1) && (
              <text key={`l${i}`} x={pt.x} y={H - 10} textAnchor="middle" className="t-micro" style={{ fill: 'var(--hg-ink-muted)' }}>{pt.label}</text>
            ))}
          </svg>
        )}
        {active && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-center text-xs text-surface shadow-md"
            style={{ left: `${(active.x / W) * 100}%`, top: `${Math.max(0, (active.y / H) * 100 - 22)}%` }}
          >
            <p className="font-bold t-num">${active.monto.toLocaleString('es-CL')}</p>
            <p className="opacity-70">{active.fullDateLabel}</p>
          </div>
        )}
      </div>
    </section>
  );
}
