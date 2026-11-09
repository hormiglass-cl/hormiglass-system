'use client';

import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { Filter, X, Plus, ChevronDown, Check } from 'lucide-react';

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterDefinition {
  id: string;
  label: string;
  options: FilterOption[];
  allLabel?: string;
  /** 'number' permite comparar con =, ≥, ≤, >, <. El valor se guarda como "operador:número" (ej. ">=:3"). */
  type?: 'select' | 'number';
}

export const NUMBER_OPERATORS = [
  { value: '=', label: 'es igual a' },
  { value: '>=', label: 'es mayor o igual a' },
  { value: '<=', label: 'es menor o igual a' },
  { value: '>', label: 'es mayor que' },
  { value: '<', label: 'es menor que' },
] as const;

/** Evalúa un valor "operador:número" contra un número real. */
export function matchNumberFilter(raw: string | undefined, actual: number): boolean {
  if (!raw || !raw.includes(':')) return true;
  const [op, num] = raw.split(':');
  const n = Number(num);
  if (Number.isNaN(n)) return true;
  switch (op) {
    case '=': return actual === n;
    case '>=': return actual >= n;
    case '<=': return actual <= n;
    case '>': return actual > n;
    case '<': return actual < n;
    default: return true;
  }
}

const MULTI_SEP = '|';

/** Valores seleccionados de un filtro de selección múltiple (guardados como "a|b|c"). */
export function parseMulti(raw: string | undefined): string[] {
  if (!raw || raw === 'todos' || raw === 'all' || raw === 'todas') return [];
  return raw.split(MULTI_SEP).filter(Boolean);
}

/** true si no hay filtro activo o si alguno de los valores seleccionados cumple `test`. */
export function matchMultiFilter(raw: string | undefined, test: (value: string) => boolean): boolean {
  const values = parseMulti(raw);
  return values.length === 0 || values.some(test);
}

function numberLabel(raw: string): string {
  const [op, num] = raw.split(':');
  const symbol = { '=': '=', '>=': '≥', '<=': '≤', '>': '>', '<': '<' }[op] ?? op;
  return `${symbol} ${num}`;
}

export interface ActiveFilter {
  id: string;
  value: string;
}

/** Estado de interfaz compartido entre el botón "Filtros" y el panel de filtros aplicados. */
export interface FilterUi {
  openDropdownId: string | null;
  setOpenDropdownId: (id: string | null) => void;
  selectorOpen: boolean;
  setSelectorOpen: (open: boolean) => void;
  pendingIds: string[];
  setPendingIds: React.Dispatch<React.SetStateAction<string[]>>;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  numOp: string;
  setNumOp: (op: string) => void;
  numVal: string;
  setNumVal: (val: string) => void;
}

export function useFilterUi(): FilterUi {
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [numOp, setNumOp] = useState<string>('>=');
  const [numVal, setNumVal] = useState<string>('');

  // Cierra menús al hacer clic fuera de cualquier control de filtros.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Element | null;
      if (target && target.closest('[data-filter-ui]')) return;
      setOpenDropdownId(null);
      setSelectorOpen(false);
      setPendingIds([]);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return {
    openDropdownId, setOpenDropdownId,
    selectorOpen, setSelectorOpen,
    pendingIds, setPendingIds,
    collapsed, setCollapsed,
    numOp, setNumOp,
    numVal, setNumVal,
  };
}

function isActiveValue(value: string | undefined): value is string {
  return !!value && value !== 'todos' && value !== 'all';
}

const CONTROL_BASE =
  'inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line-subtle bg-surface px-2.5 text-[13px] shadow-[var(--hg-shadow-card)] transition';

export interface FilterMenuProps {
  filters: FilterDefinition[];
  activeFilters: Record<string, string>;
  ui: FilterUi;
  triggerClassName?: string;
  /** Muestra solo el ícono del filtro (con el contador de filtros activos). */
  iconOnly?: boolean;
  /** Lado del que se despliega la lista. */
  align?: 'left' | 'right';
}

