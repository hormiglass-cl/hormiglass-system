'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { useMounted } from './useMounted';

export interface FloatingActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  children: React.ReactNode;
  itemLabel?: string;
  className?: string;
}

export function FloatingActionBar({
  selectedCount,
  onClearSelection,
  children,
  itemLabel = 'elementos',
  className,
}: FloatingActionBarProps) {
  const mounted = useMounted();

  if (!mounted || selectedCount <= 0) return null;

  return createPortal(
    <div
      role="region"
      aria-label="Acciones para elementos seleccionados"
      className={clsx(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3',
        'rounded-panel border border-line bg-surface/95 px-4 py-2.5',
        'shadow-[var(--hg-shadow-popover)] backdrop-blur-md',
        'animate-in fade-in slide-in-from-bottom-3 duration-200 max-w-[94vw]',
        className
      )}
    >
      <div className="flex items-center gap-2 border-r border-line-subtle pr-3">
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-accent text-on-accent text-xs font-bold px-1.5">
          {selectedCount}
        </span>
        <span className="text-xs font-semibold text-ink whitespace-nowrap hidden sm:inline">
          {selectedCount === 1 ? 'seleccionado' : `${itemLabel} seleccionados`}
        </span>
        <button
          type="button"
          onClick={onClearSelection}
          className="ml-1 text-ink-muted hover:text-ink p-1 rounded-control transition"
          title="Deseleccionar todo"
          aria-label="Deseleccionar todo"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto">
        {children}
      </div>
    </div>,
    document.body
  );
}
