'use client';

import React, { useState } from 'react';
import { TrendingUp, Calendar, BarChart3, LineChart } from 'lucide-react';

export interface TimelineDataPoint {
  dateKey: string; // "2026-08-21" or "2026-08"
  label: string; // "21 Ago" or "Ago 2026"
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
    <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
      {/* Header con controles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-orange-50 text-[#F7931F]">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h3 className="font-extrabold text-base text-[#363636]">
              Evolución de ventas
            </h3>
          </div>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Ingresos generados por cotizaciones aprobadas y contratos de venta
          </p>
        </div>

        {/* Botones de alternar vista */}
        <div className="flex items-center gap-2">
          {/* Selector Diario / Mensual */}
          <div className="inline-flex bg-gray-100 p-1 rounded-xl text-xs font-bold text-gray-600">
            <button
              type="button"
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                viewMode === 'daily'
                  ? 'bg-white text-[#F7931F] shadow-xs font-black'
                  : 'hover:text-[#363636]'
              }`}
            >
              Diarias
            </button>
            <button
              type="button"
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                viewMode === 'monthly'
                  ? 'bg-white text-[#F7931F] shadow-xs font-black'
                  : 'hover:text-[#363636]'
              }`}
            >
              Mensuales
            </button>
          </div>

          {/* Selector Tipo Gráfico (Curva / Barras) */}
          <div className="inline-flex bg-gray-100 p-1 rounded-xl text-xs font-bold text-gray-600">
            <button
              type="button"
              onClick={() => setChartType('area')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                chartType === 'area'
                  ? 'bg-white text-[#F7931F] shadow-xs'
                  : 'hover:text-[#363636]'
              }`}
              title="Gráfico de área"
            >
              <LineChart className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setChartType('bar')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                chartType === 'bar'
                  ? 'bg-white text-[#F7931F] shadow-xs'
                  : 'hover:text-[#363636]'
              }`}
              title="Gráfico de columnas"
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Gráfico SVG Reactivo */}
      <div className="relative w-full overflow-hidden">
        {currentData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-xs text-gray-400 italic">
            No hay registros de ventas en el período seleccionado.
          </div>
        ) : (
          <div className="relative">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-56 select-none"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                {/* Gradiente corporativo Hormiglass */}
                <linearGradient id="hormiglassSalesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F7931F" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#F7931F" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="hormiglassBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F7931F" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#d97706" stopOpacity="0.75" />
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
                      stroke="#f1f5f9"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                    <text
                      x={paddingLeft - 10}
                      y={yPos + 4}
                      textAnchor="end"
                      fontSize="10"
                      fontWeight="bold"
                      fill="#94a3b8"
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
                    stroke="#F7931F"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {points.map((pt, idx) => (
                    <g key={idx}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={hoveredPoint?.dateKey === pt.dateKey ? 6 : 4}
                        fill="#ffffff"
                        stroke="#F7931F"
                        strokeWidth={hoveredPoint?.dateKey === pt.dateKey ? 3 : 2}
                        className="transition-all duration-150 cursor-pointer"
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
                        rx="6"
                        fill={isHovered ? '#ea580c' : 'url(#hormiglassBarGrad)'}
                        className="transition-all duration-200 cursor-pointer"
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
                    fontSize="10"
                    fontWeight="bold"
                    fill="#64748b"
                  >
                    {pt.label}
                  </text>
                );
              })}
            </svg>

            {/* Tooltip interactivo flotante */}
            {hoveredPoint && (
              <div
                className="absolute top-2 left-1/2 -translate-x-1/2 bg-[#363636] text-white px-3.5 py-2 rounded-2xl shadow-xl text-xs space-y-0.5 pointer-events-none z-30 animate-fadeIn"
              >
                <p className="font-semibold text-gray-300 text-[10px]">
                  {hoveredPoint.fullDateLabel}
                </p>
                <p className="text-sm font-black text-[#F7931F]">
                  ${hoveredPoint.monto.toLocaleString('es-CL')} CLP
                </p>
                <p className="text-[10px] text-gray-300 font-medium">
                  {hoveredPoint.count} {hoveredPoint.count === 1 ? 'venta' : 'ventas'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer con resumen */}
      <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-100">
        <span className="text-gray-500 font-semibold">
          Total acumulado en el período:
        </span>
        <span className="font-black text-[#363636] text-sm">
          ${totalPeriodSales.toLocaleString('es-CL')} CLP
        </span>
      </div>
    </div>
  );
}