/** Botón "Filtros" con el menú para agregar un filtro. */
export function FilterMenu({ filters, activeFilters, ui, triggerClassName, iconOnly, align = 'left' }: FilterMenuProps) {
  const activeCount = Object.values(activeFilters).filter(isActiveValue).length;
  const available = filters.filter(
    (f) => !isActiveValue(activeFilters[f.id]) && !ui.pendingIds.includes(f.id)
  );

  return (
    <div data-filter-ui className="relative inline-flex">
      <button
        type="button"
        onClick={() => {
          ui.setSelectorOpen(!ui.selectorOpen);
          ui.setOpenDropdownId(null);
        }}
        className={clsx(
          CONTROL_BASE,
          'font-semibold',
          ui.selectorOpen ? 'border-accent bg-accent-soft text-accent-ink' : 'text-ink hover:bg-surface-muted',
          triggerClassName
        )}
        aria-haspopup="menu"
        aria-label="Filtros"
        aria-expanded={ui.selectorOpen}
      >
        <Filter size={iconOnly ? 15 : 13} className="text-accent-ink" aria-hidden />
        {!iconOnly && <span>Filtros</span>}
        {activeCount > 0 ? (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold text-on-accent t-num">
            {activeCount}
          </span>
        ) : (
          !iconOnly && available.length > 0 && <Plus size={13} className="text-ink-muted" aria-hidden />
        )}
      </button>

      {ui.selectorOpen && (
        <div
          role="menu"
          className={clsx('absolute top-full z-30 mt-1.5 min-w-44 rounded-panel border border-line bg-surface p-1 shadow-[var(--hg-shadow-popover)]', align === 'right' ? 'right-0' : 'left-0')}
        >
          <div className="mb-1 border-b border-line-subtle px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted">
            Agregar filtro por:
          </div>
          {available.length === 0 ? (
            <div className="px-2.5 py-2 text-center text-xs text-ink-muted">Todos los filtros activos</div>
          ) : (
            available.map((f) => (
              <button
                key={f.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  ui.setSelectorOpen(false);
                  ui.setPendingIds((prev) => (prev.includes(f.id) ? prev : [...prev, f.id]));
                  ui.setCollapsed(false);
                  ui.setOpenDropdownId(f.id);
                  ui.setNumOp('>=');
                  ui.setNumVal('');
                }}
                className="flex w-full items-center justify-between rounded-control px-2.5 py-1.5 text-left text-xs font-medium text-ink transition hover:bg-surface-muted"
              >
                <span>{f.label}</span>
                <ChevronDown size={13} className="text-ink-muted" aria-hidden />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export interface FilterBarProps {
  filters: FilterDefinition[];
  activeFilters: Record<string, string>;
  onFilterChange: (id: string, value: string) => void;
  onClearAll: () => void;
  ui: FilterUi;
  className?: string;
}

/** Panel desplegable con los filtros aplicados (se muestra bajo la barra de herramientas). */
export function FilterBar({ filters, activeFilters, onFilterChange, onClearAll, ui, className }: FilterBarProps) {
  const activeEntries = Object.entries(activeFilters).filter(([, v]) => isActiveValue(v));
  const entries: [string, string][] = [
    ...activeEntries,
    ...ui.pendingIds
      .filter((id) => !activeEntries.some(([k]) => k === id))
      .map((id) => [id, ''] as [string, string]),
  ];
  if (entries.length === 0) return null;

  const expanded = !ui.collapsed || ui.pendingIds.length > 0;
  const removePending = (id: string) => ui.setPendingIds((prev) => prev.filter((x) => x !== id));

  return (
    <div data-filter-ui className={clsx('rounded-xl bg-surface-muted p-1', className)}>
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <button
          type="button"
          onClick={() => ui.setCollapsed(!ui.collapsed)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink"
        >
          <ChevronDown
            size={14}
            aria-hidden
            className={clsx('text-ink-muted transition-transform', !expanded && '-rotate-90')}
          />
          <span>Filtros aplicados</span>
          <span className="t-num font-normal text-ink-muted">({activeEntries.length})</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onClearAll();
            ui.setPendingIds([]);
            ui.setOpenDropdownId(null);
          }}
          className="inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-[11px] font-semibold text-ink-muted transition hover:text-danger"
        >
          <X size={12} aria-hidden />
          <span>Limpiar filtros</span>
        </button>
      </div>

      {expanded && (
        <div className="flex flex-wrap items-center gap-2 px-1 pb-1">
          {entries.map(([filterId, activeVal]) => {
            const def = filters.find((f) => f.id === filterId);
            if (!def) return null;
            const isNumber = def.type === 'number';
            const selected = isNumber ? [] : parseMulti(activeVal);
            const selectedLabels = selected.map((v) => def.options.find((o) => o.value === v)?.label || v);
            const valueLabel = !activeVal
              ? 'Elegir...'
              : isNumber
              ? numberLabel(activeVal)
              : selectedLabels.length > 2
              ? `${selectedLabels.length} seleccionados`
              : selectedLabels.join(', ');

            const toggle = (value: string) => {
              const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
              if (next.length === 0) {
                onFilterChange(filterId, 'todos');
                ui.setPendingIds((prev) => (prev.includes(filterId) ? prev : [...prev, filterId]));
              } else {
                onFilterChange(filterId, next.join(MULTI_SEP));
                removePending(filterId);
              }
            };
            const isOpen = ui.openDropdownId === filterId;

            const apply = (value: string) => {
              onFilterChange(filterId, value);
              removePending(filterId);
              ui.setOpenDropdownId(null);
            };

            return (
              <div key={filterId} className="relative inline-flex">
                <div
                  className={clsx(
                    CONTROL_BASE,
                    'gap-1.5 pr-1.5',
                    isOpen && 'border-accent-line ring-1 ring-accent-line'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      ui.setOpenDropdownId(isOpen ? null : filterId);
                      ui.setSelectorOpen(false);
                      if (isNumber) {
                        const [o, n] = activeVal.includes(':') ? activeVal.split(':') : ['>=', ''];
                        ui.setNumOp(o);
                        ui.setNumVal(n);
                      }
                    }}
                    className="inline-flex items-center gap-1"
                  >
                    <span className="text-ink-muted">{def.label}:</span>
                    <span className={clsx('font-semibold', activeVal ? 'text-ink' : 'text-ink-muted')}>{valueLabel}</span>
                    <ChevronDown size={12} className="text-ink-muted" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onFilterChange(filterId, 'todos');
                      removePending(filterId);
                      if (isOpen) ui.setOpenDropdownId(null);
                    }}
                    className="rounded-full p-0.5 text-ink-muted transition hover:text-danger"
                    title={`Quitar filtro ${def.label}`}
                    aria-label={`Quitar filtro ${def.label}`}
                  >
                    <X size={12} aria-hidden />
                  </button>
                </div>

                {isOpen && isNumber && (
                  <div className="absolute left-0 top-full z-30 mt-1.5 w-60 space-y-2 rounded-panel border border-line bg-surface p-3 shadow-[var(--hg-shadow-popover)]">
                    <div className="text-[11px] font-semibold text-ink-muted">Filtrar por {def.label}</div>
                    <select
                      aria-label="Condición"
                      value={ui.numOp}
                      onChange={(e) => ui.setNumOp(e.target.value)}
                      className="hg-field-compact w-full"
                    >
                      {NUMBER_OPERATORS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      aria-label="Cantidad"
                      value={ui.numVal}
                      onChange={(e) => ui.setNumVal(e.target.value)}
                      placeholder="Cantidad"
                      className="hg-field-compact w-full"
                    />
                    <button
                      type="button"
                      disabled={ui.numVal === ''}
                      onClick={() => apply(`${ui.numOp}:${ui.numVal}`)}
                      className="w-full rounded-control bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Aplicar
                    </button>
                  </div>
                )}

                {isOpen && !isNumber && (
                  <div
                    role="listbox"
                    className="absolute left-0 top-full z-30 mt-1.5 max-h-60 min-w-48 overflow-y-auto rounded-panel border border-line bg-surface p-1 shadow-[var(--hg-shadow-popover)]"
                  >
                    <div className="mb-1 border-b border-line-subtle px-2.5 py-1 text-[11px] font-semibold text-ink-muted">
                      Filtrar por {def.label} (puedes elegir varios)
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onFilterChange(filterId, 'todos');
                        ui.setPendingIds((prev) => (prev.includes(filterId) ? prev : [...prev, filterId]));
                      }}
                      className={clsx(
                        'flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-xs transition hover:bg-surface-muted',
                        selected.length === 0 ? 'font-semibold text-accent-ink' : 'text-ink'
                      )}
                    >
                      <span className="grid h-4 w-4 shrink-0 place-items-center">
                        {selected.length === 0 && <Check size={13} aria-hidden />}
                      </span>
                      <span>{def.allLabel || 'Todos'}</span>
                    </button>
                    {def.options.map((opt) => {
                      const checked = selected.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={checked}
                          onClick={() => toggle(opt.value)}
                          className={clsx(
                            'flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-xs transition',
                            checked ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink hover:bg-surface-muted'
                          )}
                        >
                          <span
                            className={clsx(
                              'grid h-4 w-4 shrink-0 place-items-center rounded border',
                              checked ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface'
                            )}
                          >
                            {checked && <Check size={11} aria-hidden />}
                          </span>
                          <span className="flex-1">{opt.label}</span>
                          {opt.count !== undefined && (
                            <span className="font-mono text-[11px] text-ink-muted">{opt.count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface FilterPillsProps {
  filters: FilterDefinition[];
  activeFilters: Record<string, string>;
  onFilterChange: (id: string, value: string) => void;
  onClearAll: () => void;
  totalResults?: number;
  filteredResults?: number;
  className?: string;
  triggerClassName?: string;
  children?: React.ReactNode;
}

/** Versión compuesta: botón de filtros + panel de aplicados debajo. */
export function FilterPills({
  filters,
  activeFilters,
  onFilterChange,
  onClearAll,
  totalResults,
  filteredResults,
  className,
  triggerClassName,
  children,
}: FilterPillsProps) {
  const ui = useFilterUi();
  return (
    <div className={clsx('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <FilterMenu filters={filters} activeFilters={activeFilters} ui={ui} triggerClassName={triggerClassName} />
        {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
        {filteredResults !== undefined && totalResults !== undefined && (
          <span className="ml-auto text-[11px] font-medium text-ink-muted">
            Mostrando <strong className="font-semibold text-ink">{filteredResults}</strong> de {totalResults}
          </span>
        )}
      </div>
      <FilterBar
        filters={filters}
        activeFilters={activeFilters}
        onFilterChange={onFilterChange}
        onClearAll={onClearAll}
        ui={ui}
      />
    </div>
  );
}
