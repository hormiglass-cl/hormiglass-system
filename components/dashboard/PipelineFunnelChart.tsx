'use client';

import React, { useState } from 'react';
import { Target, ArrowDownRight, Filter } from 'lucide-react';
import clsx from 'clsx';

export interface FunnelStageData {
  stageId: string;
  label: string;
  count: number;
  nominalMonto: number;
  probabilidad: number;
  weightedMonto: number;
  color: string;
  bgColor?: string;
  branch?: 'comercial' | 'produccion' | 'reventa' | 'todas';
}

interface PipelineFunnelChartProps {
  stages: FunnelStageData[];
  totalPipelineNominal: number;
  totalPipelineWeighted: number;
  onSelectStage?: (stageId: string) => void;
}

export function PipelineFunnelChart({
  stages,
  totalPipelineNominal,
  totalPipelineWeighted,
  onSelectStage,
}: PipelineFunnelChartProps) {
  const [filterBranch, setFilterBranch] = useState<'todas' | 'produccion' | 'reventa'>('todas');

  // Filtrar si se especifica rama
  const filteredStages = stages.filter((st) => {
    if (filterBranch === 'todas') return true;
    if (!st.branch) return true;
    return st.branch === filterBranch || st.branch === 'todas';
  });

  const maxStageCount = Math.max(...filteredStages.map((s) => s.count), 1);

  // Colores de barra según nivel
  const barColors = [
    'bg-accent',
    'bg-info',
    'bg-success',
    'bg-warning',
    'bg-accent',
    'bg-success',
    'bg-ink-muted',
  ];

  return (
    <div className="h-full flex flex-col justify-between rounded-panel border border-line bg-surface p-5 shadow-xs">
      <div>
        {/* Header con título y selector de pipeline */}
        <div className="flex flex-col justify-between gap-3 border-b border-line pb-3 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-control bg-accent-soft text-accent-ink">
                <Target className="h-4 w-4" aria-hidden />
              </span>
              <h3 className="text-base font-semibold text-ink">
                Embudo de ventas
              </h3>
            </div>
            <p className="t-caption mt-0.5 text-ink-muted">
              Tasas de conversión y etapas donde se concentran o caen los prospectos
            </p>
          </div>

          {/* Selector de Pipeline */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-control border border-line bg-surface-muted px-2.5 py-1 text-xs text-ink-muted">
              <Filter size={13} className="text-ink-subtle" />
              <select
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value as any)}
                className="bg-transparent font-medium text-ink focus:outline-none cursor-pointer"
                aria-label="Filtrar embudo por tipo de flujo"
              >
                <option value="todas">Todos los flujos</option>
                <option value="produccion">Solo Producción</option>
                <option value="reventa">Solo Reventa</option>
              </select>
            </div>
          </div>
        </div>

        {/* Embudo Visual de Ancho Completo sin Espacio Muerto */}
        <div className="mt-4 space-y-2.5">
          {filteredStages.map((stage, idx) => {
            const barFillColor = barColors[idx % barColors.length];
            const barWidth = Math.max(12, Math.round((stage.count / maxStageCount) * 100));

            // Cálculo de caída respecto a la etapa previa
            const prevStage = idx > 0 ? filteredStages[idx - 1] : null;
            let dropOffPercent: number | null = null;
            let conversionPercent: number | null = null;

            if (prevStage && prevStage.count > 0) {
              conversionPercent = Math.min(100, Math.round((stage.count / prevStage.count) * 100));
              dropOffPercent = Math.max(0, 100 - conversionPercent);
            }

            return (
              <div
                key={stage.stageId}
                onClick={() => onSelectStage?.(stage.stageId)}
                className="group relative cursor-pointer"
                title={`${stage.label}: ${stage.count} oportunidades, $${stage.nominalMonto.toLocaleString('es-CL')}`}
              >
                <div className="relative flex items-center justify-between rounded-control border border-line bg-surface-muted/50 p-2.5 sm:p-3 transition-all duration-200 hover:border-accent hover:shadow-xs overflow-hidden">
                  {/* Barra de progreso proporcional */}
                  <div
                    style={{ width: `${barWidth}%` }}
                    className={clsx(
                      'absolute left-0 top-0 bottom-0 rounded-control transition-all duration-500 opacity-20',
                      barFillColor
                    )}
                  />

                  {/* Info izquierda: Paso, Nombre de etapa y Conteo */}
                  <div className="relative z-10 flex items-center gap-2.5 min-w-0 pr-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface border border-line font-mono text-[11px] font-bold text-ink-muted">
                      {idx + 1}
                    </span>
                    <span className="truncate text-xs font-semibold text-ink group-hover:text-accent-ink transition">
                      {stage.label}
                    </span>
                    <span className="rounded-full bg-surface/90 border border-line px-2 py-0.5 t-micro font-bold text-ink t-num shrink-0">
                      {stage.count} {stage.count === 1 ? 'op.' : 'ops.'}
                    </span>
                  </div>

                  {/* Info derecha: Caída / Conversión, Monto y Probabilidad */}
                  <div className="relative z-10 flex items-center gap-3 shrink-0 text-right">
                    {idx > 0 && dropOffPercent !== null && (
                      <span
                        className={clsx(
                          'hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 t-micro font-semibold border',
                          dropOffPercent >= 35
                            ? 'bg-danger-soft text-danger border-danger-line'
                            : 'bg-surface text-ink-muted border-line'
                        )}
                        title={`De la etapa anterior pasaron ${conversionPercent}%, cayeron ${dropOffPercent}%`}
                      >
                        {dropOffPercent > 0 ? (
                          <>
                            <ArrowDownRight size={11} />
                            <span>{dropOffPercent}% caída</span>
                          </>
                        ) : (
                          <span>100% conv.</span>
                        )}
                      </span>
                    )}

                    <div>
                      <span className="t-num block text-xs font-bold text-ink">
                        ${stage.nominalMonto.toLocaleString('es-CL')}
                      </span>
                      <span className="t-micro text-ink-muted block font-mono">
                        {stage.probabilidad}% prob.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Resumen: Total Pipeline Value */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-line pt-3 text-xs">
        <div>
          <span className="text-ink-muted">Proyección ponderada: </span>
          <span className="font-semibold text-accent-ink">
            ${totalPipelineWeighted.toLocaleString('es-CL')}
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="font-medium text-ink-muted">Valor Total en Pipeline:</span>
          <span className="text-base sm:text-lg font-bold text-ink t-num">
            ${totalPipelineNominal.toLocaleString('es-CL')}
          </span>
        </div>
      </div>
    </div>
  );
}
