'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import clsx from 'clsx';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useAuth } from '../lib/context/AuthContext';
import { createClient } from '../lib/supabase/client';
import { syncSeguimientoNotificaciones } from '../lib/seguimiento-notificaciones';
import { findActiveItem, navGroupsFor } from '../lib/navigation';

const STORAGE_KEY = 'hg.sidebar';

function readPrefs(): { collapsed?: boolean; closedGroups?: string[] } {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function writePrefs(prefs: { collapsed: boolean; closedGroups: string[] }) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* sin almacenamiento: no se recuerda */ }
}

export function Sidebar({ mobileOpen = false, onMobileClose }: { mobileOpen?: boolean; onMobileClose?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [closedGroups, setClosedGroups] = useState<string[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = useMemo(() => createClient(), []);
  const groups = navGroupsFor(currentUser?.rol);
  const active = findActiveItem(pathname, searchParams.get('empresa'), currentUser?.rol);

  useEffect(() => {
    const prefs = readPrefs();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencias locales solo disponibles en el cliente
    setCollapsed(!!prefs.collapsed);
    setClosedGroups(prefs.closedGroups ?? []);
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
    async function refresh() {
      await syncSeguimientoNotificaciones(supabase, userId);
      const { count } = await supabase.from('notificaciones').select('id', { count: 'exact', head: true })
        .eq('usuario_id', userId).eq('leido', false);
      if (alive) setUnreadCount(count || 0);
    }
    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    const channel = supabase.channel(`sidebar_notifs_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { alive = false; window.clearInterval(interval); void supabase.removeChannel(channel); };
  }, [currentUser?.id, supabase]);

  if (pathname === '/login' || pathname.startsWith('/auth')) return null;

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    writePrefs({ collapsed: next, closedGroups });
  }

  function toggleGroup(id: string) {
    const next = closedGroups.includes(id) ? closedGroups.filter((g) => g !== id) : [...closedGroups, id];
    setClosedGroups(next);
    writePrefs({ collapsed, closedGroups: next });
  }

  return <>
    {mobileOpen && <button className="fixed inset-0 z-40 bg-ink/30 md:hidden" aria-label="Cerrar menú" onClick={onMobileClose} />}
    <aside className={clsx(
      'hg-app-sidebar fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line bg-app transition-[width,transform] duration-200 md:sticky md:top-0 md:h-screen',
      collapsed ? 'md:w-[72px]' : 'md:w-[240px]',
      'w-[264px]',
      mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
    )}>
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
        <Link href="/" onClick={onMobileClose} className="flex min-w-0 items-center gap-2.5" aria-label="Hormiglass, ir al panel operativo">
          <Image src="/logo-only-h-removebg-preview.png" alt="" width={32} height={32} className="h-8 w-8 shrink-0 object-contain" />
          <span className={clsx('truncate text-[15px] font-bold tracking-tight text-ink', collapsed && 'md:hidden')}>Hormiglass</span>
        </Link>
        <button type="button" onClick={onMobileClose} aria-label="Cerrar menú" className="grid h-9 w-9 place-items-center rounded-control text-ink-muted hover:bg-surface-muted md:hidden"><X size={18} aria-hidden /></button>
      </div>

      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {groups.map((group) => {
          const isCollapsible = group.collapsible !== false;
          const isClosed = isCollapsible && closedGroups.includes(group.id);
          const groupOpen = collapsed || !isClosed;
          const hasActiveItem = group.items.some((item) => item === active?.item);

          return <div key={group.id} className="mb-3">
            <div className={clsx(collapsed && 'md:hidden')}>
              {isCollapsible ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={groupOpen}
                  aria-controls={`sidebar-group-${group.id}`}
                  className="t-caption mb-1 flex w-full items-center justify-between rounded-control px-3 py-1.5 text-left transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="flex items-center gap-1.5 truncate font-medium">
                    {group.label}
                    {!groupOpen && hasActiveItem && (
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                        title="Contiene la página activa"
                        aria-hidden
                      />
                    )}
                  </span>
                  <ChevronDown
                    size={14}
                    aria-hidden
                    className={clsx(
                      'shrink-0 text-ink-muted transition-transform duration-200',
                      !groupOpen && '-rotate-90',
                    )}
                  />
                </button>
              ) : (
                <h2 className="t-caption mb-1 px-3 py-1.5 font-medium">{group.label}</h2>
              )}
            </div>
            {collapsed && <div className="mx-3 mb-2 hidden border-t border-line md:block" aria-hidden />}
            {groupOpen && (
              <ul id={`sidebar-group-${group.id}`} className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item === active?.item;
                  const badge = item.href === '/notificaciones' && unreadCount > 0 ? unreadCount : 0;
                  return <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onMobileClose}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      className={clsx(
                        'relative flex min-h-9 items-center gap-3 rounded-control px-3 py-2 text-[13px] font-medium transition-colors',
                        collapsed && 'md:justify-center',
                        isActive ? 'bg-surface-muted font-semibold text-ink' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                      )}
                    >
                      {isActive && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-accent" />}
                      <Icon size={18} aria-hidden className={isActive ? 'text-ink' : 'text-ink-muted'} />
                      <span className={clsx('truncate', collapsed && 'md:sr-only')}>{item.label}</span>
                      {badge > 0 && <span className={clsx(
                        't-micro t-num rounded-full bg-accent px-1.5 text-on-accent',
                        collapsed ? 'absolute right-1.5 top-1' : 'ml-auto',
                      )}>{badge}<span className="sr-only"> sin leer</span></span>}
                    </Link>
                  </li>;
                })}
              </ul>
            )}
          </div>;
        })}
      </nav>

      <div className="hidden shrink-0 border-t border-line p-3 md:block">
        <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? 'Mostrar barra lateral' : 'Contraer barra lateral'} title={collapsed ? 'Mostrar barra lateral' : 'Contraer barra lateral'}
          className={clsx('flex min-h-9 w-full items-center gap-3 rounded-control px-3 text-[13px] font-medium text-ink-muted hover:bg-surface-muted hover:text-ink', collapsed && 'justify-center')}>
          {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <><PanelLeftClose size={18} aria-hidden />Contraer</>}
        </button>
      </div>
    </aside>
  </>;
}
