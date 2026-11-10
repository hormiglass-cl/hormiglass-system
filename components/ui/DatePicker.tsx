'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Calendar, X } from 'lucide-react';
import { CalendarPane, firstOfMonth, fromKey, toKey } from './DateRangePicker';

export interface DatePickerProps {
  /** Fecha en formato YYYY-MM-DD ('' = sin fecha). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Permite quitar la fecha seleccionada. */
  clearable?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

const MENU_WIDTH = 300;
const MENU_HEIGHT = 380;

/** Selector de fecha con el calendario del sistema (reemplaza al `<input type="date">` nativo). */
export function DatePicker({ value, onChange, placeholder = 'Elegir fecha', clearable = true, disabled, ariaLabel, className }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => firstOfMonth(value));
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    const el = triggerRef.current;
    if (!el || disabled) return;
    const rect = el.getBoundingClientRect();
    const up = window.innerHeight - rect.bottom < MENU_HEIGHT && rect.top > MENU_HEIGHT;
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - MENU_WIDTH - 8));
    setPos({ left, top: up ? rect.top - MENU_HEIGHT - 4 : rect.bottom + 4 });
    setView(firstOfMonth(value));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const label = value
    ? fromKey(value).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')
    : placeholder;

  return (
    <>
      <div className={clsx('relative', className)}>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : openMenu())}
          className={clsx(
            'hg-field-compact flex w-full items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60',
            clearable && value && 'pr-8'
          )}
        >
          <Calendar size={14} className="shrink-0 text-ink-muted" aria-hidden />
          <span className={clsx('truncate t-num', !value && 'text-ink-muted')}>{label}</span>
        </button>
        {clearable && value && !disabled && (
          <button
            type="button"
            aria-label="Quitar fecha"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-ink-muted transition hover:text-danger"
          >
            <X size={13} aria-hidden />
          </button>
        )}
      </div>

      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            role="dialog"
            aria-label="Elegir fecha"
            style={{ position: 'fixed', left: pos.left, top: pos.top, width: MENU_WIDTH }}
            className="z-[130] rounded-panel border border-line bg-surface p-3 shadow-[var(--hg-shadow-popover)]"
          >
            <CalendarPane
              view={view}
              onView={setView}
              value={value}
              onPick={(k) => {
                onChange(k);
                setOpen(false);
              }}
            />
            <div className="mt-2 flex items-center justify-between border-t border-line-subtle pt-2">
              <button
                type="button"
                onClick={() => {
                  onChange(toKey(new Date()));
                  setOpen(false);
                }}
                className="text-xs font-semibold text-accent-ink transition hover:underline"
              >
                Hoy
              </button>
              {clearable && value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className="text-xs font-semibold text-ink-muted transition hover:text-danger"
                >
                  Quitar fecha
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
