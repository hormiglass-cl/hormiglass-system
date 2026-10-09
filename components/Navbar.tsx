'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Bell, ChevronRight, ContactRound, FolderKanban, LogOut, Menu, Search, Settings2 } from 'lucide-react';
import { useAuth } from '../lib/context/AuthContext';
import { createClient } from '../lib/supabase/client';
import { ROL_NOMBRE } from '../lib/types';
import { findActiveItem, navDestinations } from '../lib/navigation';

/** Rutas que no están en la barra lateral. */
const EXTRA_TITLES: Record<string, string> = {
  '/diseno': 'Sistema de diseño',
  '/recordatorios': 'Recordatorios',
  '/ordenes-compra/nuevo': 'Nueva orden de compra',
  '/cotizaciones/nuevo': 'Nueva cotización',
};

type Result = { id: string; label: string; detail?: string; href: string; kind: string; icon: typeof Search };

export function Navbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la plataforma solo se conoce en el cliente
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
    function keydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

  if (pathname === '/login' || pathname.startsWith('/auth')) return null;

  const active = findActiveItem(pathname, searchParams.get('empresa'), currentUser?.rol);
  const crumbs: { label: string; href?: string }[] = [];
  if (active) {
    crumbs.push({ label: active.group.label });
    const [itemPath] = active.item.href.split('?');
    const deeper = pathname !== itemPath && itemPath !== '/' && pathname.startsWith(`${itemPath}/`);
    crumbs.push({ label: active.item.label, href: deeper ? active.item.href : undefined });
    if (deeper) crumbs.push({ label: EXTRA_TITLES[pathname] ?? 'Detalle' });
  } else if (pathname !== '/') {
    crumbs.push({ label: EXTRA_TITLES[pathname] ?? 'Hormiglass' });
  }

  return <header className="hg-app-header sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/95 px-4 backdrop-blur-sm sm:px-6">
    <button type="button" onClick={onMenuClick} aria-label="Abrir menú" className="-ml-2 grid h-9 w-9 place-items-center rounded-control text-ink-muted hover:bg-surface-muted md:hidden"><Menu size={20} aria-hidden /></button>

    <nav aria-label="Ubicación" className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return <li key={`${crumb.label}-${index}`} className={clsx('flex min-w-0 items-center gap-1.5', !last && 'hidden sm:flex')}>
            {index > 0 && <ChevronRight size={14} aria-hidden className="shrink-0 text-ink-muted" />}
            {crumb.href
              ? <Link href={crumb.href} className="truncate text-ink-muted hover:text-ink hover:underline">{crumb.label}</Link>
              : <span className={clsx('truncate', last ? 'font-semibold text-ink' : 'text-ink-muted')} aria-current={last ? 'page' : undefined}>{crumb.label}</span>}
          </li>;
        })}
      </ol>
    </nav>

    <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Buscar" aria-keyshortcuts="Meta+K Control+K"
      className="hidden h-9 w-64 items-center gap-2 rounded-control border border-line bg-app px-3 text-left text-[13px] text-ink-muted transition-colors hover:border-ink-muted lg:flex">
      <Search size={16} aria-hidden />
      <span className="flex-1 truncate">Buscar clientes u obras</span>
      <kbd className="t-micro rounded border border-line bg-surface px-1.5 font-sans">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
    <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Buscar" className="grid h-9 w-9 place-items-center rounded-control text-ink-muted hover:bg-surface-muted lg:hidden"><Search size={19} aria-hidden /></button>

    <Link href="/notificaciones" aria-label="Notificaciones" title="Notificaciones" className="grid h-9 w-9 place-items-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink"><Bell size={19} aria-hidden /></Link>
    <UserMenu />

    {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
  </header>;
}

function UserMenu() {
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isFieldWorker = currentUser?.rol === 'mano_obra';

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    await logout();
    router.replace('/login');
    router.refresh();
  }

  const initial = currentUser?.nombre?.charAt(0)?.toUpperCase() || 'H';
  return <div ref={ref} className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open} aria-label={`Cuenta de ${currentUser?.nombre ?? 'usuario'}`}
      className="ml-1 grid h-9 w-9 place-items-center rounded-full">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent-ink ring-1 ring-accent-line">{initial}</span>
    </button>
    {open && <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-60 rounded-panel border border-line bg-surface p-1 shadow-[var(--hg-shadow-popover)]">
      <div className="border-b border-line-subtle px-3 pb-2.5 pt-2">
        <p className="truncate text-sm font-semibold text-ink">{currentUser?.nombre}</p>
        <p className="t-caption truncate">{currentUser ? `${ROL_NOMBRE[currentUser.rol] ?? currentUser.rol} · ${currentUser.email}` : ''}</p>
      </div>
      {!isFieldWorker && <Link role="menuitem" href="/configuracion" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-control px-3 py-2 text-sm text-ink hover:bg-surface-muted"><Settings2 size={16} aria-hidden />Configuración</Link>}
      <button role="menuitem" type="button" onClick={handleLogout} className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm text-ink hover:bg-surface-muted"><LogOut size={16} aria-hidden />Cerrar sesión</button>
    </div>}
  </div>;
}

/** Buscador ⌘K: secciones y, para el equipo de oficina, clientes y oportunidades. */
function CommandPalette({ onClose }: { onClose: () => void }) {
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
      const [clientes, oportunidades] = await Promise.all([
        supabase.from('clientes').select('id, nombre, apellido_razon_social, rut')
          .or(`nombre.ilike.%${q}%,apellido_razon_social.ilike.%${q}%,rut.ilike.%${q}%`).limit(5),
        supabase.from('oportunidades').select('id, codigo, titulo')
          .or(`codigo.ilike.%${q}%,titulo.ilike.%${q}%`).limit(5),
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
