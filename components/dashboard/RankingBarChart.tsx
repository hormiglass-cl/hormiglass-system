'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface RankingItem {
  id: string;
  title: string;
  subtitle?: string;
  count: number;
  countLabel?: string;
  monto: number;
  avatarText?: string;
  color?: string;
}

interface RankingBarChartProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  items: RankingItem[];
  emptyMessage?: string;
  maxItems?: number;
}

export function RankingBarChart({
  title,
  subtitle,
  icon: IconComponent,
  items,
  emptyMessage = 'No hay datos en el período seleccionado.',
  maxItems = 5,
}: RankingBarChartProps) {
  const displayItems = items.slice(0, maxItems);
  const maxMonto = Math.max(...displayItems.map((i) => i.monto), 1);

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div>
          <h3 className="font-extrabold text-base text-[#213343] flex items-center gap-2">
            {IconComponent && (
              <div className="p-1.5 rounded-md bg-orange-50 text-[#f97316]">
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

      {displayItems.length === 0 ? (
        <div className="h-44 flex items-center justify-center text-xs text-gray-400 italic">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-3.5 text-xs">
          {displayItems.map((item, idx) => {
            const percent = Math.round((item.monto / maxMonto) * 100);

            // Medal or Rank badge styling
            const rankColors = [
              'bg-amber-100 text-amber-900 border-amber-300 font-black',
              'bg-slate-100 text-slate-800 border-slate-300 font-black',
              'bg-orange-100 text-orange-900 border-orange-300 font-black',
            ];
            const defaultRankColor = 'bg-gray-100 text-gray-600 border-gray-200 font-bold';
            const badgeStyle = idx < 3 ? rankColors[idx] : defaultRankColor;

            return (
              <div key={item.id} className="space-y-1.5 group">
                <div className="flex items-center justify-between">
                  {/* Izquierda: Rank + Título */}
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span
                      className={`w-5 h-5 rounded-full border text-[10px] flex items-center justify-center shrink-0 ${badgeStyle}`}
                    >
                      #{idx + 1}
                    </span>

                    {item.avatarText && (
                      <span className="w-6 h-6 rounded-full bg-orange-500 text-white font-black text-[10px] flex items-center justify-center shrink-0 shadow-xs">
                        {item.avatarText}
                      </span>
                    )}

                    <div className="truncate">
                      <span className="font-bold text-[#213343] block truncate group-hover:text-[#f97316] transition">
                        {item.title}
                      </span>
                      {item.subtitle && (
                        <span className="text-[10.5px] text-gray-400 font-medium block truncate">
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Derecha: Conteo + Monto */}
                  <div className="text-right shrink-0">
                    <span className="font-black text-[#213343] block">
                      ${item.monto.toLocaleString('es-CL')}
                    </span>
                    <span className="text-[10px] text-gray-400 font-semibold block">
                      {item.count} {item.countLabel || 'ops'}
                    </span>
                  </div>
                </div>

                {/* Barra de Progreso Porcentual */}
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden flex items-center">
                  <div
                    className="bg-orange-500 h-full rounded-full transition-all duration-500 group-hover:from-orange-500 group-hover:to-orange-600"
                    style={{ width: `${Math.max(4, percent)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
