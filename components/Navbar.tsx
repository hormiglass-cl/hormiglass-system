'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, CalendarDays, Menu, Search, X } from 'lucide-react';
import { useAuth } from '../lib/context/AuthContext';

const destinations = [
  ['Panel operativo', '/'], ['Pipeline de ventas', '/ventas'],
  ['Planificación', '/planificacion'], ['Reventa', '/reventa'],
  ['Clientes', '/clientes'], ['Cotizaciones', '/cotizaciones'],
  ['Órdenes de compra', '/ordenes-compra'], ['Proveedores', '/proveedores'],
  ['Productos e insumos', '/productos'],
  ['Calendario general', '/calendarios/general'], ['Visitas a terreno', '/visitas'],
  ['Producción y logística', '/planificacion/calendario'], ['Programa semanal', '/planificacion/semana'],
  ['Reventa y logística', '/reventa/calendario'], ['Caja', '/caja'], ['Reportes', '/reportes'],
  ['Administración', '/administracion'], ['Recursos humanos', '/rrhh'],
  ['Recordatorios', '/recordatorios'], ['Notificaciones', '/notificaciones'],
  ['Configuración', '/configuracion'],
] as const;

export function Navbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser } = useAuth();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isFieldWorker = currentUser?.rol === 'mano_obra';
  const allowed = useMemo(() => destinations.filter(([, href]) =>
    !isFieldWorker || ['/rrhh', '/recordatorios', '/notificaciones', '/visitas', '/calendarios/general', '/planificacion/calendario', '/planificacion/semana', '/reventa/calendario', '/administracion'].includes(href)
  ), [isFieldWorker]);
  const results = allowed.filter(([label]) => label.toLocaleLowerCase('es-CL').includes(query.toLocaleLowerCase('es-CL'))).slice(0, 7);
  const current = [...allowed].sort((a, b) => b[1].length - a[1].length)
    .find(([, href]) => href === pathname || (href !== '/' && pathname.startsWith(`${href}/`)))?.[0] || 'Hormiglass';

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (event.key === 'Escape') setSearchOpen(false);
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

  if (pathname === '/login' || pathname.startsWith('/auth')) return null;

  function navigate(href: string) {
    setSearchOpen(false);
    setQuery('');
    router.push(href);
  }

  return <header className="hg-app-header sticky top-0 z-30 flex h-[72px] shrink-0 items-center gap-3 border-b border-[#e5e7e4] bg-white/95 px-4 backdrop-blur-sm sm:px-6">
    <button onClick={onMenuClick} aria-label="Abrir menú" className="rounded-lg p-2 text-[#66716f] hover:bg-[#f4f5f3] md:hidden"><Menu size={20} /></button>
    <div className="min-w-0 flex-1">
      <p className="hg-overline hidden sm:block">Hormiglass / CRM</p>
      <p className="truncate text-base font-bold tracking-tight">{current}</p>
    </div>
    <button onClick={() => setSearchOpen(true)} aria-label="Buscar sección" className="rounded-lg p-2 text-[#66716f] hover:bg-[#f4f5f3] lg:hidden"><Search size={19} /></button>
    <div className="relative hidden w-64 lg:block">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9390]" />
      <input ref={inputRef} aria-label="Buscar sección" placeholder="Ir a una sección…"
        className="hg-field pl-9 pr-12" value={query}
        onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
        onKeyDown={(event) => { if (event.key === 'Enter' && results[0]) navigate(results[0][1]); }} />
      <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[#e5e7e4] px-1.5 text-[10px] text-[#8a9390]">⌘K</kbd>
      {searchOpen && <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-[#e5e7e4] bg-white p-1 shadow-[var(--hg-shadow-popover)]">
        {results.length ? results.map(([label, href]) => <button key={href} onMouseDown={(event) => event.preventDefault()} onClick={() => navigate(href)}
          className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f4f5f3]">{label}</button>)
          : <p className="p-3 text-xs text-[#66716f]">No se encontró esa sección.</p>}
        <button onClick={() => setSearchOpen(false)} className="w-full border-t border-[#e5e7e4] px-3 py-2 text-right text-xs text-[#66716f]">Cerrar</button>
      </div>}
    </div>
    <Link href="/calendarios/general" aria-label="Abrir calendario" title="Calendario" className="rounded-lg p-2 text-[#66716f] hover:bg-[#f4f5f3]"><CalendarDays size={19} /></Link>
    <Link href="/notificaciones" aria-label="Abrir notificaciones" title="Notificaciones" className="rounded-lg p-2 text-[#66716f] hover:bg-[#f4f5f3]"><Bell size={19} /></Link>
    <div className="grid h-8 w-8 place-items-center rounded-full bg-[#fff1e7] text-xs font-bold text-[#bd5b18]" title={currentUser?.nombre}>{currentUser?.nombre?.charAt(0) || 'H'}</div>
    {searchOpen && <button className="fixed inset-0 -z-10 hidden lg:block" aria-label="Cerrar búsqueda" onClick={() => setSearchOpen(false)}><X className="sr-only" /></button>}
    {searchOpen && <div className="fixed inset-0 z-50 bg-black/30 p-3 lg:hidden" onClick={() => setSearchOpen(false)}>
      <div className="rounded-xl bg-white p-3 shadow-[var(--hg-shadow-popover)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2"><Search size={17} className="text-[#66716f]" /><input autoFocus aria-label="Buscar sección" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ir a una sección…" className="hg-field flex-1" /><button onClick={() => setSearchOpen(false)} aria-label="Cerrar búsqueda"><X size={18} /></button></div>
        <div className="mt-2 max-h-80 overflow-y-auto">{results.length ? results.map(([label, href]) => <button key={href} onClick={() => navigate(href)} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f4f5f3]">{label}</button>) : <p className="p-3 text-xs text-[#66716f]">No se encontró esa sección.</p>}</div>
      </div>
    </div>}
  </header>;
}
