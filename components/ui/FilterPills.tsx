'use client';

import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { Filter, X, Plus, ChevronDown } from 'lucide-react';

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
}

export interface ActiveFilter {
  id: string;
  value: string;
}

export interface FilterPillsProps {
  filters: FilterDefinition[];
  activeFilters: Record<string, string>;
  onFilterChange: (id: string, value: string) => void;
  onClearAll: () => void;
  totalResults?: number;
  filteredResults?: number;
  className?: string;
  children?: React.ReactNode;
}

export function FilterPills({
  filters,
  activeFilters,
  onFilterChange,
  onClearAll,
  totalResults,
  filteredResults,
  className,
  children,
}: FilterPillsProps) {
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenDropdownId(null);
        setSelectorOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeEntries = Object.entries(activeFilters).filter(
    ([, value]) => value && value !== 'todos' && value !== 'all'
  );

  const availableFiltersToAdd = filters.filter((f) => {
    const currentVal = activeFilters[f.id];
    return !currentVal || currentVal === 'todos' || currentVal === 'all';
  });

  return (
    <div ref={containerRef} className={clsx('flex flex-wrap items-center gap-2 text-xs', className)}>
      {/* Selector para agregar nuevo filtro */}
      <div className="relative inline-flex">
        <button
          type="button"
          onClick={() => {
            setSelectorOpen(!selectorOpen);
            setOpenDropdownId(null);
          }}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1.5 font-semibold transition',
            selectorOpen
              ? 'border-accent bg-accent-soft text-accent-ink'
              : 'border-line bg-surface text-ink hover:bg-surface-muted'
          )}
          aria-haspopup="menu"
          aria-expanded={selectorOpen}
        >
          <Filter size={13} className="text-accent-ink" aria-hidden />
          <span>Filtros</span>
          {availableFiltersToAdd.length > 0 && <Plus size={13} className="text-ink-muted" />}
        </button>

        {selectorOpen && (
          <div
            role="menu"
            className="absolute left-0 top-full mt-1.5 z-30 min-w-44 rounded-panel border border-line bg-surface p-1 shadow-[var(--hg-shadow-popover)]"
          >
            <div className="px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted border-b border-line-subtle mb-1">
              Agregar filtro por:
            </div>
            {availableFiltersToAdd.length === 0 ? (
              <div className="px-2.5 py-2 text-ink-muted text-center text-xs">
                Todos los filtros activos
              </div>
            ) : (
              availableFiltersToAdd.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setSelectorOpen(false);
                    setOpenDropdownId(f.id);
                  }}
                  className="w-full flex items-center justify-between rounded-control px-2.5 py-1.5 text-left text-xs text-ink hover:bg-surface-muted transition font-medium"
                >
                  <span>{f.label}</span>
                  <ChevronDown size={13} className="text-ink-muted" />
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Píldoras activas */}
      {activeEntries.map(([filterId, activeVal]) => {
        const def = filters.find((f) => f.id === filterId);
        if (!def) return null;
        const option = def.options.find((o) => o.value === activeVal);
        const optionLabel = option?.label || activeVal;
        const isOpen = openDropdownId === filterId;

        return (
          <div key={filterId} className="relative inline-flex items-center">
            <div
              className={clsx(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 transition gap-1.5',
                isOpen
                  ? 'border-accent-line bg-accent-soft text-accent-ink ring-1 ring-accent-line'
                  : 'border-line bg-surface-muted text-ink hover:border-line'
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setOpenDropdownId(isOpen ? null : filterId);
                  setSelectorOpen(false);
                }}
                className="inline-flex items-center gap-1 font-medium cursor-pointer"
              >
                <span className="text-ink-muted font-normal">{def.label}:</span>
                <span className="font-semibold text-ink">{optionLabel}</span>
                <ChevronDown size={12} className="text-ink-muted" />
              </button>

              <button
                type="button"
                onClick={() => onFilterChange(filterId, 'todos')}
                className="ml-0.5 text-ink-muted hover:text-danger rounded-full p-0.5 transition"
                title={`Quitar filtro ${def.label}`}
                aria-label={`Quitar filtro ${def.label}`}
              >
                <X size={12} aria-hidden />
              </button>
            </div>

            {/* Menú de selección de valor para el filtro */}
            {isOpen && (
              <div
                role="listbox"
                className="absolute left-0 top-full mt-1.5 z-30 min-w-48 max-h-60 overflow-y-auto rounded-panel border border-line bg-surface p-1 shadow-[var(--hg-shadow-popover)]"
              >
                <div className="px-2.5 py-1 text-[11px] font-semibold text-ink-muted border-b border-line-subtle mb-1">
                  Filtrar por {def.label}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onFilterChange(filterId, 'todos');
                    setOpenDropdownId(null);
                  }}
                  className={clsx(
                    'w-full flex items-center justify-between rounded-control px-2.5 py-1.5 text-left text-xs transition',
                    activeVal === 'todos' ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink hover:bg-surface-muted'
                  )}
                >
                  <span>{def.allLabel || 'Todos'}</span>
                </button>
                {def.options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onFilterChange(filterId, opt.value);
                      setOpenDropdownId(null);
                    }}
                    className={clsx(
                      'w-full flex items-center justify-between rounded-control px-2.5 py-1.5 text-left text-xs transition',
                      activeVal === opt.value
                        ? 'bg-accent-soft font-semibold text-accent-ink'
                        : 'text-ink hover:bg-surface-muted'
                    )}
                  >
                    <span>{opt.label}</span>
                    {opt.count !== undefined && (
                      <span className="text-[11px] text-ink-muted font-mono">{opt.count}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Botón para limpiar todos los filtros */}
      {activeEntries.length > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-muted hover:text-danger px-2 py-1 rounded-control transition"
        >
          <X size={12} />
          <span>Limpiar filtros</span>
        </button>
      )}

      {/* Contenido adicional opcional (ej: selector de columnas, búsqueda) */}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}

      {/* Contador de resultados */}
      {filteredResults !== undefined && totalResults !== undefined && (
        <span className="ml-auto text-[11px] font-medium text-ink-muted">
          Mostrando <strong className="text-ink font-semibold">{filteredResults}</strong> de {totalResults}
        </span>
      )}
    </div>
  );
}
