'use client';

import React from 'react';
import clsx from 'clsx';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
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

  return (
    <div
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={clsx(
        'rounded-panel border border-line bg-surface p-4 transition shadow-xs',
        isClickable && 'hover:border-accent hover:shadow-sm cursor-pointer',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="t-caption text-ink-muted font-medium truncate">{title}</span>
        {Icon && (
          <span className={clsx(
            'grid h-8 w-8 place-items-center rounded-control',
            tone === 'accent' && 'bg-accent-soft text-accent-ink',
            tone === 'success' && 'bg-success-soft text-success',
            tone === 'warning' && 'bg-warning-soft text-warning',
            tone === 'danger' && 'bg-danger-soft text-danger',
            tone === 'info' && 'bg-info-soft text-info',
            (!tone || tone === 'neutral') && 'bg-surface-muted text-ink-muted'
          )}>
            <Icon size={16} aria-hidden />
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <div className="text-2xl font-bold tracking-tight text-ink t-num truncate">
          {value}
        </div>

        {change && (
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0',
              change.trend === 'up'
                ? 'bg-success-soft text-success border border-success-line'
                : change.trend === 'down'
                ? 'bg-danger-soft text-danger border border-danger-line'
                : 'bg-surface-muted text-ink-muted border border-line'
            )}
            title={change.label || undefined}
          >
            {change.trend === 'up' ? (
              <TrendingUp size={12} aria-hidden />
            ) : change.trend === 'down' ? (
              <TrendingDown size={12} aria-hidden />
            ) : (
              <Minus size={12} aria-hidden />
            )}
            <span>{change.value}</span>
          </span>
        )}
      </div>

      {subtitle && (
        <p className="mt-1 text-xs text-ink-muted truncate">{subtitle}</p>
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
