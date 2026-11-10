'use client';

import React, { useState } from 'react';
import { LucideIcon } from 'lucide-react';

export interface DonutSegment {
  id: string;
  label: string;
  value: number;
  monto?: number;
  color: string;
  sublabel?: string;
}

interface DonutChartProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  segments: DonutSegment[];
  centerLabel?: string;
  centerValue?: string;
  showAmountInLegend?: boolean;
  /** Versión baja, para apilar con otras tarjetas. */
  compact?: boolean;
  /** Con total 0 dibuja el anillo vacío y la leyenda en cero, en vez de un mensaje. */
  showEmpty?: boolean;
}

export function DonutChart({
  title,
  icon: IconComponent,
  segments,
  centerLabel,
  centerValue,
  showAmountInLegend = true,
  compact = false,
  showEmpty = false,
}: DonutChartProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const totalValue = segments.reduce((sum, s) => sum + s.value, 0);

  // SVG Geometry for Donut
  const size = compact ? 176 : 200;
  const strokeWidth = compact ? 22 : 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const segmentsWithGeometry = React.useMemo(() => {
    return segments.reduce<{
      items: (DonutSegment & { percent: number; strokeDashoffset: number; rotation: number })[];
      cumulative: number;
    }>(
      (acc, seg) => {
        const percent = totalValue > 0 ? (seg.value / totalValue) * 100 : 0;
        const strokeDashoffset = circumference - (percent / 100) * circumference;
        const rotation = (acc.cumulative / 100) * 360;
        return {
          cumulative: acc.cumulative + percent,
          items: [...acc.items, { ...seg, percent, strokeDashoffset, rotation }],
        };
      },
      { items: [], cumulative: 0 }
    ).items;
  }, [segments, totalValue, circumference]);

  return (
    <div className="flex h-full flex-col justify-between rounded-[20px] border border-line bg-surface p-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-1">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            {IconComponent && (
              <span className="grid h-7 w-7 place-items-center rounded-control bg-surface-muted text-accent-ink">
                <IconComponent className="h-4 w-4" aria-hidden />
              </span>
            )}
            <span>{title}</span>
          </h3>
        </div>
      </div>

      {totalValue === 0 && !showEmpty ? (
        <div className="flex h-44 items-center justify-center text-xs italic text-ink-muted">
          No hay datos registrados en este período.
        </div>
      ) : (
        <div className={`flex flex-col items-center sm:flex-row ${compact ? 'gap-5 pt-3' : 'gap-6 py-2'}`}>
          {/* Donut SVG con Centro */}
          <div className="relative flex shrink-0 items-center justify-center">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 transform">
              {/* Círculo Base */}
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke="var(--hg-surface-muted)"
                strokeWidth={strokeWidth}
              />

              {/* Segmentos de Donut */}
              {segmentsWithGeometry.map((seg) => {
                const isHovered = hoveredId === seg.id;

                return (
                  <circle
                    key={seg.id}
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={seg.strokeDashoffset}
                    transform={`rotate(${seg.rotation} ${center} ${center})`}
                    className="cursor-pointer transition-all duration-300"
                    onMouseEnter={() => setHoveredId(seg.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  />
                );
              })}
            </svg>

            {/* Centro Informativo */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
              <span className="t-micro font-medium uppercase text-ink-muted">
                {centerLabel || 'Total'}
              </span>
              <span className="t-figure text-ink">
                {centerValue || totalValue.toLocaleString('es-CL')}
              </span>
            </div>
          </div>

          {/* Leyenda y Desglose */}
          <div className={`w-full flex-1 text-xs ${compact ? 'space-y-1' : 'space-y-2'}`}>
            {segments.map((seg) => {
              const pct = totalValue > 0 ? Math.round((seg.value / totalValue) * 100) : 0;
              const isHovered = hoveredId === seg.id;

              return (
                <div
                  key={seg.id}
                  onMouseEnter={() => setHoveredId(seg.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`cursor-pointer rounded-control border p-2 transition ${
                    isHovered ? 'border-line bg-surface-muted' : 'border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between font-medium">
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="truncate text-ink">{seg.label}</span>
                    </div>
                    <span className="t-num shrink-0 text-ink-muted">{pct}%</span>
                  </div>

                  <div className="flex items-center justify-between pt-0.5 text-[11px] text-ink-muted">
                    <span>
                      {seg.value}{compact ? '' : ` ${seg.sublabel || 'registros'}`}
                    </span>
                    {showAmountInLegend && seg.monto !== undefined && (
                      <span className="t-num font-semibold text-accent-ink">
                        ${seg.monto.toLocaleString('es-CL')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
