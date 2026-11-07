'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, LogOut, Menu, Settings2, UserRound } from 'lucide-react';
import { useAuth } from '../lib/context/AuthContext';
import { useBreadcrumb } from '../lib/context/BreadcrumbContext';
import { ROL_NOMBRE } from '../lib/types';
import { findActiveItem } from '../lib/navigation';

/** Rutas que no están en la barra lateral. */
const EXTRA_TITLES: Record<string, string> = {
  '/diseno': 'Sistema de diseño',
  '/recordatorios': 'Recordatorios',
};

export function Navbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();

  const { customTitle, onBack } = useBreadcrumb();

  if (pathname === '/login' || pathname.startsWith('/auth')) return null;

  const active = findActiveItem(pathname, searchParams.get('empresa'), currentUser?.rol);
  const crumbs: { label: string; href?: string; onAction?: () => void }[] = [];
  const desdeOp = pathname.startsWith('/clientes/') ? searchParams.get('desde') : null;
  if (desdeOp) {
    // Se llegó a la tarjeta del cliente desde una oportunidad: el menú permite volver al pipeline o a la oportunidad.
    const ventas = findActiveItem('/ventas', null, currentUser?.rol);
    if (ventas) crumbs.push({ label: ventas.group.label });
    crumbs.push({ label: 'Pipeline de ventas', href: '/ventas' });
    crumbs.push({ label: searchParams.get('desdeTitulo') || 'Oportunidad', href: `/ventas?oportunidad=${encodeURIComponent(desdeOp)}` });
    crumbs.push({ label: customTitle || 'Cliente' });
  } else if (active) {
    crumbs.push({ label: active.group.label });
    const [itemPath] = active.item.href.split('?');
    const deeper = (pathname !== itemPath && itemPath !== '/' && pathname.startsWith(`${itemPath}/`)) || Boolean(customTitle);
    crumbs.push({
      label: active.item.label,
      href: deeper ? active.item.href : undefined,
      onAction: deeper && onBack ? onBack : undefined,
    });
    if (customTitle) {
      crumbs.push({ label: customTitle });
    } else if (deeper) {
      crumbs.push({ label: EXTRA_TITLES[pathname] ?? 'Detalle' });
    }
  } else if (pathname !== '/') {
    crumbs.push({ label: customTitle || (EXTRA_TITLES[pathname] ?? 'Hormiglass') });
  }

  return <header className="hg-app-header sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-app/90 px-4 backdrop-blur-sm sm:px-6">
    <button type="button" onClick={onMenuClick} aria-label="Abrir menú" className="-ml-2 grid h-9 w-9 place-items-center rounded-control text-ink-muted hover:bg-surface-muted md:hidden"><Menu size={20} aria-hidden /></button>

    <nav aria-label="Ubicación" className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return <li key={`${crumb.label}-${index}`} className={clsx('flex min-w-0 items-center gap-1.5', !last && 'hidden sm:flex')}>
            {index > 0 && <ChevronRight size={14} aria-hidden className="shrink-0 text-ink-muted" />}
            {crumb.href
              ? <Link
                  href={crumb.href}
                  prefetch={true}
                  onClick={(e) => {
                    if (crumb.onAction) {
                      e.preventDefault();
                      crumb.onAction();
                    }
                  }}
                  className="truncate text-ink-muted hover:text-ink hover:underline"
                >
                  {crumb.label}
                </Link>
              : <span className={clsx('truncate', last ? 'font-semibold text-ink' : 'text-ink-muted')} aria-current={last ? 'page' : undefined}>{crumb.label}</span>}
          </li>;
        })}
      </ol>
    </nav>

    <UserMenu />

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

  return <div ref={ref} className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open} aria-label={`Cuenta de ${currentUser?.nombre ?? 'usuario'}`}
      className="ml-1 grid h-9 w-9 place-items-center rounded-full">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent-ink ring-1 ring-accent-line"><UserRound size={17} aria-hidden /></span>
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
