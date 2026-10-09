'use client';

import React, { useState } from 'react';
import { TrendingUp, BarChart3, LineChart } from 'lucide-react';

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
}

export function SalesTimelineChart({
  dailyData,
  monthlyData,
  totalPeriodSales,
}: SalesTimelineChartProps) {
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('monthly');
  const [chartType, setChartType] = useState<'area' | 'bar'>('area');
  const [hoveredPoint, setHoveredPoint] = useState<TimelineDataPoint | null>(null);

  const currentData = viewMode === 'daily' ? dailyData : monthlyData;
  const maxMonto = Math.max(...currentData.map((d) => d.monto), 100000);

  // SVG dimensions
  const svgWidth = 650;
  const svgHeight = 220;
  const paddingLeft = 65;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 40;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  // Coordinate calculations
  const points = currentData.map((d, index) => {
    const x =
      currentData.length > 1
        ? paddingLeft + (index / (currentData.length - 1)) * chartWidth
        : paddingLeft + chartWidth / 2;
    const y = paddingTop + chartHeight - (d.monto / maxMonto) * chartHeight;
    return { ...d, x, y };
  });

  // Area path & Line path generator (Catmull-Rom / Smooth Spline)
  const generateSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 >= pts.length ? pts.length - 1 : i + 2];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
  };

  const linePath = generateSmoothPath(points);
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`
      : '';

  // Y-Axis Ticks (4 levels)
  const yTicks = [0, maxMonto * 0.33, maxMonto * 0.66, maxMonto];

  const formatShortMoney = (num: number) => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}k`;
    return `$${num}`;
  };

  return (
    <div className="space-y-4 rounded-panel border border-line bg-surface p-5">
      {/* Header con controles */}
      <div className="flex flex-col justify-between gap-3 border-b border-line-subtle pb-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-control bg-surface-muted text-accent-ink">
              <TrendingUp className="h-4 w-4" aria-hidden />
            </span>
            <h3 className="text-base font-semibold text-ink">
              Evolución de ventas
            </h3>
          </div>
          <p className="t-caption mt-0.5 text-ink-muted">
            Ingresos generados por cotizaciones aprobadas y contratos de venta
          </p>
        </div>

        {/* Botones de alternar vista */}
        <div className="flex items-center gap-2">
          {/* Selector Diario / Mensual */}
          <div className="inline-flex rounded-control border border-line bg-surface-muted p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewMode('daily')}
              className={`cursor-pointer rounded-control px-2.5 py-1 transition ${
                viewMode === 'daily'
                  ? 'bg-surface font-semibold text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Diarias
            </button>
            <button
              type="button"
              onClick={() => setViewMode('monthly')}
              className={`cursor-pointer rounded-control px-2.5 py-1 transition ${
                viewMode === 'monthly'
                  ? 'bg-surface font-semibold text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Mensuales
            </button>
          </div>

          {/* Selector Tipo Gráfico */}
          <div className="inline-flex rounded-control border border-line bg-surface-muted p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setChartType('area')}
              aria-label="Gráfico de área"
              className={`cursor-pointer rounded-control p-1.5 transition ${
                chartType === 'area'
                  ? 'bg-surface text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
              title="Gráfico de área"
            >
              <LineChart className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setChartType('bar')}
              aria-label="Gráfico de columnas"
              className={`cursor-pointer rounded-control p-1.5 transition ${
                chartType === 'bar'
                  ? 'bg-surface text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
              title="Gráfico de columnas"
            >
              <BarChart3 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Gráfico SVG Reactivo */}
      <div className="relative w-full overflow-hidden">
        {currentData.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-xs italic text-ink-muted">
            No hay registros de ventas en el período seleccionado.
          </div>
        ) : (
          <div className="relative">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="h-56 w-full select-none"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                {/* Gradiente corporativo Hormiglass con variables CSS */}
                <linearGradient id="hormiglassSalesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--hg-accent)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--hg-accent)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines Horizontales */}
              {yTicks.map((val, idx) => {
                const yPos = paddingTop + chartHeight - (val / maxMonto) * chartHeight;
                return (
                  <g key={idx}>
                    <line
                      x1={paddingLeft}
                      y1={yPos}
                      x2={svgWidth - paddingRight}
                      y2={yPos}
                      stroke="var(--hg-line)"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                    <text
                      x={paddingLeft - 10}
                      y={yPos + 4}
                      textAnchor="end"
                      fontSize="11"
                      fontWeight="500"
                      fill="var(--hg-text-soft)"
                      className="font-mono"
                    >
                      {formatShortMoney(val)}
                    </text>
                  </g>
                );
              })}

              {/* Modo Gráfico de Área */}
              {chartType === 'area' && (
                <>
                  <path d={areaPath} fill="url(#hormiglassSalesGrad)" />
                  <path
                    d={linePath}
                    fill="none"
                    stroke="var(--hg-accent)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {points.map((pt, idx) => (
                    <g key={idx}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={hoveredPoint?.dateKey === pt.dateKey ? 5 : 3.5}
                        fill="var(--hg-surface)"
                        stroke="var(--hg-accent)"
                        strokeWidth={hoveredPoint?.dateKey === pt.dateKey ? 2.5 : 1.5}
                        className="cursor-pointer transition-all duration-150"
                        onMouseEnter={() => {
                          setHoveredPoint(pt);
                        }}
                        onMouseLeave={() => {
                          setHoveredPoint(null);
                        }}
                      />
                    </g>
                  ))}
                </>
              )}

              {/* Modo Gráfico de Barras */}
              {chartType === 'bar' && (
                <g>
                  {points.map((pt, idx) => {
                    const barWidth = Math.max(14, Math.min(32, chartWidth / points.length - 8));
                    const barHeight = (pt.monto / maxMonto) * chartHeight;
                    const barX = pt.x - barWidth / 2;
                    const barY = paddingTop + chartHeight - barHeight;
                    const isHovered = hoveredPoint?.dateKey === pt.dateKey;

                    return (
                      <rect
                        key={idx}
                        x={barX}
                        y={barY}
                        width={barWidth}
                        height={Math.max(barHeight, 2)}
                        rx="4"
                        fill="var(--hg-accent)"
                        opacity={isHovered ? 1 : 0.85}
                        className="cursor-pointer transition-all duration-200"
                        onMouseEnter={() => {
                          setHoveredPoint(pt);
                        }}
                        onMouseLeave={() => {
                          setHoveredPoint(null);
                        }}
                      />
                    );
                  })}
                </g>
              )}

              {/* Etiquetas del Eje X */}
              {points.map((pt, idx) => {
                const shouldShow =
                  points.length <= 10 ||
                  idx === 0 ||
                  idx === points.length - 1 ||
                  idx % Math.ceil(points.length / 8) === 0;

                if (!shouldShow) return null;

                return (
                  <text
                    key={idx}
                    x={pt.x}
                    y={svgHeight - 12}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="500"
                    fill="var(--hg-text-soft)"
                  >
                    {pt.label}
                  </text>
                );
              })}
            </svg>

            {/* Tooltip interactivo flotante */}
            {hoveredPoint && (
              <div
                className="pointer-events-none absolute left-1/2 top-2 z-30 -translate-x-1/2 space-y-0.5 rounded-control border border-line bg-surface p-2.5 text-xs text-ink shadow-[var(--hg-shadow-popover)]"
              >
                <p className="t-micro text-ink-muted">
                  {hoveredPoint.fullDateLabel}
                </p>
                <p className="t-num text-sm font-semibold text-accent-ink">
                  ${hoveredPoint.monto.toLocaleString('es-CL')} CLP
                </p>
                <p className="t-micro font-medium text-ink-muted">
                  {hoveredPoint.count} {hoveredPoint.count === 1 ? 'venta' : 'ventas'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer con resumen */}
      <div className="flex items-center justify-between border-t border-line-subtle pt-2 text-xs">
        <span className="font-medium text-ink-muted">
          Total acumulado en el período:
        </span>
        <span className="t-num text-sm font-semibold text-ink">
          ${totalPeriodSales.toLocaleString('es-CL')} CLP
        </span>
      </div>
    </div>
  );
}
