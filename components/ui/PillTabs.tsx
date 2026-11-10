'use client';

import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

export interface PillTabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

/** Interruptor de secciones en forma de píldora (el mismo del panel operativo). */
export function PillTabs({
  items,
  active,
  onChange,
  label = 'Secciones',
}: {
  items: PillTabItem[];
  active: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex h-11 items-center gap-1 rounded-full border border-line bg-surface-muted p-1">
      {items.map((item) => {
        const selected = active === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={clsx(
              'flex h-full shrink-0 cursor-pointer select-none items-center gap-2 whitespace-nowrap rounded-full px-4 text-xs font-semibold transition-all duration-200 sm:px-5 sm:text-sm',
              selected ? 'bg-accent text-on-accent shadow-xs' : 'text-ink-muted hover:bg-surface/60 hover:text-ink',
            )}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden />}
            <span>{item.label}</span>
            {item.count !== undefined && item.count > 0 && (
              <span className={clsx('t-num rounded-full px-1.5 text-[11px]', selected ? 'bg-on-accent/15' : 'bg-surface text-ink-muted')}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Barra superior: interruptor centrado y, a la derecha, las herramientas (p. ej. el filtro de período). */
export function PillTabsBar({ tabs, right }: { tabs: React.ReactNode; right?: React.ReactNode }) {
  return (
    // Three centered columns only when there is room; narrower screens stack tabs and tools.
    <div className="grid min-w-0 items-center gap-3 xl:grid-cols-[1fr_auto_1fr]">
      <div className="hidden xl:block" aria-hidden />
      {/* safe center: when the tabs overflow, scroll from the first tab instead of clipping it. */}
      <div className="flex min-w-0 overflow-x-auto [justify-content:safe_center]">{tabs}</div>
      <div className="flex justify-center md:justify-end">{right}</div>
    </div>
  );
}
