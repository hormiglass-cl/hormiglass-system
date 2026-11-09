'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SearchSelectOption {
  value: string;
  label: string;
  /** Texto secundario (RUT, precio, etc.). También se usa al buscar. */
  hint?: string;
}

export interface SearchSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  /** Si se entrega, agrega una opción vacía (value '') al inicio para limpiar la selección. */
  clearLabel?: string;
  searchPlaceholder?: string;
  /** 'auto' muestra el buscador solo cuando hay más de 6 opciones. */
  searchable?: boolean | 'auto';
  /** 'field' = campo de formulario; 'plain' = texto simple para tablas. */
  variant?: 'field' | 'plain';
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  menuMinWidth?: number;
  emptyText?: string;
  renderValue?: (option: SearchSelectOption) => React.ReactNode;
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

interface MenuPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  up: boolean;
}

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar...',
  clearLabel,
  searchPlaceholder = 'Buscar...',
  searchable = 'auto',
  variant = 'field',
  disabled,
  ariaLabel,
  className,
  menuMinWidth = 220,
  emptyText = 'Sin resultados',
  renderValue,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const allOptions = useMemo<SearchSelectOption[]>(
    () => (clearLabel ? [{ value: '', label: clearLabel }, ...options] : options),
    [clearLabel, options]
  );
  const showSearch = searchable === 'auto' ? options.length > 6 : searchable;

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return allOptions;
    const tokens = q.split(/\s+/);
    return allOptions.filter((o) => {
      if (o.value === '') return false;
      const haystack = normalize(`${o.label} ${o.hint ?? ''}`);
      return tokens.every((t) => haystack.includes(t));
    });
  }, [allOptions, query]);

  const selected = options.find((o) => o.value === value);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const openMenu = () => {
    const el = triggerRef.current;
    if (!el || disabled) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const up = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(320, up ? spaceAbove : spaceBelow));
    const width = Math.max(rect.width, menuMinWidth);
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
    setPos({
      left,
      top: up ? rect.top - 4 : rect.bottom + 4,
      width,
      maxHeight,
      up,
    });
    const idx = allOptions.findIndex((o) => o.value === value);
    setActive(Math.max(0, idx));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setQuery('');
    };
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setQuery('');
    };
    const onResize = () => {
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const choose = (opt: SearchSelectOption) => {
    onChange(opt.value);
    close();
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(visible.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = visible[active];
      if (opt) choose(opt);
    }
  };

  const triggerLabel = selected
    ? renderValue
      ? renderValue(selected)
      : <span className="truncate">{selected.label}</span>
    : <span className="truncate text-ink-muted">{placeholder}</span>;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
            e.preventDefault();
            openMenu();
          }
        }}
        className={clsx(
          variant === 'field'
            ? 'hg-field-compact flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60'
            : 'inline-flex max-w-full items-center gap-1 rounded-md py-1 text-left text-[13px] text-ink transition hover:bg-surface-muted',
          className
        )}
      >
        {triggerLabel}
        <ChevronDown size={13} className="shrink-0 text-ink-muted" aria-hidden />
      </button>

      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            onKeyDown={onKeyDown}
            style={{
              position: 'fixed',
              left: pos.left,
              width: pos.width,
              ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
              maxHeight: pos.maxHeight,
            }}
            className="z-[130] flex flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-[var(--hg-shadow-popover)]"
          >
            {showSearch && (
              <div className="relative shrink-0 border-b border-line-subtle p-2">
                <Search size={13} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="hg-field-compact w-full pl-7"
                />
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {visible.length === 0 ? (
                <p className="px-2.5 py-3 text-center text-xs text-ink-muted">{emptyText}</p>
              ) : (
                visible.map((opt, i) => (
                  <button
                    key={opt.value || '__clear'}
                    type="button"
                    role="option"
                    aria-selected={opt.value === value}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(opt)}
                    className={clsx(
                      'flex w-full items-center justify-between gap-2 rounded-control px-2.5 py-1.5 text-left text-xs transition',
                      i === active ? 'bg-surface-muted' : '',
                      opt.value === value ? 'font-semibold text-accent-ink' : 'text-ink'
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{opt.label}</span>
                      {opt.hint && <span className="block truncate text-[11px] font-normal text-ink-muted">{opt.hint}</span>}
                    </span>
                    {opt.value === value && <Check size={13} className="shrink-0 text-accent-ink" aria-hidden />}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
