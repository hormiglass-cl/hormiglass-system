'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, RotateCcw, SlidersHorizontal } from 'lucide-react';

type Prefs<K extends string> = { order: K[]; visible: Record<K, boolean> };

/** Une lo guardado con los valores por defecto: ignora columnas desconocidas y agrega las nuevas al final. */
function normalizar<K extends string>(
  saved: unknown,
  defaultOrder: readonly K[],
  defaultVisible: Record<K, boolean>,
): Prefs<K> {
  const base: Prefs<K> = { order: [...defaultOrder], visible: { ...defaultVisible } };
  if (!saved || typeof saved !== 'object') return base;
  const raw = saved as { order?: unknown; visible?: unknown } & Record<string, unknown>;
  // Formato antiguo: solo un mapa de booleanos por columna.
  const visibleRaw = (raw.visible && typeof raw.visible === 'object' ? raw.visible : raw.order ? {} : raw) as Record<string, unknown>;
  for (const key of defaultOrder) {
    if (typeof visibleRaw[key] === 'boolean') base.visible[key] = visibleRaw[key] as boolean;
  }
  if (Array.isArray(raw.order)) {
    const conocidas = (raw.order as unknown[]).filter((k): k is K => defaultOrder.includes(k as K));
    const faltantes = defaultOrder.filter((k) => !conocidas.includes(k));
    base.order = [...new Set([...conocidas, ...faltantes])];
  }
  return base;
}

/**
 * Preferencias de columnas de una tabla: cuáles se ven y en qué orden.
 * Se guardan en localStorage (el mismo valor que ya usaban las tablas se sigue entendiendo).
 */
export function useColumnPrefs<K extends string>(
  storageKey: string,
  defaultOrder: readonly K[],
  defaultVisible: Record<K, boolean>,
) {
  const [prefs, setPrefs] = useState<Prefs<K>>(() => {
    if (typeof window === 'undefined') return normalizar(null, defaultOrder, defaultVisible);
    try {
      const saved = window.localStorage.getItem(storageKey);
      return normalizar(saved ? JSON.parse(saved) : null, defaultOrder, defaultVisible);
    } catch {
      return normalizar(null, defaultOrder, defaultVisible);
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(prefs));
    } catch {
      // sin almacenamiento disponible
    }
  }, [prefs, storageKey]);

  const toggle = useCallback((key: K) => {
    setPrefs((prev) => ({ ...prev, visible: { ...prev.visible, [key]: !prev.visible[key] } }));
  }, []);

  const moveTo = useCallback((from: K, to: K) => {
    setPrefs((prev) => {
      if (from === to) return prev;
      const order = prev.order.filter((k) => k !== from);
      const at = prev.order.indexOf(to);
      order.splice(at, 0, from);
      return { ...prev, order };
    });
  }, []);

  const shift = useCallback((key: K, delta: -1 | 1) => {
    setPrefs((prev) => {
      const i = prev.order.indexOf(key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.order.length) return prev;
      const order = [...prev.order];
      [order[i], order[j]] = [order[j], order[i]];
      return { ...prev, order };
    });
  }, []);

  const reset = useCallback(() => setPrefs(normalizar(null, defaultOrder, defaultVisible)), [defaultOrder, defaultVisible]);

  /** Columnas visibles, en el orden elegido. */
  const visibleOrder = prefs.order.filter((k) => prefs.visible[k]);

  return { order: prefs.order, visible: prefs.visible, visibleOrder, toggle, moveTo, shift, reset };
}

export type ColumnPrefsApi<K extends string> = ReturnType<typeof useColumnPrefs<K>>;

/** Botón "Columnas" con lista para mostrar/ocultar y reordenar (arrastrando o con las flechas). */
export function ColumnMenu<K extends string>({
  labels,
  prefs,
  locked = [],
  align = 'left',
}: {
  labels: Record<K, string>;
  prefs: ColumnPrefsApi<K>;
  /** Columnas que se pueden reordenar pero no ocultar. */
  locked?: K[];
  /** Lado del que se despliega la lista. */
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [dragKey, setDragKey] = useState<K | null>(null);
  const [overKey, setOverKey] = useState<K | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-subtle bg-surface px-2.5 text-[13px] font-semibold text-ink shadow-[var(--hg-shadow-card)] transition hover:bg-surface-muted"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersHorizontal className="h-4 w-4 text-accent-ink" aria-hidden />
        <span>Columnas</span>
      </button>
      {open && (
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-30 mt-2 w-64 space-y-2 rounded-panel border border-line bg-surface p-3 text-xs shadow-sm`}>
          <div className="flex items-center justify-between border-b border-line pb-1">
            <p className="font-semibold text-ink">Columnas visibles</p>
            <button
              type="button"
              onClick={prefs.reset}
              className="inline-flex items-center gap-1 rounded px-1 text-ink-muted hover:text-ink"
              title="Restablecer orden y columnas"
            >
              <RotateCcw className="h-3 w-3" />
              Restablecer
            </button>
          </div>
          <p className="t-caption text-ink-muted">Arrastra o usa las flechas para ordenarlas.</p>
          <ul className="space-y-0.5 text-ink">
            {prefs.order.map((key, idx) => (
              <li
                key={key}
                draggable
                onDragStart={(e) => {
                  setDragKey(key);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overKey !== key) setOverKey(key);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragKey) prefs.moveTo(dragKey, key);
                  setDragKey(null);
                  setOverKey(null);
                }}
                onDragEnd={() => {
                  setDragKey(null);
                  setOverKey(null);
                }}
                className={`flex items-center gap-1 rounded p-1 hover:bg-surface-muted ${
                  overKey === key && dragKey && dragKey !== key ? 'bg-accent-soft' : ''
                } ${dragKey === key ? 'opacity-50' : ''}`}
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-ink-muted" aria-hidden />
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={prefs.visible[key]}
                    disabled={locked.includes(key)}
                    onChange={() => prefs.toggle(key)}
                    className="rounded accent-accent"
                  />
                  <span className="truncate">{labels[key]}</span>
                </label>
                <button
                  type="button"
                  onClick={() => prefs.shift(key, -1)}
                  disabled={idx === 0}
                  aria-label={`Subir ${labels[key]}`}
                  className="rounded p-0.5 text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => prefs.shift(key, 1)}
                  disabled={idx === prefs.order.length - 1}
                  aria-label={`Bajar ${labels[key]}`}
                  className="rounded p-0.5 text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
