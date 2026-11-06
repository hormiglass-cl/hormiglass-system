'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import clsx from 'clsx';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronsLeft, ChevronsRight, LogOut, Search, X } from 'lucide-react';
import { useAuth } from '../lib/context/AuthContext';
import { createClient } from '../lib/supabase/client';
import { syncSeguimientoNotificaciones } from '../lib/seguimiento-notificaciones';
import { findActiveItem, navGroupsFor } from '../lib/navigation';
import { useIsMac } from './CommandPalette';

/* Navegación: un riel claro (logo, notificaciones, ajustes, salir) y, a su lado, un panel
   flotante oscuro con la escena de las pantallas de acceso (Fase A): carbón de marca, trama de
   puntos y brillo naranja de horizonte. Buscador arriba, grupos plegables con guía vertical y
   la sección activa como píldora naranja. Contraer deja solo el riel. */

const STORAGE_KEY = 'hg.sidebar';

function readPrefs(): { collapsed?: boolean; closedGroups?: string[] } {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function writePrefs(prefs: { collapsed: boolean; closedGroups: string[] }) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* sin almacenamiento: no se recuerda */ }
}

const DEFAULT_CLOSED_GROUPS = ['inicio', 'comercial', 'compras', 'calendarios', 'finanzas', 'administracion', 'sistema'];

const GLASS_BUTTON =
  'grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-night-muted transition-colors hover:bg-white/10 hover:text-night-ink';

const LOGO_TILE =
  'grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-gradient-to-br from-accent-soft via-accent-line to-accent shadow-[0_10px_24px_-10px_rgb(247_147_31/0.8),inset_0_1px_0_rgb(255_255_255/0.8)] ring-1 ring-white/40';

