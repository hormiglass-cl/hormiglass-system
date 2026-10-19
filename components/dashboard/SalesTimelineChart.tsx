'use client';

import React, { useState } from 'react';
import { TrendingUp, BarChart3, LineChart, Calendar } from 'lucide-react';
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
  totalDealsClosed?: number;
  averageDealSize?: number;
  revenueTrend?: { value: string; trend: 'up' | 'down' | 'neutral' };
  dealsTrend?: { value: string; trend: 'up' | 'down' | 'neutral' };
  averageTrend?: { value: string; trend: 'up' | 'down' | 'neutral' };
}

export function SalesTimelineChart({
  dailyData,
  monthlyData,
  totalPeriodSales,
  totalDealsClosed,
  averageDealSize,
  revenueTrend = { value: '+20.4% vs mes anterior', trend: 'up' },
  dealsTrend = { value: '+18.7% vs mes anterior', trend: 'up' },
  averageTrend = { value: '+10.3% vs mes anterior', trend: 'up' },
}: SalesTimelineChartProps) {
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [chartType, setChartType] = useState<'area' | 'bar'>('area');
  const [hoveredPoint, setHoveredPoint] = useState<TimelineDataPoint | null>(null);

  const currentData = viewMode === 'daily' ? dailyData : monthlyData;
  const maxMonto = Math.max(...currentData.map((d) => d.monto), 100000);
  const maxCount = Math.max(...currentData.map((d) => d.count), 1);

  // SVG dimensions
  const svgWidth = 650;
  const svgHeight = 220;
  const paddingLeft = 65;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 40;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  // Coordinate calculations para monto (serie principal azul)
  const points = currentData.map((d, index) => {
    const x =
      currentData.length > 1
        ? paddingLeft + (index / (currentData.length - 1)) * chartWidth
        : paddingLeft + chartWidth / 2;
    const y = paddingTop + chartHeight - (d.monto / maxMonto) * chartHeight;
    const yCount = paddingTop + chartHeight - (d.count / maxCount) * chartHeight;
    return { ...d, x, y, yCount };
  });

  // Smooth spline generator
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

  const linePath = generateSmoothPath(points.map((p) => ({ x: p.x, y: p.y })));
  const dealsLinePath = generateSmoothPath(points.map((p) => ({ x: p.x, y: p.yCount })));
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

  const calculatedDealsClosed = totalDealsClosed ?? currentData.reduce((acc, d) => acc + d.count, 0);
  const calculatedAverageDeal = averageDealSize ?? (calculatedDealsClosed > 0 ? Math.round(totalPeriodSales / calculatedDealsClosed) : 0);

  return (
    <div className="space-y-4 rounded-panel border border-line bg-surface p-5 shadow-xs">
      {/* Header con controles de filtro y leyenda de series */}
      <div className="flex flex-col justify-between gap-3 border-b border-line pb-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-control bg-accent-soft text-accent-ink">
              <TrendingUp className="h-4 w-4" aria-hidden />
            </span>
            <h3 className="text-base font-semibold text-ink">
              Evolución de ventas
            </h3>
          </div>
          <p className="t-caption mt-0.5 text-ink-muted">
            Ingresos generados por contratos y volumen de negocios cerrados
          </p>
        </div>

        {/* Leyenda y Selector de Período */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Leyenda Multi-Serie */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-ink">
              <span className="h-2 w-4 rounded-full bg-accent" />
              <span>Ingresos</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-ink-muted">
              <span className="h-2 w-4 rounded-full bg-ink-muted/50" />
              <span>Negocios</span>
            </div>
          </div>

          {/* Selector Diario / Mensual */}
          <div className="inline-flex rounded-control border border-line bg-surface-muted p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewMode('daily')}
              className={clsx(
                'cursor-pointer rounded-control px-2.5 py-1 transition',
                viewMode === 'daily'
                  ? 'bg-surface font-semibold text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              )}
            >
              Días
            </button>
            <button
              type="button"
              onClick={() => setViewMode('monthly')}
              className={clsx(
                'cursor-pointer rounded-control px-2.5 py-1 transition',
                viewMode === 'monthly'
                  ? 'bg-surface font-semibold text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              )}
            >
              Meses
            </button>
          </div>

          {/* Selector Tipo Gráfico */}
          <div className="inline-flex rounded-control border border-line bg-surface-muted p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setChartType('area')}
              aria-label="Gráfico de línea / área"
              className={clsx(
                'cursor-pointer rounded-control p-1.5 transition',
                chartType === 'area'
                  ? 'bg-surface text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              )}
              title="Gráfico de área"
            >
              <LineChart className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setChartType('bar')}
              aria-label="Histograma de barras"
              className={clsx(
                'cursor-pointer rounded-control p-1.5 transition',
                chartType === 'bar'
                  ? 'bg-surface text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              )}
              title="Histograma de barras"
            >
              <BarChart3 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Área del Gráfico SVG */}
      <div className="relative w-full overflow-hidden">
        {currentData.length === 0 ? (
          <div className="grid h-[220px] place-items-center text-xs text-ink-muted">
            Sin movimientos registrados para el rango seleccionado.
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto max-h-[260px] overflow-visible select-none"
          >
            <defs>
              <linearGradient id="salesAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--hg-accent)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--hg-accent)" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Líneas de cuadrícula horizontal Y */}
            {yTicks.map((val, idx) => {
              const y = paddingTop + chartHeight - (val / maxMonto) * chartHeight;
              return (
                <g key={idx} className="transition-opacity">
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={svgWidth - paddingRight}
                    y2={y}
                    stroke="var(--hg-line)"
                    strokeDasharray={idx === 0 ? 'none' : '3 3'}
                    strokeWidth="1"
                  />
                  <text
                    x={paddingLeft - 10}
                    y={y + 3}
                    textAnchor="end"
                    className="t-micro fill-current"
                    style={{ fill: 'var(--hg-ink-muted)' }}
                  >
                    {formatShortMoney(val)}
                  </text>
                </g>
              );
            })}

            {chartType === 'area' ? (
              <>
                {/* Relleno degradado del área */}
                <path d={areaPath} fill="url(#salesAreaGradient)" />

                {/* Serie secundaria: Negocios / Cotizaciones (Línea gris punteada) */}
                <path
                  d={dealsLinePath}
                  fill="none"
                  stroke="var(--hg-ink-muted)"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  className="transition-all duration-300 opacity-60"
                />

                {/* Serie principal: Ingresos (Línea azul acento continua) */}
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--hg-accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />

                {/* Puntos de datos */}
                {points.map((pt, idx) => {
                  const isHovered = hoveredPoint?.dateKey === pt.dateKey;
                  return (
                    <g key={idx}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isHovered ? 5.5 : 3.5}
                        fill="var(--hg-surface)"
                        stroke="var(--hg-accent)"
                        strokeWidth={isHovered ? 2.5 : 1.5}
                        className="cursor-pointer transition-all duration-150"
                        onMouseEnter={() => setHoveredPoint(pt)}
                        onMouseLeave={() => setHoveredPoint(null)}
                      />
                    </g>
                  );
                })}
              </>
            ) : (
              /* Histograma de Columnas */
              points.map((pt, idx) => {
                const barWidth = Math.min(28, (chartWidth / points.length) * 0.65);
                const barHeight = chartHeight - (pt.y - paddingTop);
                const isHovered = hoveredPoint?.dateKey === pt.dateKey;

                return (
                  <rect
                    key={idx}
                    x={pt.x - barWidth / 2}
                    y={pt.y}
                    width={barWidth}
                    height={Math.max(barHeight, 2)}
                    rx={3}
                    fill={isHovered ? 'var(--hg-accent)' : 'var(--hg-accent)'}
                    fillOpacity={isHovered ? 0.95 : 0.6}
                    className="cursor-pointer transition-all duration-150"
                    onMouseEnter={() => setHoveredPoint(pt)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                );
              })
            )}

            {/* Etiquetas del eje X */}
            {points.map((pt, idx) => {
              const showEvery = Math.ceil(points.length / 8);
              if (idx % showEvery !== 0 && idx !== points.length - 1) return null;

              return (
                <text
                  key={idx}
                  x={pt.x}
                  y={paddingTop + chartHeight + 20}
                  textAnchor="middle"
                  className="t-micro"
                  style={{ fill: 'var(--hg-ink-muted)' }}
                >
                  {pt.label}
                </text>
              );
            })}
          </svg>
        )}

        {/* Tooltip flotante al pasar el mouse */}
        {hoveredPoint && (
          <div
            className="absolute z-20 pointer-events-none rounded-control border border-line bg-surface p-2.5 text-xs shadow-md"
            style={{
              left: `${Math.min(svgWidth - 140, Math.max(10, (hoveredPoint as any).x || 10))}px`,
              top: '10px',
            }}
          >
            <p className="font-semibold text-ink">{hoveredPoint.fullDateLabel}</p>
            <div className="mt-1 space-y-0.5 text-[11px]">
              <p className="text-accent-ink font-bold">
                ${hoveredPoint.monto.toLocaleString('es-CL')} recaudados
              </p>
              <p className="text-ink-muted">
                {hoveredPoint.count} negocio(s) cerrados
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3 Métricas Resumen Inferiores estilo Imagen de Referencia */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-line pt-4">
        {/* Total Revenue */}
        <div className="rounded-control border border-line bg-surface-muted/60 p-3">
          <span className="t-micro block text-ink-muted font-medium">Ingresos Totales</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-base sm:text-lg font-bold text-ink t-num">
              ${totalPeriodSales.toLocaleString('es-CL')}
            </span>
            <span className="t-micro font-semibold text-success bg-success-soft px-1.5 py-0.5 rounded-full">
              {revenueTrend.value}
            </span>
          </div>
        </div>

        {/* Deals Closed */}
        <div className="rounded-control border border-line bg-surface-muted/60 p-3">
          <span className="t-micro block text-ink-muted font-medium">Ventas Cerradas</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-base sm:text-lg font-bold text-ink t-num">
              {calculatedDealsClosed}
            </span>
            <span className="t-micro font-semibold text-success bg-success-soft px-1.5 py-0.5 rounded-full">
              {dealsTrend.value}
            </span>
          </div>
        </div>

        {/* Average Deal Size */}
        <div className="rounded-control border border-line bg-surface-muted/60 p-3">
          <span className="t-micro block text-ink-muted font-medium">Ticket Promedio</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-base sm:text-lg font-bold text-ink t-num">
              ${calculatedAverageDeal.toLocaleString('es-CL')}
            </span>
            <span className="t-micro font-semibold text-success bg-success-soft px-1.5 py-0.5 rounded-full">
              {averageTrend.value}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
