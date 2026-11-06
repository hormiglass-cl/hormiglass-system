'use client';

import React from 'react';
import clsx from 'clsx';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';
import type { Tone } from './crm';

export interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: typeof Info;
  change?: {
    value: string | number;
    trend: 'up' | 'down' | 'neutral';
    label?: string;
  };
  tone?: Tone;
  progress?: {
    current: number;
    total: number;
    label?: string;
  };
  onClick?: () => void;
  className?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  change,
  tone,
  progress,
  onClick,
  className,
}: MetricCardProps) {
  const isClickable = !!onClick;

  const tint =
    tone === 'accent' ? 'bg-accent-soft'
    : tone === 'success' ? 'bg-success-soft'
    : tone === 'warning' ? 'bg-warning-soft'
    : tone === 'danger' ? 'bg-danger-soft'
    : tone === 'info' ? 'bg-info-soft'
    : 'bg-surface-muted';

  return (
    <div
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={clsx(
        'rounded-[20px] p-5 transition',
        tint,
        isClickable && 'cursor-pointer hover:shadow-sm',
        className
      )}
    >
      {Icon && (
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-surface">
          <Icon size={18} aria-hidden />
        </span>
      )}

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[28px] font-bold leading-none tracking-tight text-ink t-num">
            {value}
          </div>
          <span className="mt-2 block truncate text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</span>
        </div>

        {change && (
          <span
            className={clsx(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold',
              change.trend === 'up'
                ? 'bg-success text-white'
                : change.trend === 'down'
                ? 'bg-danger text-white'
                : 'bg-surface text-ink-muted'
            )}
            title={change.label || undefined}
          >
            {change.trend === 'up' ? (
              <TrendingUp size={12} aria-hidden />
            ) : change.trend === 'down' ? (
              <TrendingDown size={12} aria-hidden />
            ) : null}
            <span>{change.value}</span>
          </span>
        )}
      </div>

      {subtitle && (
        <p className="mt-2 truncate text-xs text-ink-muted">{subtitle}</p>
      )}

      {progress && (
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-ink-muted font-medium">
            <span>{progress.label || 'Progreso'}</span>
            <span className="t-num font-semibold text-ink">
              {Math.min(100, Math.round((progress.current / Math.max(progress.total, 1)) * 100))}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-300',
                tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-accent'
              )}
              style={{
                width: `${Math.min(100, Math.max(0, (progress.current / Math.max(progress.total, 1)) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