export function Sidebar({
  mobileOpen = false,
  onMobileClose,
  onNavigate,
  onSearch,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onNavigate?: () => void;
  onSearch?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const isMac = useIsMac();
  const groups = useMemo(() => navGroupsFor(currentUser?.rol), [currentUser?.rol]);
  const active = findActiveItem(pathname, searchParams.get('empresa'), currentUser?.rol);

  const [collapsed, setCollapsed] = useState(false);
  // Por defecto, todos los grupos colapsables inician contraídos a menos que el usuario guarde preferencias
  const [closedGroups, setClosedGroups] = useState<string[]>(DEFAULT_CLOSED_GROUPS);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingAbonosCount, setPendingAbonosCount] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const prefs = readPrefs();
    if (typeof prefs.collapsed === 'boolean') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia guardada en localStorage: solo se puede leer tras hidratar
      setCollapsed(prefs.collapsed);
    }
    if (Array.isArray(prefs.closedGroups)) {
      setClosedGroups(prefs.closedGroups);
    }
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onMobileClose?.(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [mobileOpen, onMobileClose]);

  useEffect(() => {
    if (!currentUser?.id) return;
    let alive = true;
    const userId = currentUser.id;

    async function refreshCount() {
      const { count } = await supabase.from('notificaciones').select('id', { count: 'exact', head: true })
        .eq('usuario_id', userId).eq('leido', false);
      if (alive) setUnreadCount(count || 0);
    }

    // Sincronizar seguimientos una sola vez al inicio de sesión de forma desacoplada
    void syncSeguimientoNotificaciones(supabase, userId);
    void refreshCount();

    const interval = window.setInterval(refreshCount, 60_000);
    const channel = supabase.channel(`sidebar_notifs_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${userId}` }, refreshCount)
      .subscribe();
    return () => { alive = false; window.clearInterval(interval); void supabase.removeChannel(channel); };
  }, [currentUser?.id, supabase]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const isFinanzasAdmin = ['admin', 'finanzas'].includes(currentUser.rol || '');
    if (!isFinanzasAdmin) return;
    let alive = true;

    async function refreshPendingAbonos() {
      const { count } = await supabase
        .from('abonos')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'pendiente');
      if (alive) setPendingAbonosCount(count || 0);
    }

    void refreshPendingAbonos();
    const interval = window.setInterval(refreshPendingAbonos, 60_000);
    const channel = supabase.channel('sidebar_abonos_pendientes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'abonos' }, refreshPendingAbonos)
      .subscribe();

    return () => {
      alive = false;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [currentUser?.id, currentUser?.rol, supabase]);

  if (pathname === '/login' || pathname.startsWith('/auth')) return null;

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    writePrefs({ collapsed: next, closedGroups });
  }

  function openGroup(id: string) {
    const next = closedGroups.filter((g) => g !== id);
    setClosedGroups(next);
    setCollapsed(false);
    writePrefs({ collapsed: false, closedGroups: next });
    // Abre la primera pestaña de la carpeta.
    const first = groups.find((g) => g.id === id)?.items[0];
    if (first && first !== active?.item) {
      onNavigate?.();
      router.push(first.href);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace('/login');
    router.refresh();
  }

  function toggleGroup(id: string) {
    const next = closedGroups.includes(id) ? closedGroups.filter((g) => g !== id) : [...closedGroups, id];
    setClosedGroups(next);
    writePrefs({ collapsed, closedGroups: next });
  }

  const compact = collapsed && !mobileOpen;
  const homeItems = groups.find((g) => g.id === 'inicio')?.items ?? [];
  const navGroups = groups.filter((g) => g.id !== 'sistema' && g.id !== 'inicio');
  const systemItems = groups.find((g) => g.id === 'sistema')?.items ?? [];

  function itemBadge(href: string) {
    if (href === '/notificaciones') return unreadCount;
    if (href === '/caja' && ['admin', 'finanzas'].includes(currentUser?.rol || '')) return pendingAbonosCount;
    return 0;
  }

  function renderLink(item: (typeof systemItems)[number]) {
    const Icon = item.icon;
    const isActive = item === active?.item;
    const badge = itemBadge(item.href);
    const isCaja = item.href === '/caja';
    return (
      <Link
        href={item.href}
        prefetch={true}
        title={compact ? item.label : undefined}
        aria-label={compact ? item.label : undefined}
        onClick={() => { onMobileClose?.(); if (!isActive) onNavigate?.(); }}
        aria-current={isActive ? 'page' : undefined}
        className={clsx(
          'relative flex min-h-10 items-center rounded-xl text-[13px] font-medium transition-colors',
          compact ? 'mx-auto w-11 justify-center' : 'gap-3 px-3 py-2',
          isActive
            ? 'bg-accent font-semibold text-on-accent shadow-[0_10px_24px_-12px_rgb(247_147_31/0.9),inset_0_1px_0_rgb(255_255_255/0.35)]'
            : 'text-night-muted hover:bg-white/[0.08] hover:text-night-ink',
        )}
      >
        <Icon size={18} aria-hidden className="shrink-0" />
        {!compact && <span className="truncate">{item.label}</span>}
        {badge > 0 && (
          <span className={clsx(
            't-micro t-num rounded-full px-1.5',
            compact ? 'absolute -right-0.5 -top-0.5 min-w-4 text-center' : 'ml-auto',
            isActive ? 'bg-on-accent text-night-ink' : 'bg-accent text-on-accent',
          )}>
            {badge > 99 ? '99+' : badge}
            <span className="sr-only">{isCaja ? ' abonos pendientes de validar' : ' sin leer'}</span>
          </span>
        )}
      </Link>
    );
  }

  return <>
    {mobileOpen && <button className="fixed inset-0 z-40 bg-night-deep/50 md:hidden" aria-label="Cerrar menú" onClick={onMobileClose} />}
    <aside className={clsx(
      'hg-app-sidebar hg-night fixed inset-y-0 left-0 z-50 isolate flex w-[272px] flex-col overflow-hidden border-r border-white/10 bg-[linear-gradient(180deg,var(--hg-night-top)_0%,var(--hg-night)_55%,var(--hg-night-deep)_100%)] transition-[width,transform] duration-200 md:sticky md:top-0 md:h-screen',
      collapsed ? 'md:w-[76px]' : 'md:w-[272px]',
      mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
    )}>
      {/* Trama de puntos que se desvanece hacia abajo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-70 [background-image:radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [background-size:20px_20px] [mask-image:linear-gradient(to_bottom,black,transparent_60%)]"
      />
      {/* Horizonte: arco naranja con halo al pie */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[88%] -z-10 h-[60%] w-[200%] -translate-x-1/2 rounded-[50%] bg-night-deep bg-[radial-gradient(ellipse_at_50%_0%,rgb(247_147_31/0.26),rgb(247_147_31/0.05)_40%,transparent_65%)] shadow-[inset_0_2px_0_rgb(255_196_128/0.5),0_-10px_50px_rgb(247_147_31/0.28)]"
      />

      <div className={clsx('flex shrink-0 items-center gap-2.5 pb-3 pt-4', compact ? 'flex-col px-2' : 'px-4')}>
        <Link
          href="/"
          onClick={() => { onMobileClose?.(); if (pathname !== '/') onNavigate?.(); }}
          className={LOGO_TILE}
          aria-label="Hormiglass, ir al panel operativo"
        >
          <Image src="/logo-only-h-removebg-preview.png" alt="" width={26} height={26} className="h-[26px] w-[26px] object-contain" />
        </Link>
        {!compact && <span className="flex-1 truncate text-[16px] font-bold tracking-tight text-night-ink">Hormiglass</span>}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Mostrar barra lateral' : 'Contraer barra lateral'}
          title={collapsed ? 'Mostrar barra lateral' : 'Contraer barra lateral'}
          className={clsx(GLASS_BUTTON, 'hidden md:grid')}
        >
          {collapsed ? <ChevronsRight size={17} aria-hidden /> : <ChevronsLeft size={17} aria-hidden />}
        </button>
        <button type="button" onClick={onMobileClose} aria-label="Cerrar menú" className={clsx(GLASS_BUTTON, 'md:hidden')}>
          <X size={17} aria-hidden />
        </button>
      </div>

      <div className={clsx('shrink-0 pb-3', compact ? 'px-2' : 'px-4')}>
        <button
          type="button"
          onClick={() => { onMobileClose?.(); onSearch?.(); }}
          aria-label="Buscar"
          title={compact ? 'Buscar' : undefined}
          aria-keyshortcuts="Meta+K Control+K"
          className={clsx(
            'flex h-10 items-center rounded-xl border border-white/12 bg-white/[0.06] text-left text-[13px] text-night-soft transition-colors hover:border-white/25 hover:bg-white/10',
            compact ? 'mx-auto w-11 justify-center' : 'w-full gap-2.5 px-3',
          )}
        >
          <Search size={16} aria-hidden className="shrink-0" />
          {!compact && <>
            <span className="flex-1 truncate">Buscar</span>
            <kbd className="rounded-md border border-white/15 px-1.5 font-sans text-[11px] text-night-soft">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </>}
        </button>
      </div>

      <nav
        aria-label="Navegación principal"
        className={clsx('flex-1 overflow-y-auto pb-4 pt-1 [scrollbar-color:rgb(255_255_255/0.18)_transparent] [scrollbar-width:thin]', compact ? 'px-2' : 'px-3')}
      >
        {/* Panel operativo: ítem suelto, sin carpeta */}
        {homeItems.length > 0 && (
          <ul className={clsx('space-y-1', compact ? 'mb-1' : 'mb-3')}>
            {homeItems.map((item) => <li key={item.href}>{renderLink(item)}</li>)}
          </ul>
        )}
        {compact ? (
          <ul className="space-y-1">
            {navGroups.map((group) => {
              const GroupIcon = group.icon;
              const hasActive = group.items.some((item) => item === active?.item);
              return <li key={group.id}>
                <button
                  type="button"
                  onClick={() => openGroup(group.id)}
                  title={group.label}
                  aria-label={`${group.label}: abrir barra lateral`}
                  className={clsx(
                    'mx-auto flex h-10 w-11 items-center justify-center rounded-xl transition-colors',
                    hasActive
                      ? 'bg-accent text-on-accent shadow-[0_10px_24px_-12px_rgb(247_147_31/0.9),inset_0_1px_0_rgb(255_255_255/0.35)]'
                      : 'text-night-muted hover:bg-white/[0.08] hover:text-night-ink',
                  )}
                >
                  <GroupIcon size={18} aria-hidden />
                </button>
              </li>;
            })}
          </ul>
        ) : navGroups.map((group) => {
          const isCollapsible = group.collapsible !== false;
          const groupOpen = !(isCollapsible && closedGroups.includes(group.id));
          const hasActiveItem = group.items.some((item) => item === active?.item);

          return <div key={group.id} className="mb-2">
            {isCollapsible ? (
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={groupOpen}
                aria-controls={`sidebar-group-${group.id}`}
                className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[12px] font-semibold text-night-soft transition-colors hover:bg-white/[0.06] hover:text-night-muted"
              >
                <span className="flex items-center gap-1.5 truncate">
                  {group.label}
                  {!groupOpen && hasActiveItem && (
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Contiene la página activa" aria-hidden />
                  )}
                </span>
                <ChevronDown size={14} aria-hidden className={clsx('shrink-0 transition-transform duration-200', !groupOpen && '-rotate-90')} />
              </button>
            ) : (
              <h2 className="mb-1 px-3 py-1.5 text-[12px] font-semibold text-night-soft">{group.label}</h2>
            )}
            {groupOpen && (
              <ul id={`sidebar-group-${group.id}`} className="hg-accordion-enter ml-[18px] space-y-0.5 border-l border-white/10 pl-2.5">
                {group.items.map((item) => <li key={item.href}>{renderLink(item)}</li>)}
              </ul>
            )}
          </div>;
        })}
      </nav>

      {/* Sistema: siempre a la vista, fuera de los grupos */}
      <ul aria-label="Sistema" className={clsx('shrink-0 space-y-1 border-t border-white/10 py-3', compact ? 'px-2' : 'px-3')}>
        {systemItems.map((item) => <li key={item.href}>{renderLink(item)}</li>)}
        <li>
          <button
            type="button"
            onClick={handleLogout}
            title={compact ? 'Cerrar sesión' : undefined}
            aria-label="Cerrar sesión"
            className={clsx(
              'flex min-h-10 items-center rounded-xl text-[13px] font-medium text-night-muted transition-colors hover:bg-white/[0.08] hover:text-night-ink',
              compact ? 'mx-auto w-11 justify-center' : 'w-full gap-3 px-3 py-2',
            )}
          >
            <LogOut size={18} aria-hidden className="shrink-0" />
            {!compact && <span className="truncate">Cerrar sesión</span>}
          </button>
        </li>
      </ul>
    </aside>
  </>;
}
