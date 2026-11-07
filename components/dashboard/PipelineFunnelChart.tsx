'use client';

import React from 'react';

export interface FunnelStageData {
  stageId: string;
  label: string;
  count: number;
  nominalMonto: number;
  probabilidad: number;
  weightedMonto: number;
  color: string;
  bgColor?: string;
}

interface PipelineFunnelChartProps {
  stages: FunnelStageData[];
  totalNominal: number;
  onSelectStage?: (stageId: string) => void;
}

/** Embudo único: figura de embudo que se angosta etapa a etapa, con cantidad y monto por fila. */
export function PipelineFunnelChart({ stages, totalNominal, onSelectStage }: PipelineFunnelChartProps) {
  const n = Math.max(stages.length, 1);
  const widthAt = (i: number) => 100 - (i / n) * 68; // 100% arriba → 32% abajo

  return (
    <section className="h-full rounded-[20px] border border-line bg-surface p-6">
      <div>
        <h3 className="text-base font-semibold text-ink">Embudo de ventas</h3>
        <p className="mt-1 text-2xl font-bold tracking-tight text-ink t-num">${totalNominal.toLocaleString('es-CL')}</p>
      </div>

      <ul className="mt-5">
        {stages.map((stage, i) => {
          const top = widthAt(i);
          const bottom = widthAt(i + 1);
          const tl = (100 - top) / 2;
          const tr = 100 - tl;
          const bl = (100 - bottom) / 2;
          const br = 100 - bl;
          return (
            <li key={stage.stageId}>
              <button
                type="button"
                onClick={() => onSelectStage?.(stage.stageId)}
                className="grid w-full cursor-pointer grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-4 text-left"
              >
                <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-10 w-full" aria-hidden>
                  <polygon
                    points={`${tl},1 ${tr},1 ${br},39 ${bl},39`}
                    fill="var(--hg-accent)"
                    opacity={Math.max(0.35, 1 - i * (0.6 / n))}
                  />
                </svg>
                <span className="min-w-0">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink">{stage.label}</span>
                    <span className="t-num shrink-0 text-sm font-bold text-ink">{stage.count}</span>
                  </span>
                  <span className="t-num block text-xs text-ink-muted">${stage.nominalMonto.toLocaleString('es-CL')}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
