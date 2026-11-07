'use client';

import React from 'react';
import { LucideIcon, UserRound } from 'lucide-react';

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
  icon: IconComponent,
  items,
  emptyMessage = 'No hay datos en el período seleccionado.',
  maxItems = 5,
}: RankingBarChartProps) {
  const displayItems = items.slice(0, maxItems);
  const maxMonto = Math.max(...displayItems.map((i) => i.monto), 1);

  return (
    <div className="flex flex-col justify-between space-y-4 rounded-[20px] border border-line bg-surface p-6">
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

      {displayItems.length === 0 ? (
        <div className="flex h-44 items-center justify-center text-xs italic text-ink-muted">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-3.5 text-xs">
          {displayItems.map((item, idx) => {
            const percent = Math.round((item.monto / maxMonto) * 100);

            return (
              <div key={item.id} className="group space-y-1.5">
                <div className="flex items-center justify-between">
                  {/* Izquierda: Rank + Título */}
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span
                      className={`t-micro flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        idx === 0
                          ? 'border-accent-line bg-accent-soft font-semibold text-accent-ink'
                          : 'border-line bg-surface-muted text-ink-muted'
                      }`}
                    >
                      #{idx + 1}
                    </span>

                    {item.avatarText && (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink ring-1 ring-accent-line">
                        <UserRound size={14} aria-hidden />
                      </span>
                    )}

                    <div className="truncate">
                      <span className="block truncate font-semibold text-ink transition group-hover:text-accent-ink">
                        {item.title}
                      </span>
                      {item.subtitle && (
                        <span className="t-micro block truncate text-ink-muted">
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Derecha: Conteo + Monto */}
                  <div className="shrink-0 text-right">
                    <span className="t-num block font-semibold text-ink">
                      ${item.monto.toLocaleString('es-CL')}
                    </span>
                    <span className="t-micro block text-ink-muted">
                      {item.count} {item.countLabel || 'ops'}
                    </span>
                  </div>
                </div>

                {/* Barra de Progreso Porcentual */}
                <div className="flex h-2 w-full items-center overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
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
