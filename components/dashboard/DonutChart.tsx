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
}

export function DonutChart({
  title,
  subtitle,
  icon: IconComponent,
  segments,
  centerLabel,
  centerValue,
  showAmountInLegend = true,
}: DonutChartProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const totalValue = segments.reduce((sum, s) => sum + s.value, 0);

  // SVG Geometry for Donut
  const size = 200;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let cumulativePercent = 0;

  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div>
          <h3 className="font-extrabold text-base text-[#363636] flex items-center gap-2">
            {IconComponent && (
              <div className="p-1.5 rounded-xl bg-orange-50 text-[#F7931F]">
                <IconComponent className="w-4 h-4" />
              </div>
            )}
            <span>{title}</span>
          </h3>
          {subtitle && (
            <p className="text-xs text-gray-500 font-medium mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {totalValue === 0 ? (
        <div className="h-44 flex items-center justify-center text-xs text-gray-400 italic">
          No hay datos registrados en este período.
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-6 py-1">
          {/* Donut SVG con Centro */}
          <div className="relative shrink-0 flex items-center justify-center">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
              {/* Círculo Base */}
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke="#f1f5f9"
                strokeWidth={strokeWidth}
              />

              {/* Segmentos de Donut */}
              {segments.map((seg) => {
                const percent = (seg.value / totalValue) * 100;
                const strokeDashoffset = circumference - (percent / 100) * circumference;
                const currentRotation = (cumulativePercent / 100) * 360;
                cumulativePercent += percent;

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
                    strokeDashoffset={strokeDashoffset}
                    transform={`rotate(${currentRotation} ${center} ${center})`}
                    className="transition-all duration-300 cursor-pointer"
                    onMouseEnter={() => setHoveredId(seg.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  />
                );
              })}
            </svg>

            {/* Centro Informativo */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                {centerLabel || 'Total'}
              </span>
              <span className="text-xl font-black text-[#363636] leading-tight">
                {centerValue || totalValue.toLocaleString('es-CL')}
              </span>
            </div>
          </div>

          {/* Leyenda y Desglose */}
          <div className="flex-1 w-full space-y-2.5 text-xs">
            {segments.map((seg) => {
              const pct = totalValue > 0 ? Math.round((seg.value / totalValue) * 100) : 0;
              const isHovered = hoveredId === seg.id;

              return (
                <div
                  key={seg.id}
                  onMouseEnter={() => setHoveredId(seg.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`p-2 rounded-xl transition cursor-pointer border ${
                    isHovered ? 'bg-gray-50 border-gray-300 shadow-xs' : 'border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="text-[#363636] truncate">{seg.label}</span>
                    </div>
                    <span className="text-gray-500 font-mono shrink-0 ml-2">{pct}%</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-gray-400 pl-5 pt-0.5">
                    <span>
                      {seg.value} {seg.sublabel || 'registros'}
                    </span>
                    {showAmountInLegend && seg.monto !== undefined && (
                      <span className="font-bold text-[#F7931F]">
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
