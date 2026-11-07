'use client';

import { useMemo, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { ContactRound, FileText, FolderKanban, Search, ShoppingCart } from 'lucide-react';
import { useAuth } from '../lib/context/AuthContext';
import { createClient } from '../lib/supabase/client';
import { navDestinations } from '../lib/navigation';

type Result = { id: string; label: string; detail?: string; href: string; kind: string; icon: typeof Search };

const subscribeNone = () => () => {};

/** `true` en Mac/iOS (atajo ⌘K); en el servidor asume Mac para no cambiar el HTML al hidratar. */
export function useIsMac() {
  return useSyncExternalStore(subscribeNone, () => /Mac|iPhone|iPad/.test(navigator.platform), () => true);
}

/** Buscador ⌘K: secciones y, para el equipo de oficina, clientes y oportunidades. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ q: string; items: Result[] }>({ q: '', items: [] });
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const canSearchRecords = !!currentUser && currentUser.rol !== 'mano_obra';

  const sections: Result[] = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es-CL');
    return navDestinations(currentUser?.rol)
      .filter((item) => !q || `${item.label} ${item.group}`.toLocaleLowerCase('es-CL').includes(q))
      .slice(0, q ? 6 : 8)
      .map((item) => ({ id: item.href, label: item.label, detail: item.group, href: item.href, kind: 'Secciones', icon: item.icon }));
  }, [query, currentUser?.rol]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);

  // Caracteres que rompen la sintaxis de filtros de PostgREST.
  const recordQuery = query.trim().replace(/[,()%*\\]/g, ' ').trim();
  const searchable = canSearchRecords && recordQuery.length >= 2;
  const records = searchable && found.q === recordQuery ? found.items : [];
  const loading = searchable && found.q !== recordQuery;

  useEffect(() => {
    if (!searchable) return;
    const q = recordQuery;
    let alive = true;
    const timer = window.setTimeout(async () => {
      const [clientes, oportunidades, cotizaciones, ordenes] = await Promise.all([
        supabase.from('clientes').select('id, nombre, apellido_razon_social, rut')
          .or(`nombre.ilike.%${q}%,apellido_razon_social.ilike.%${q}%,rut.ilike.%${q}%`).limit(4),
        supabase.from('oportunidades').select('id, codigo, titulo')
          .or(`codigo.ilike.%${q}%,titulo.ilike.%${q}%`).limit(4),
        supabase.from('cotizaciones').select('id, numero_cotizacion, monto_total')
          .ilike('numero_cotizacion', `%${q}%`).limit(3),
        supabase.from('ordenes_compra').select('id, numero_oc, total')
          .ilike('numero_oc', `%${q}%`).limit(3),
      ]);
      if (!alive) return;
      setFound({ q, items: [
        ...(clientes.data ?? []).map((c: { id: string; nombre: string; apellido_razon_social?: string | null; rut?: string | null }) => ({
          id: `c-${c.id}`, kind: 'Clientes', icon: ContactRound, href: `/clientes/${c.id}`,
          label: [c.nombre, c.apellido_razon_social].filter(Boolean).join(' '), detail: c.rut ?? undefined,
        })),
        ...(oportunidades.data ?? []).map((o: { id: string; codigo: string; titulo: string }) => ({
          id: `o-${o.id}`, kind: 'Oportunidades', icon: FolderKanban, href: `/ventas?oportunidad=${o.id}`,
          label: o.titulo, detail: o.codigo,
        })),
        ...(cotizaciones.data ?? []).map((cot: { id: string; numero_cotizacion: string; monto_total: number }) => ({
          id: `cot-${cot.id}`, kind: 'Cotizaciones', icon: FileText, href: '/cotizaciones',
          label: cot.numero_cotizacion, detail: `$${Number(cot.monto_total || 0).toLocaleString('es-CL')}`,
        })),
        ...(ordenes.data ?? []).map((oc: { id: string; numero_oc: string; total: number }) => ({
          id: `oc-${oc.id}`, kind: 'Órdenes de Compra', icon: ShoppingCart, href: '/ordenes-compra',
          label: oc.numero_oc, detail: `$${Number(oc.total || 0).toLocaleString('es-CL')}`,
        })),
      ] });
    }, 200);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [recordQuery, searchable, supabase]);

  const results = [...sections, ...records];
  const activeIndex = Math.min(cursor, Math.max(results.length - 1, 0));

  function go(result?: Result) {
    if (!result) return;
    onClose();
    router.push(result.href);
  }

  function keydown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setCursor((activeIndex + 1) % Math.max(results.length, 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setCursor((activeIndex - 1 + results.length) % Math.max(results.length, 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); go(results[activeIndex]); }
    else if (event.key === 'Tab') event.preventDefault();
  }

  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 p-3 pt-[12vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label="Buscar" className="w-full max-w-xl overflow-hidden rounded-panel border border-line bg-surface shadow-[var(--hg-shadow-popover)]">
      <div className="flex items-center gap-2.5 border-b border-line-subtle px-4">
        <Search size={18} aria-hidden className="shrink-0 text-ink-muted" />
        <input ref={inputRef} role="combobox" aria-expanded="true" aria-controls="hg-palette-list"
          aria-activedescendant={results[activeIndex] ? `hg-palette-${activeIndex}` : undefined}
          value={query} onChange={(event) => { setQuery(event.target.value); setCursor(0); }} onKeyDown={keydown}
          placeholder={canSearchRecords ? 'Buscar clientes, obras, códigos OP o secciones' : 'Buscar una sección'}
          className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted" style={{ outline: 'none' /* el diálogo ya marca el foco */ }} />
        <kbd className="t-micro rounded border border-line px-1.5 text-ink-muted">Esc</kbd>
      </div>
      <ul id="hg-palette-list" role="listbox" aria-label="Resultados" className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
        {results.map((result, index) => {
          const header = result.kind !== results[index - 1]?.kind ? result.kind : null;
          const Icon = result.icon;
          return <li key={result.id} role="presentation">
            {header && <p className="t-caption px-3 pb-1 pt-2.5" aria-hidden>{header}</p>}
            <div id={`hg-palette-${index}`} role="option" aria-selected={index === activeIndex}
              onMouseMove={() => setCursor(index)} onClick={() => go(result)}
              className={clsx('flex cursor-pointer items-center gap-3 rounded-control px-3 py-2 text-sm', index === activeIndex ? 'bg-surface-muted text-ink' : 'text-ink')}>
              <Icon size={16} aria-hidden className="shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate">{result.label}</span>
              {result.detail && <span className={clsx('shrink-0 text-ink-muted', result.kind === 'Oportunidades' ? 'code-stamp' : 't-caption')}>{result.detail}</span>}
            </div>
          </li>;
        })}
        {!results.length && !loading && <li className="px-3 py-6 text-center text-sm text-ink-muted">Sin resultados para “{query}”. Prueba con el nombre del cliente, el RUT o el código OP.</li>}
        {loading && <li className="t-caption px-3 py-2">Buscando registros…</li>}
      </ul>
    </div>
  </div>;
}
