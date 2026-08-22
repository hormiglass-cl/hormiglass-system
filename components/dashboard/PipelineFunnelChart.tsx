'use client';

import React from 'react';
import { Target, TrendingUp, ChevronRight, Layers } from 'lucide-react';
import Link from 'next/link';

export interface FunnelStageData {
  stageId: string;
  label: string;
  count: number;
  nominalMonto: number;
  probabilidad: number; // e.g. 20, 50, 80, 100
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
    <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-orange-50 text-[#F7931F]">
              <Target className="w-4 h-4" />
            </div>
            <h3 className="font-extrabold text-base text-[#363636]">
              Proyecciones de Venta en Pipeline
            </h3>
          </div>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Valor nominal y proyección ponderada por probabilidad de cierre en cada etapa
          </p>
        </div>

        {/* Resumen Ponderado */}
        <div className="bg-orange-50 border border-orange-200 px-3.5 py-1.5 rounded-2xl text-right">
          <span className="text-[10.5px] text-gray-500 font-bold block">
            Proyección ponderada
          </span>
          <span className="text-sm font-black text-[#F7931F]">
            ${totalPipelineWeighted.toLocaleString('es-CL')} CLP
          </span>
        </div>
      </div>

      {/* Embudo Visual / Funnel */}
      <div className="space-y-3 text-xs">
        {stages.map((st) => {
          const widthPercent =
            totalPipelineNominal > 0
              ? Math.max(12, Math.round((st.nominalMonto / maxNominal) * 100))
              : 12;

          return (
            <div key={st.stageId} className="space-y-1.5 p-3 rounded-2xl bg-gray-50/70 border border-gray-200 hover:border-orange-200 transition">
              <div className="flex items-center justify-between font-bold">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: st.color }}
                  />
                  <span className="text-[#363636]">{st.label}</span>
                  <span className="text-[10px] bg-white border border-gray-200 px-2 py-0.5 rounded-full text-gray-600 font-semibold">
                    {st.count} ops · {st.probabilidad}% prob.
                  </span>
                </div>

                <div className="text-right">
                  <span className="font-black text-[#363636] block">
                    ${st.nominalMonto.toLocaleString('es-CL')}
                  </span>
                  <span className="text-[10px] text-[#F7931F] font-bold block">
                    Pond: ${st.weightedMonto.toLocaleString('es-CL')}
                  </span>
                </div>
              </div>

              {/* Barra Proporcional del Embudo */}
              <div className="w-full bg-gray-200/80 h-2 rounded-full overflow-hidden flex items-center">
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

      {/* Link al Pipeline */}
      <div className="pt-1 flex items-center justify-between text-xs">
        <span className="text-gray-500 font-medium">
          Total nominal en embudo: <strong className="text-[#363636] font-bold">${totalPipelineNominal.toLocaleString('es-CL')} CLP</strong>
        </span>
        <Link
          href="/ventas"
          className="text-[#F7931F] hover:underline font-bold flex items-center gap-1 cursor-pointer"
        >
          <span>Gestionar pipeline</span>
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
