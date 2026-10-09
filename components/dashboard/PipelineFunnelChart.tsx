'use client';

import React from 'react';
import { Target } from 'lucide-react';

export interface FunnelStageData {
  stageId: string;
  label: string;
  count: number;
  nominalMonto: number;
  probabilidad: number;
  weightedMonto: number;
  color: string;
  bgColor: string;
}

interface PipelineFunnelChartProps {
  stages: FunnelStageData[];
  totalPipelineNominal: number;
  totalPipelineWeighted: number;
}

export function PipelineFunnelChart({
  stages,
  totalPipelineNominal,
  totalPipelineWeighted,
}: PipelineFunnelChartProps) {
  const maxNominal = Math.max(...stages.map((s) => s.nominalMonto), 1);

  return (
    <div className="space-y-5 rounded-panel border border-line bg-surface p-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 border-b border-line-subtle pb-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-control bg-surface-muted text-accent-ink">
              <Target className="h-4 w-4" aria-hidden />
            </span>
            <h3 className="text-base font-semibold text-ink">
              Proyecciones de venta en pipeline
            </h3>
          </div>
          <p className="t-caption mt-0.5 text-ink-muted">
            Valor nominal y proyección ponderada por probabilidad de cierre en cada etapa
          </p>
        </div>

        {/* Resumen Ponderado */}
        <div className="rounded-control border border-line bg-surface-muted px-3 py-1.5 text-right">
          <span className="t-micro block font-medium text-ink-muted">
            Proyección ponderada
          </span>
          <span className="t-num block text-sm font-semibold text-accent-ink">
            ${totalPipelineWeighted.toLocaleString('es-CL')}
          </span>
        </div>
      </div>

      {/* Embudo Visual / Funnel */}
      <div className="space-y-2.5 text-xs">
        {stages.map((st) => {
          const widthPercent =
            totalPipelineNominal > 0
              ? Math.max(12, Math.round((st.nominalMonto / maxNominal) * 100))
              : 12;

          return (
            <div
              key={st.stageId}
              className="space-y-1.5 rounded-control border border-line bg-surface-muted/60 p-3 transition hover:border-line"
            >
              <div className="flex items-center justify-between font-medium">
                <div className="flex items-center gap-2 truncate">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: st.color }}
                  />
                  <span className="truncate text-ink">{st.label}</span>
                  <span className="t-micro rounded-full border border-line bg-surface px-2 py-0.5 font-medium text-ink-muted">
                    {st.count} ops · {st.probabilidad}% prob.
                  </span>
                </div>

                <div className="text-right">
                  <span className="t-num block font-semibold text-ink">
                    ${st.nominalMonto.toLocaleString('es-CL')}
                  </span>
                  <span className="t-micro t-num block text-ink-muted">
                    Pond: ${st.weightedMonto.toLocaleString('es-CL')}
                  </span>
                </div>
              </div>

              {/* Barra Proporcional del Embudo */}
              <div className="flex h-2 w-full items-center overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${widthPercent}%`,
                    backgroundColor: st.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
