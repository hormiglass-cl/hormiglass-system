'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import clsx from 'clsx';
import { X, ExternalLink } from 'lucide-react';
import { IconButton } from './crm';

export interface SlideOverDrawerProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  fullPageHref?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
}

export function SlideOverDrawer({
  open,
  onClose,
  title,
  subtitle,
  badge,
  fullPageHref,
  children,
  footer,
  width = 'lg',
}: SlideOverDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard navigation & body scroll lock
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const widthClass = {
    md: 'max-w-lg',
    lg: 'max-w-2xl lg:max-w-[48vw]',
    xl: 'max-w-3xl lg:max-w-[58vw]',
  }[width];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/40 backdrop-blur-xs transition-opacity duration-200"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={clsx(
          'relative flex h-full w-full flex-col border-l border-line bg-surface shadow-[var(--hg-shadow-popover)] outline-none',
          'animate-in slide-in-from-right duration-200',
          widthClass
        )}
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-line-subtle px-5 py-3.5 bg-surface shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 id={titleId} className="t-section truncate text-ink">
                {title}
              </h2>
              {badge && <span className="shrink-0">{badge}</span>}
            </div>
            {subtitle && (
              <p className="t-caption mt-0.5 truncate text-ink-muted">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {fullPageHref && (
              <Link
                href={fullPageHref}
                className="grid h-8 w-8 place-items-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink transition"
                title="Abrir en página completa"
                aria-label="Abrir en página completa"
              >
                <ExternalLink size={16} aria-hidden />
              </Link>
            )}
            <IconButton icon={X} label="Cerrar panel" onClick={onClose} className="h-8 w-8" />
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {/* Optional Footer */}
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line-subtle bg-app px-5 py-3 shrink-0">
            {footer}
          </footer>
        )}
      </aside>
    </div>,
    document.body
  );
}
